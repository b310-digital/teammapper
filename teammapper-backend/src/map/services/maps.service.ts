import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, QueryFailedError, QueryRunner, In } from 'typeorm'
import { MmpMap } from '../entities/mmpMap.entity'
import { MmpNode } from '../entities/mmpNode.entity'
import {
  IMmpClientMap,
  IMmpClientMapOptions,
  IMmpClientNode,
  IMmpClientNodeBasics,
  IMmpClientMapDiff,
  IMmpClientSnapshotChanges,
  IMmpClientMapInfo,
  ValidationErrorResponse,
} from '../types'
import {
  mapClientBasicNodeToMmpRootNode,
  mapClientNodeToMmpNode,
  mapMmpMapToClient,
  mergeClientNodeIntoMmpNode,
} from '../utils/clientServerMapping'
import {
  shouldValidateParent,
  createParentNotFoundWarning,
} from '../utils/nodeValidation'
import configService from '../../config.service'
import { validate as uuidValidate } from 'uuid'
import MalformedUUIDError from './uuid.error'

@Injectable()
export class MapsService {
  private readonly logger = new Logger(MapsService.name)

  // PostgreSQL error codes for constraint violations
  private static readonly PG_FOREIGN_KEY_VIOLATION = '23503'
  private static readonly PG_UNIQUE_VIOLATION = '23505'
  private static readonly PG_CHECK_VIOLATION = '23514'

  constructor(
    @InjectRepository(MmpNode)
    private nodesRepository: Repository<MmpNode>,
    @InjectRepository(MmpMap)
    private mapsRepository: Repository<MmpMap>
  ) {}

  /**
   * Checks if an error is a database constraint violation
   * Detects PostgreSQL constraint errors: foreign key violations, unique violations, and check violations
   * @param error The error to classify
   * @returns true if the error is a constraint violation, false otherwise
   */
  private isConstraintError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false
    }

    // Check for foreign key constraint violations (PostgreSQL error codes)
    const pgError = error.driverError as { code?: string }
    return (
      pgError?.code === MapsService.PG_FOREIGN_KEY_VIOLATION ||
      pgError?.code === MapsService.PG_UNIQUE_VIOLATION ||
      pgError?.code === MapsService.PG_CHECK_VIOLATION
    )
  }

  /**
   * Finds the root node for a given map
   */
  private async findRootNode(mapId: string): Promise<MmpNode | null> {
    return await this.nodesRepository.findOne({
      where: { nodeMapId: mapId, root: true },
    })
  }

  async getMapsOfUser(userId: string): Promise<IMmpClientMapInfo[]> {
    if (!userId) return [];
    const mapsOfUser = await this.mapsRepository.find({
      where: { owner: userId },
    })

    const mapsInfo: IMmpClientMapInfo[] = await Promise.all(
      mapsOfUser.map(async (map:MmpMap) => {
        return {
          uuid: map.id,
          adminId: map.adminId,
          modificationSecret: map.modificationSecret,
          ttl: await this.getDeletedAt(map, configService.deleteAfterDays()),
          rootName: (await this.findRootNode(map.id))?.name || null,
        };
      })
    );

    return mapsInfo
  }

  /**
   * Maps database constraint errors to structured validation responses
   */
  async mapConstraintErrorToValidationResponse(
    error: QueryFailedError,
    _node: Partial<MmpNode>,
    _mapId: string
  ): Promise<ValidationErrorResponse> {
    const pgError = error.driverError as { code?: string; detail?: string }

    // Determine error code based on constraint type
    let code: ValidationErrorResponse['code'] = 'CONSTRAINT_VIOLATION'
    if (pgError?.code === MapsService.PG_FOREIGN_KEY_VIOLATION) {
      code = 'INVALID_PARENT'
    } else if (pgError?.code === MapsService.PG_UNIQUE_VIOLATION) {
      code = 'DUPLICATE_NODE'
    }

    return {
      success: false,
      errorType: 'validation',
      code,
      message: `VALIDATION_ERROR.${code}`,
      context: {
        detail: pgError?.detail,
      },
    }
  }

  findMap(uuid: string): Promise<MmpMap | null> {
    if (!uuidValidate(uuid))
      return Promise.reject(new MalformedUUIDError('Invalid UUID'))

    return this.mapsRepository.findOne({
      where: { id: uuid },
    })
  }

  async updateLastAccessed(uuid: string, lastAccessed = new Date()) {
    const map = await this.findMap(uuid)
    if (!map) {
      this.logger.warn(`updateLastAccessed(): Map was not found`)
      return
    }

    this.mapsRepository.update(uuid, { lastAccessed })
  }

  async exportMapToClient(uuid: string): Promise<IMmpClientMap | undefined> {
    const map = await this.findMap(uuid)
    if (!map) {
      this.logger.warn(`exportMapToClient(): Map was not found`)
      return
    }

    const nodes = await this.findNodes(map?.id)
    const days = configService.deleteAfterDays()
    const deletedAt = await this.getDeletedAt(map, days)

    if (deletedAt) {
      return mapMmpMapToClient(map, nodes, deletedAt, days)
    }
  }

  /**
   * Validates that node parent constraints are satisfied
   * Root and detached nodes cannot have parents - this is a business rule
   * @param node The node to validate
   * @returns true if constraints are valid, false if violated
   */
  private validateNodeParentConstraints(node: MmpNode): boolean {
    if (node.detached && node.nodeParentId) {
      this.logger.warn(
        `addNode(): Detached node ${node.id} is not allowed to have a parent.`
      )
      return false
    }

    if (node.root && node.nodeParentId) {
      this.logger.warn(
        `addNode(): Root node ${node.id} is not allowed to have a parent.`
      )
      return false
    }

    return true
  }

  async addNode(
    mapId: string,
    node: MmpNode
  ): Promise<MmpNode | ValidationErrorResponse | undefined> {
    if (!mapId || !node) {
      this.logger.warn(
        `addNode(): Required arguments mapId or node not supplied`
      )
      return
    }

    // Check node parent constraints
    if (!this.validateNodeParentConstraints(node)) {
      // Return validation error
      return await this.mapConstraintErrorToValidationResponse(
        new QueryFailedError('', [], new Error('CONSTRAINT_VIOLATION')),
        node,
        mapId
      )
    }

    const existingNode = await this.nodesRepository.findOne({
      where: { id: node.id, nodeMapId: mapId },
    })
    if (existingNode) return existingNode

    const newNode = this.nodesRepository.create({
      ...node,
      nodeMapId: mapId,
    })

    try {
      return await this.nodesRepository.save(newNode)
    } catch (error) {
      // Check if it's a constraint error we can handle
      if (this.isConstraintError(error) && error instanceof QueryFailedError) {
        this.logger.warn(
          `addNode(): Constraint violation when adding node ${newNode.id} - likely invalid parent reference`
        )
        return await this.mapConstraintErrorToValidationResponse(
          error,
          newNode,
          mapId
        )
      }

      // For other errors, log and throw
      this.logger.error(
        `${error instanceof Error ? error.constructor.name : 'Unknown'} addNode(): Failed to add node ${newNode.id}: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }

  async addNodesFromClient(
    mapId: string,
    clientNodes: IMmpClientNode[]
  ): Promise<(MmpNode | ValidationErrorResponse)[]> {
    const mmpNodes = clientNodes.map((x) => mapClientNodeToMmpNode(x, mapId))
    return await this.addNodes(mapId, mmpNodes)
  }

  /**
   * Adds multiple nodes to a map in a single atomic transaction
   * If any node fails validation or save, the entire operation is rolled back
   * Relies on database FK constraints for referential integrity
   * @param mapId The map ID to add nodes to
   * @param nodes Array of nodes to add
   * @returns Array of created nodes on success, or array with single ValidationErrorResponse on failure
   */
  async addNodes(
    mapId: string,
    nodes: Partial<MmpNode>[]
  ): Promise<(MmpNode | ValidationErrorResponse)[]> {
    if (!mapId || nodes.length === 0) {
      this.logger.warn(
        `Required arguments mapId or nodes not supplied to addNodes()`
      )
      return []
    }

    const queryRunner = await this.createQueryRunner()

    try {
      await queryRunner.startTransaction()

      const businessRuleValidation = await this.validateBusinessRules(nodes)
      if (!businessRuleValidation.valid) {
        await queryRunner.rollbackTransaction()
        return [businessRuleValidation.error!]
      }

      const nodesToCreate = await this.filterOutExistingNodes(
        queryRunner,
        mapId,
        nodes as MmpNode[]
      )

      const createdNodes = await this.saveAllNodesInTransaction(
        queryRunner,
        mapId,
        nodesToCreate
      )

      await queryRunner.commitTransaction()
      return createdNodes
    } catch (error) {
      await this.rollbackTransactionSafely(queryRunner)
      return await this.handleAddNodesError(error, nodes, mapId)
    } finally {
      await this.releaseQueryRunnerSafely(queryRunner)
    }
  }

  /**
   * Creates a validation error response directly
   */
  private buildValidationError(
    code: ValidationErrorResponse['code'],
    message: string
  ): ValidationErrorResponse {
    return {
      success: false,
      errorType: 'validation',
      code,
      message: `VALIDATION_ERROR.${message}`,
    }
  }

  /**
   * Validates business rules that the database cannot enforce
   * Does not check FK constraints - those are validated by the database
   * @param nodes Array of nodes to validate
   * @returns Validation result with error if invalid
   */
  private async validateBusinessRules(nodes: Partial<MmpNode>[]): Promise<{
    valid: boolean
    error?: ValidationErrorResponse
  }> {
    for (const node of nodes) {
      // Validate required properties exist
      if (!this.hasRequiredNodeProperties(node)) {
        return {
          valid: false,
          error: this.buildValidationError(
            'MISSING_REQUIRED_FIELD',
            'MISSING_REQUIRED_FIELD'
          ),
        }
      }

      const mmpNode = node as MmpNode

      // Business rule: root and detached nodes cannot have parents
      if (!this.validateNodeParentConstraints(mmpNode)) {
        return {
          valid: false,
          error: this.buildValidationError(
            'CONSTRAINT_VIOLATION',
            'CONSTRAINT_VIOLATION'
          ),
        }
      }
    }

    return { valid: true }
  }

  /**
   * Checks if a node has the minimum required property (id) for database save
   * Other required properties (root, detached, coordinatesX, coordinatesY, nodeMapId) are either:
   * - Set by database defaults (@Column({ default: ... }))
   * - Set explicitly before save (nodeMapId)
   * - Validated by TypeORM's @IsDefined() decorators during entity creation
   */
  private hasRequiredNodeProperties(node: Partial<MmpNode>): boolean {
    return !!node.id
  }

  /**
   * Safely rolls back a transaction with error handling
   * Only attempts rollback if transaction is active
   */
  private async rollbackTransactionSafely(
    queryRunner: QueryRunner
  ): Promise<void> {
    try {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction()
      }
    } catch (rollbackError) {
      this.logger.error(
        `Failed to rollback transaction: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
      )
    }
  }

  /**
   * Safely releases a query runner with error handling
   * Only attempts release if not already released
   */
  private async releaseQueryRunnerSafely(
    queryRunner: QueryRunner
  ): Promise<void> {
    try {
      if (!queryRunner.isReleased) {
        await queryRunner.release()
      }
    } catch (releaseError) {
      this.logger.error(
        `Failed to release query runner: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`
      )
    }
  }

  /**
   * Handles errors during addNodes operation
   * Safely handles constraint violations and re-throws unexpected errors
   */
  private async handleAddNodesError(
    error: unknown,
    nodes: Partial<MmpNode>[],
    mapId: string
  ): Promise<(MmpNode | ValidationErrorResponse)[]> {
    // Handle constraint errors from database
    if (this.isConstraintError(error) && error instanceof QueryFailedError) {
      this.logger.warn(
        `addNodes(): Constraint violation when adding nodes to map ${mapId}`
      )
      // Use first node if available, otherwise use empty object as fallback
      const nodeForError = (nodes[0] ?? {}) as MmpNode
      return [
        await this.mapConstraintErrorToValidationResponse(
          error,
          nodeForError,
          mapId
        ),
      ]
    }

    // Re-throw unexpected errors
    this.logger.error(
      `${error instanceof Error ? error.constructor.name : 'Unknown'} addNodes(): Failed to add nodes to map ${mapId}: ${error instanceof Error ? error.message : String(error)}`
    )
    throw error
  }

  /**
   * Filters out nodes that already exist in the database using a single bulk query
   * Optimized to prevent N+1 query problem
   */
  private async filterOutExistingNodes(
    queryRunner: QueryRunner,
    mapId: string,
    nodes: MmpNode[]
  ): Promise<MmpNode[]> {
    if (nodes.length === 0) {
      return []
    }

    const nodeIds = nodes.map((n) => n.id)
    const existingNodes = await queryRunner.manager.find(MmpNode, {
      where: {
        id: In(nodeIds),
        nodeMapId: mapId,
      },
      select: ['id'],
    })

    const existingNodeIds = new Set(existingNodes.map((n) => n.id))
    return nodes.filter((node) => !existingNodeIds.has(node.id))
  }

  /**
   * Saves all nodes within a transaction using bulk insert for performance
   * All nodes saved in single database operation
   */
  private async saveAllNodesInTransaction(
    queryRunner: QueryRunner,
    mapId: string,
    nodes: MmpNode[]
  ): Promise<MmpNode[]> {
    if (nodes.length === 0) {
      return []
    }

    const newNodes = nodes.map((node) =>
      queryRunner.manager.create(MmpNode, {
        ...node,
        nodeMapId: mapId,
      })
    )

    return await queryRunner.manager.save(newNodes)
  }

  async findNodes(mapId: string): Promise<MmpNode[]> {
    return this.nodesRepository
      .createQueryBuilder('mmpNode')
      .where('mmpNode.nodeMapId = :mapId', { mapId })
      .orderBy('mmpNode.orderNumber', 'ASC')
      .getMany()
  }

  async existsNode(mapId: string, parentId: string): Promise<boolean> {
    if (!mapId || !parentId) return false

    // Validate UUID format before querying to avoid database errors
    if (!uuidValidate(parentId)) {
      this.logger.warn(
        `existsNode(): Invalid UUID format for parentId: ${parentId}`
      )
      return false
    }

    return await this.nodesRepository.exist({
      where: { id: parentId, nodeMapId: mapId },
    })
  }

  private async validateNodeParentExists(
    mapId: string,
    nodeId: string,
    updatedNodeData: Partial<MmpNode>,
    context: string
  ): Promise<boolean> {
    if (!shouldValidateParent(updatedNodeData)) {
      return true
    }

    const parentExists = await this.existsNode(
      mapId,
      updatedNodeData.nodeParentId!
    )

    if (!parentExists) {
      this.logger.warn(
        createParentNotFoundWarning(
          nodeId,
          updatedNodeData.nodeParentId!,
          mapId,
          context
        )
      )
    }

    return parentExists
  }

  private async saveUpdatedNode(
    existingNode: MmpNode,
    updatedNodeData: Partial<MmpNode>
  ): Promise<MmpNode> {
    return await this.nodesRepository.save({
      ...existingNode,
      ...updatedNodeData,
      lastModified: new Date(),
    })
  }

  async updateNode(
    mapId: string,
    clientNode: IMmpClientNode
  ): Promise<MmpNode | ValidationErrorResponse | undefined> {
    const existingNode = await this.nodesRepository.findOne({
      where: { nodeMapId: mapId, id: clientNode.id },
    })

    if (!existingNode) {
      this.logger.warn(
        `updateNode(): Existing node on server for given client node ${clientNode.id} has not been found.`
      )
      return
    }

    const updatedNodeData = mapClientNodeToMmpNode(clientNode, mapId)

    const parentIsValid = await this.validateNodeParentExists(
      mapId,
      clientNode.id,
      updatedNodeData,
      'updateNode()'
    )

    if (!parentIsValid) {
      // Return validation error
      return await this.mapConstraintErrorToValidationResponse(
        new QueryFailedError('', [], new Error('INVALID_PARENT')),
        { ...existingNode, ...updatedNodeData },
        mapId
      )
    }

    try {
      return await this.saveUpdatedNode(existingNode, updatedNodeData)
    } catch (error) {
      // Check if it's a constraint error we can handle
      if (this.isConstraintError(error) && error instanceof QueryFailedError) {
        this.logger.warn(
          `updateNode(): Constraint violation when updating node ${existingNode.id}`
        )
        return await this.mapConstraintErrorToValidationResponse(
          error,
          { ...existingNode, ...updatedNodeData },
          mapId
        )
      }

      this.logger.error(
        `${error instanceof Error ? error.constructor.name : 'Unknown'} updateNode(): Failed to update node ${existingNode.id}: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }

  async removeNode(
    clientNode: IMmpClientNode,
    mapId: string
  ): Promise<MmpNode | undefined> {
    const existingNode = await this.nodesRepository.findOneBy({
      id: clientNode.id,
      nodeMapId: mapId,
    })

    if (!existingNode) {
      return
    }

    return this.nodesRepository.remove(existingNode)
  }

  private async createRootNodeForMap(
    rootNode: IMmpClientNodeBasics,
    mapId: string
  ): Promise<void> {
    const newRootNode = this.nodesRepository.create(
      mapClientBasicNodeToMmpRootNode(rootNode, mapId)
    )

    try {
      await this.nodesRepository.save(newRootNode)
    } catch (error) {
      this.logger.error(
        `${error instanceof Error ? error.constructor.name : 'Unknown'} createEmptyMap(): Failed to create root node ${newRootNode.id}: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    }
  }

  async createEmptyMap(rootNode?: IMmpClientNodeBasics, userId?: string): Promise<MmpMap> {
    const newMap: MmpMap = this.mapsRepository.create()
    const savedNewMap: MmpMap = await this.mapsRepository.save(newMap)

    if (rootNode) {
      await this.createRootNodeForMap(rootNode, savedNewMap.id)
    }

    if (userId) {
      await this.mapsRepository.update(savedNewMap.id, { owner: userId })
    }

    return newMap
  }

  /**
   * Updates map by replacing all nodes in a transaction
   * Ensures atomicity - either all changes succeed or none do
   */
  async updateMap(clientMap: IMmpClientMap): Promise<MmpMap | null> {
    const queryRunner = await this.createQueryRunner()

    try {
      await this.startMapUpdateTransaction(queryRunner)
      await this.deleteExistingNodes(queryRunner, clientMap.uuid)
      await this.addValidatedNodes(queryRunner, clientMap)
      await this.commitMapTransaction(queryRunner)
      return this.findMap(clientMap.uuid)
    } catch (error) {
      await this.rollbackMapTransaction(queryRunner, clientMap.uuid, error)
      throw error
    } finally {
      await queryRunner.release()
    }
  }

  /**
   * Creates and connects a query runner for transaction management
   */
  private async createQueryRunner() {
    const queryRunner =
      this.nodesRepository.manager.connection.createQueryRunner()
    await queryRunner.connect()
    return queryRunner
  }

  /**
   * Starts a database transaction for map updates
   */
  private async startMapUpdateTransaction(
    queryRunner: QueryRunner
  ): Promise<void> {
    await queryRunner.startTransaction()
  }

  /**
   * Deletes all existing nodes for a map
   * Prevents multiple root nodes in the updated map
   */
  private async deleteExistingNodes(
    queryRunner: QueryRunner,
    mapId: string
  ): Promise<void> {
    await queryRunner.manager.delete(MmpNode, { nodeMapId: mapId })
  }

  /**
   * Adds new nodes from client map with validation
   * Validates parent relationships before adding each node
   */
  private async addValidatedNodes(
    queryRunner: QueryRunner,
    clientMap: IMmpClientMap
  ): Promise<void> {
    const mmpNodes = this.convertClientNodesToMmpNodes(clientMap)
    await this.saveValidNodes(queryRunner, mmpNodes, clientMap.uuid)
  }

  /**
   * Converts client nodes to MmpNode format
   */
  private convertClientNodesToMmpNodes(
    clientMap: IMmpClientMap
  ): Partial<MmpNode>[] {
    return clientMap.data.map((x) => mapClientNodeToMmpNode(x, clientMap.uuid))
  }

  /**
   * Saves valid nodes sequentially to avoid race conditions
   */
  private async saveValidNodes(
    queryRunner: QueryRunner,
    mmpNodes: Partial<MmpNode>[],
    mapId: string
  ): Promise<void> {
    for (const node of mmpNodes) {
      await this.saveNodeIfValid(queryRunner, node as MmpNode, mapId)
    }
  }

  /**
   * Saves a single node if it passes validation
   */
  private async saveNodeIfValid(
    queryRunner: QueryRunner,
    node: MmpNode,
    mapId: string
  ): Promise<void> {
    if (await this.validatesNodeParentForNode(mapId, node)) {
      const newNode = queryRunner.manager.create(MmpNode, {
        ...node,
        nodeMapId: mapId,
      })
      await queryRunner.manager.save(newNode)
    }
  }

  /**
   * Commits the map update transaction
   */
  private async commitMapTransaction(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.commitTransaction()
  }

  /**
   * Rolls back transaction and logs error
   */
  private async rollbackMapTransaction(
    queryRunner: QueryRunner,
    mapId: string,
    error: unknown
  ): Promise<void> {
    await queryRunner.rollbackTransaction()
    this.logger.error(
      `updateMap(): Failed to update map ${mapId}: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  /**
   * Updates map by applying incremental changes (diff) in a single atomic transaction
   * If any change (add/update/delete) fails, the entire operation is rolled back
   * Ensures atomicity - either all changes succeed or none do
   * @param mapId The map ID to update
   * @param diff The diff containing added, updated, and deleted nodes
   */
  async updateMapByDiff(mapId: string, diff: IMmpClientMapDiff): Promise<void> {
    const queryRunner = await this.createQueryRunner()

    try {
      await queryRunner.startTransaction()

      // Process deleted nodes first to avoid FK constraint issues
      if (diff.deleted && Object.keys(diff.deleted).length > 0) {
        await this.applyDeletedChangesInTransaction(
          queryRunner,
          mapId,
          diff.deleted
        )
      }

      // Process added nodes
      if (diff.added && Object.keys(diff.added).length > 0) {
        await this.applyAddedChangesInTransaction(
          queryRunner,
          mapId,
          diff.added
        )
      }

      // Process updated nodes
      if (diff.updated && Object.keys(diff.updated).length > 0) {
        await this.applyUpdatedChangesInTransaction(
          queryRunner,
          mapId,
          diff.updated
        )
      }

      await queryRunner.commitTransaction()
    } catch (error) {
      await this.rollbackTransactionSafely(queryRunner)
      this.logger.error(
        `updateMapByDiff(): Failed to apply changes to map ${mapId}: ${error instanceof Error ? error.message : String(error)}`
      )
      throw error
    } finally {
      await this.releaseQueryRunnerSafely(queryRunner)
    }
  }

  /**
   * Applies deleted changes within a transaction
   */
  private async applyDeletedChangesInTransaction(
    queryRunner: QueryRunner,
    mapId: string,
    deletedNodes: IMmpClientSnapshotChanges
  ): Promise<void> {
    const nodeIds = Object.keys(deletedNodes)

    // Delete all nodes in a single query
    if (nodeIds.length > 0) {
      await queryRunner.manager.delete(MmpNode, {
        id: In(nodeIds),
        nodeMapId: mapId,
      })
    }
  }

  /**
   * Applies added changes within a transaction
   */
  private async applyAddedChangesInTransaction(
    queryRunner: QueryRunner,
    mapId: string,
    addedNodes: IMmpClientSnapshotChanges
  ): Promise<void> {
    const clientNodes = Object.values(addedNodes) as IMmpClientNode[]
    const mmpNodes = clientNodes.map((x) => mapClientNodeToMmpNode(x, mapId))

    // Validate business rules for all nodes
    const businessRuleValidation = await this.validateBusinessRules(mmpNodes)
    if (!businessRuleValidation.valid) {
      throw new Error(
        `Business rule validation failed: ${businessRuleValidation.error?.message}`
      )
    }

    // Filter out existing nodes and save new ones
    const nodesToCreate = await this.filterOutExistingNodes(
      queryRunner,
      mapId,
      mmpNodes as MmpNode[]
    )

    if (nodesToCreate.length > 0) {
      await this.saveAllNodesInTransaction(queryRunner, mapId, nodesToCreate)
    }
  }

  /**
   * Applies updated changes within a transaction
   *
   * Error Handling Strategy:
   * - Missing nodes (not found in database) are skipped with a warning (lenient)
   *   Rationale: Node may have been deleted by concurrent operation, acceptable for optimistic updates
   * - Invalid parent references throw errors and roll back transaction (strict)
   *   Rationale: Invalid parents indicate data integrity violation or client state inconsistency
   *   that should fail the entire atomic operation
   *
   * This differential handling balances robustness (handling race conditions gracefully)
   * with data integrity (preventing orphaned or corrupted node relationships)
   */
  private async applyUpdatedChangesInTransaction(
    queryRunner: QueryRunner,
    mapId: string,
    updatedNodes: IMmpClientSnapshotChanges
  ): Promise<void> {
    // Process updates sequentially to maintain parent-child relationship order
    for (const [nodeId, clientNodeData] of Object.entries(updatedNodes)) {
      if (!clientNodeData) continue

      const serverNode = await queryRunner.manager.findOne(MmpNode, {
        where: { nodeMapId: mapId, id: nodeId },
      })

      if (!serverNode) {
        this.logger.warn(
          `updateMapByDiff(): Node ${nodeId} not found for update, skipping`
        )
        continue
      }

      const mergedNode = mergeClientNodeIntoMmpNode(clientNodeData, serverNode)

      // Validate parent exists if specified
      if (shouldValidateParent(mergedNode)) {
        const parentExists = await queryRunner.manager.exists(MmpNode, {
          where: {
            id: mergedNode.nodeParentId!,
            nodeMapId: mapId,
          },
        })

        if (!parentExists) {
          throw new Error(
            `Invalid parent reference: Parent node ${mergedNode.nodeParentId} does not exist for node ${nodeId}`
          )
        }
      }

      // Apply changes and save
      Object.assign(serverNode, mergedNode, { lastModified: new Date() })
      await queryRunner.manager.save(serverNode)
    }
  }

  async updateMapOptions(
    mapId: string,
    clientOptions: IMmpClientMapOptions
  ): Promise<MmpMap | null> {
    await this.mapsRepository.update(mapId, { options: clientOptions })

    return await this.mapsRepository.findOne({ where: { id: mapId } })
  }

  async getDeletedAt(
    map: MmpMap,
    afterDays: number
  ): Promise<Date | undefined> {
    if (!map) {
      this.logger.warn(
        `Required argument map was not supplied to getDeletedAt()`
      )
      return
    }

    // get newest node of this map:
    const newestNodeQuery = this.nodesRepository
      .createQueryBuilder('node')
      .select('max(node.lastModified) AS lastModified')
      .where({ nodeMapId: map.id })
    const newestNode = newestNodeQuery.getRawOne()
    const newestNodeLastModified = (await newestNode)['lastmodified']
    const lastModified =
      newestNodeLastModified === null
        ? map.lastModified
        : newestNodeLastModified

    const lastAccessed = map.lastAccessed

    return this.calculcateDeletedAt(
      lastAccessed ? new Date(lastAccessed) : new Date(lastModified),
      afterDays
    )
  }

  calculcateDeletedAt(lastModified: Date, afterDays: number): Date {
    // dont modify original input as this might be used somewhere else
    const copyDate: Date = new Date(lastModified.getTime())
    copyDate.setDate(copyDate.getDate() + afterDays)
    return copyDate
  }

  async deleteOutdatedMaps(
    afterDays: number = 30
  ): Promise<number | null | undefined> {
    const today = new Date()

    const deleteQuery = this.mapsRepository
      .createQueryBuilder('map')
      .select('map.id')
      .leftJoin(
        (qb) =>
          // subquery to get the newest node and its lastModified date of this map:
          qb
            .select([
              'node.nodeMapId AS nodeMapId',
              'max(node.lastModified) AS lastUpdatedAt',
            ])
            .from(MmpNode, 'node')
            .groupBy('node.nodeMapId'),
        'lastmodifiednode',
        'lastmodifiednode.nodeMapid = map.id'
      )
      .where(
        "(GREATEST(map.lastAccessed, map.lastModified, lastmodifiednode.lastUpdatedAt) + (INTERVAL '1 day' * :afterDays)) < :today",
        { afterDays, today }
      )

    const outdatedMapsIdsFlat = (await deleteQuery.getRawMany()).flatMap(
      (id) => id['map_id']
    )

    if (outdatedMapsIdsFlat.length > 0) {
      return (
        await this.mapsRepository
          .createQueryBuilder()
          .where('id IN (:...ids)', { ids: outdatedMapsIdsFlat })
          .delete()
          .execute()
      ).affected
    }

    // no maps found to be deleted:
    return 0
  }

  deleteMap(uuid: string) {
    this.mapsRepository.delete({ id: uuid })
  }

  async validatesNodeParentForNode(
    mapId: string,
    node: MmpNode
  ): Promise<boolean> {
    return (
      node.root ||
      node.detached ||
      (!!node.nodeParentId && (await this.existsNode(mapId, node.nodeParentId)))
    )
  }
}
