import Node, {
    Colors,
    Coordinates,
    ExportNodeProperties,
    Font,
    Image,
    Link,
    NodeProperties,
    UserNodeProperties
} from '../models/node'
import MmpMap from '../map'
import * as d3 from 'd3'
import DOMPurify from 'dompurify'
import { v4 as uuidv4 } from 'uuid'
import { Event } from './events'
import Log from '../../utils/log'
import Utils from '../../utils/utils'
import { MapSnapshot } from './history'

const NODE_HORIZONTAL_SPACING = 200;  // The x-axis spacing between parent and child nodes
const NODE_VERTICAL_SIBLING_OFFSET = 60;     // The y-axis spacing between sibling nodes
const NODE_VERTICAL_SPACING = 120;  // The initial vertical spacing for the first child node
/**
 * Manage the nodes of the map.
 */
export default class Nodes {

    /**
     * Get the associated map instance and initialize counter and nodes.
     * @param {MmpMap} map
     */
    constructor(map: MmpMap) {
        this.map = map

        this.counter = 0
        this.nodes = new Map()
    }
    static NodePropertyMapping: any

    private map: MmpMap

    private counter: number
    private nodes: Map<string, Node>
    private selectedNode: Node

    /**
     * Add the root node to the map.
     * @param {Coordinates} coordinates
     */
    public addRootNode(coordinates?: Coordinates) {
        const rootId = uuidv4()

        const properties: NodeProperties = Utils.mergeObjects(this.map.options.rootNode, {
            coordinates: {
                x: 0,
                y: 0
            },
            locked: false,
            id: rootId,
            parent: null,
            detached: false,
            hidden: false,
            isRoot: true
        }) as NodeProperties

        this.map.rootId = rootId

        const node: Node = new Node(properties)

        if (coordinates) {
            node.coordinates.x = coordinates.x || node.coordinates.x
            node.coordinates.y = coordinates.y || node.coordinates.y
        }

        this.nodes.set(properties.id, node)

        this.counter++

        this.map.draw.update()

        this.selectRootNode()
    }

    /**
     * Add a node in the map.
     * @param {UserNodeProperties} userProperties
     * @param {string} parentId
     * @param {string} overwriteId
     */
    public addNode = (userProperties?: UserNodeProperties, notifyWithEvent: boolean = true, updateHistory: boolean = true, parentId?: string, overwriteId?: string): Node => {
        const parentNode: Node = userProperties.detached ? null :
            parentId ? this.getNode(parentId) : this.getSelectedNode()

        const properties: NodeProperties = Utils.mergeObjects(this.map.options.defaultNode, userProperties, true) as NodeProperties

        properties.id = overwriteId || uuidv4()
        properties.parent = parentNode

        if (parentNode && parentNode.hidden) {
            properties.hidden = true
        }

        const node: Node = new Node(properties)

        this.nodes.set(properties.id, node)

        this.counter++

        node.coordinates = this.calculateCoordinates(node)

        this.map.draw.update()

        if (updateHistory) {
            this.map.history.save()
        }

        if (notifyWithEvent) this.map.events.call(Event.nodeCreate, node.dom, this.getNodeProperties(node))
        return node
    }

    /**
     * Adds multiple nodes at once and saves one snapshot to history.
     * @param {ExportNodeProperties[]} nodes
     * @param {boolean} updateHistory
     */
    public addNodes = (nodes: ExportNodeProperties[], updateHistory: boolean = true) => {
        nodes.forEach(node => {
            if (!this.existNode(node.id)) {
                this.addNode(
                    node,
                    false,
                    false,
                    node.parent,
                    node.id
                )
            }
        })

        if (updateHistory) {
            this.map.history.save()
        }
    }

    /**
     * Select a node or return the current selected node.
     * @param {string} id
     * @returns {ExportNodeProperties}
     */
    public selectNode = (id?: string): ExportNodeProperties => {
        if (id !== undefined) {
            if (typeof id !== 'string') {
                Log.error('The node id must be a string', 'type')
            }

            if (!this.nodeSelectionTo(id)) {
                if (this.nodes.has(id)) {
                    const node = this.nodes.get(id),
                        background = node.getBackgroundDOM()

                    const color = d3.color(background.style.fill).darker(.5)

                    if (background.style.stroke !== color.toString()) {
                        if (this.selectedNode) {
                            this.selectedNode.getBackgroundDOM().style.stroke = ''
                        }

                        background.style.stroke = color.toString()

                        Utils.removeAllRanges()
                        this.selectedNode.getNameDOM().blur()

                        this.map.events.call(Event.nodeDeselect, this.selectedNode.dom, this.getNodeProperties(this.selectedNode))

                        this.selectedNode = node
                        this.map.events.call(Event.nodeSelect, node.dom, this.getNodeProperties(node))
                    }
                } else {
                    Log.error('The node id or the direction is not correct')
                }
            }
        }

        return this.getNodeProperties(this.selectedNode)
    }

    /**
     * Highlighs node with a border
     * @param {string} id
     * @param {string} color
     * @returns {void}
     */
    public highlightNodeWithColor = (id: string, color: string, notifyWithEvent: boolean = true): void => {
        if (id !== undefined) {
            if (typeof id !== 'string') {
                Log.error('The node id must be a string', 'type')
            }

            if (this.nodes.has(id)) {
                const node = this.nodes.get(id),
                    background = node.getBackgroundDOM()

                if (background.style.stroke !== color) {
                    background.style.stroke = DOMPurify.sanitize(color)

                    if (notifyWithEvent) this.map.events.call(Event.nodeUpdate, node.dom, this.getNodeProperties(node))
                }
            } else {
                Log.error('The node id is not correct')
            }
        }
    }


    /**
     * Check if a node exist
     * @param {string} id
     * @returns {boolean}
     */
    public existNode = (id?: string): boolean => {
        if (id !== undefined) {
            if (typeof id !== 'string') {
                Log.error('The node id must be a string', 'type')
                return false
            }

            return this.nodes.has(id)
        }
        return false
    }

    /**
     * Enable the node name editing of the selected node.
     */
    public editNode = () => {
        if (this.selectedNode) {
            this.map.draw.enableNodeNameEditing(this.selectedNode)
        }
    }

    /**
     * Toggle (hide/show) all child nodes of selected node
     */
    public toggleBranchVisibility = () => {
        if (this.selectedNode) {
            const children = this.getChildren(this.selectedNode);

            const descendants = this.getDescendants(this.selectedNode).filter(x => !children.includes(x));

            /**
             * We need to hide direct children and descendants separately, because if we just use getDescendants() and set !x.hidden, we'd inadvertently show already hidden children of children.
             * This is why we have two separate checks for children of children: 
             * 1) If the parent is hidden but they're not, hide them.
             * 2) If the parent is not hidden but they are, show them.
             */

            if (children) {
                children.forEach(x => this.updateNode('hidden', !x.hidden, false, false, x.id))
            }

            if (descendants) {
                descendants.forEach(x => {
                    if (x.parent.hidden && !x.hidden) {
                        this.updateNode('hidden', true, false, false, x.id)
                    }

                    if (!x.parent.hidden && x.hidden) {
                        this.updateNode('hidden', false, false, false, x.id)
                    }
                })
            }

            // Lengthy but definitive check to see if we have any hidden nodes after toggling
            // We need the hasHiddenChildNodes attribute so we can correctly re-apply hidden state when we get map updates from the server
            if (this.map.nodes.nodeChildren(this.selectedNode.id)?.filter(x => x.hidden).length > 0) {
                this.selectedNode.hasHiddenChildNodes = true
            } else {
                this.selectedNode.hasHiddenChildNodes = false
            }

            this.map.draw.update()
            this.map.history.save()
        }
    }

    /**
     * Deselect the current selected node.
     */
    public deselectNode = () => {
        if (this.selectedNode?.id === this.getRoot().id) return

        const oldNodeProps: ExportNodeProperties = this.getNodeProperties(this.selectedNode)
        const oldDom: SVGGElement = this.selectedNode.dom

        if (this.selectedNode) {
            this.selectedNode.getBackgroundDOM().style.stroke = ''
            Utils.removeAllRanges()
        }

        this.selectRootNode()

        this.map.events.call(Event.nodeDeselect, oldDom, oldNodeProps)
    }



    /**
     * Update the properties of the selected node.
     */
    public updateNode = (property: string, value: any, notifyWithEvent: boolean = true, updateHistory: boolean = true, id?: string) => {
        if (id && typeof id !== 'string') {
            Log.error('The node id must be a string', 'type')
        }

        const node: Node = id ? this.getNode(id) : this.selectedNode

        if (node === undefined) {
            Log.error('There are no nodes with id "' + id + '"')
        }

        if (typeof property !== 'string') {
            Log.error('The property must be a string', 'type')
        }

        let updated: any
        const previousValue: any = Utils.get(node, PropertyMapping[property])

        switch (property) {
            case 'name':
                updated = this.updateNodeName(node, value)
                break
            case 'locked':
                updated = this.updateNodeLockedStatus(node, value)
                break
            case 'coordinates':
                updated = this.updateNodeCoordinatesWithoutDescendants(node, value)
                break
            case 'imageSrc':
                updated = this.updateNodeImageSrc(node, value)
                break
            case 'imageSize':
                updated = this.updateNodeImageSize(node, value)
                break
            case 'linkHref':
                updated = this.updateNodeLinkHref(node, value)
                break
            case 'backgroundColor':
                updated = this.updateNodeBackgroundColor(node, value)
                break
            case 'branchColor':
                updated = this.updateNodeBranchColor(node, value)
                break
            case 'fontWeight':
                updated = this.updateNodeFontWeight(node, value)
                break
            case 'textDecoration':
                updated = this.updateNodeTextDecoration(node, value)
                break
            case 'fontStyle':
                updated = this.updateNodeFontStyle(node, value)
                break
            case 'fontSize':
                updated = this.updateNodeFontSize(node, value)
                break
            case 'nameColor':
                updated = this.updateNodeNameColor(node, value)
                break
            case 'hidden':
                updated = this.updateNodeHidden(node, value)
                break
            default:
                Log.error('The property does not exist')
        }
        if (updated !== false && updateHistory) {
            this.map.history.save()
        }

        if (updated !== false && notifyWithEvent) {
            this.map.events.call(Event.nodeUpdate, node.dom, { nodeProperties: this.getNodeProperties(node), changedProperty: property, previousValue })
        }
    }

    /**
     * Remove the selected node.
     * @param {string} id
     */
    public removeNode = (id?: string, notifyWithEvent: boolean = true) => {
        if (id && typeof id !== 'string') {
            Log.error('The node id must be a string', 'type')
        }

        const node: Node = id ? this.getNode(id) : this.selectedNode

        if (node === undefined) {
            Log.error('There are no nodes with id "' + id + '"')
        }

        if (!node.isRoot) {
            this.nodes.delete(node.id)

            this.getDescendants(node).forEach((node: Node) => {
                this.nodes.delete(node.id)
            })

            this.map.draw.clear()
            this.map.draw.update()

            this.map.history.save()

            if (notifyWithEvent) this.map.events.call(Event.nodeRemove, null, this.getNodeProperties(node))

            this.deselectNode()
        } else {
            Log.error('The root node can not be deleted')
        }
    }

    /**
     * Return the children of the node.
     * @param {string} id
     * @returns {ExportNodeProperties[]}
     */
    public nodeChildren = (id?: string): ExportNodeProperties[] => {
        if (id && typeof id !== 'string') {
            Log.error('The node id must be a string', 'type')
        }

        const node: Node = id ? this.getNode(id) : this.selectedNode

        if (node === undefined) {
            Log.error('There are no nodes with id "' + id + '"')
        }

        return Array.from(this.nodes.values()).filter((n: Node) => {
            return n.parent && n.parent.id === node.id
        }).map((n: Node) => {
            return this.getNodeProperties(n)
        })
    }

    /**
     * Return the export properties of the node.
     * @param {Node} node
     * @param {boolean} fixedCoordinates
     * @returns {ExportNodeProperties} properties
     */
    public getNodeProperties(node: Node, fixedCoordinates: boolean = false): ExportNodeProperties {
        return {
            id: node.id,
            parent: node.parent ? node.parent.id : '',
            name: node.name,
            coordinates: fixedCoordinates
                ? this.fixCoordinates(node.coordinates, true)
                : Utils.cloneObject(node.coordinates) as Coordinates,
            image: Utils.cloneObject(node.image) as Image,
            colors: Utils.cloneObject(node.colors) as Colors,
            font: Utils.cloneObject(node.font) as Font,
            link: Utils.cloneObject(node.link) as Link,
            locked: node.locked,
            isRoot: node.isRoot,
            detached: node.detached,
            hidden: node.hidden,
            hasHiddenChildNodes: node.hasHiddenChildNodes,
            k: node.k
        }
    }

    /**
     * Convert external coordinates to internal or otherwise.
     * @param {Coordinates} coordinates
     * @param {boolean} reverse
     * @returns {Coordinates}
     */
    public fixCoordinates(coordinates: Coordinates, reverse: boolean = false): Coordinates {
        const zoomCoordinates = d3.zoomTransform(this.map.dom.svg.node()),
            fixedCoordinates: Coordinates = {} as Coordinates

        if (coordinates.x) {
            if (reverse === false) {
                fixedCoordinates.x = (coordinates.x - zoomCoordinates.x) / zoomCoordinates.k
            } else {
                fixedCoordinates.x = coordinates.x * zoomCoordinates.k + zoomCoordinates.x
            }
        }

        if (coordinates.y) {
            if (reverse === false) {
                fixedCoordinates.y = (coordinates.y - zoomCoordinates.y) / zoomCoordinates.k
            } else {
                fixedCoordinates.y = coordinates.y * zoomCoordinates.k + zoomCoordinates.y
            }
        }

        return coordinates
    }

    /**
     * Move the node selection in the direction passed as parameter.
     * @param {string} direction
     * @returns {boolean}
     */
    private nodeSelectionTo(direction: string): boolean {
        switch (direction) {
            case 'up':
                this.moveSelectionOnLevel(true)
                return true
            case 'down':
                this.moveSelectionOnLevel(false)
                return true
            case 'left':
                this.moveSelectionOnBranch(true)
                return true
            case 'right':
                this.moveSelectionOnBranch(false)
                return true
            default:
                return false
        }
    }

    /**
     * Return the children of a node.
     * @param {Node} node
     * @returns {Node[]}
     */
    public getChildren(node: Node): Node[] {
        return Array.from(this.nodes.values()).filter((n: Node) => {
            return n.parent && n.parent.id === node.id
        })
    }

    /**
     * Return the orientation of a node in the map (true if left).
     * @return {boolean}
     */
    private getOrientation(
        node: Node | ExportNodeProperties, 
        rootNode?: Node | ExportNodeProperties
    ): boolean | undefined {
        // isRoot exists only on Node type, so type guard is needed
        if ('isRoot' in node && node.isRoot) {
            return;
        }
    
        // For Node type, use this.getRoot() if rootNode not provided
        const root = rootNode ?? (('isRoot' in node) ? this.getRoot() : undefined);
        if (!root) {
            return;
        }
    
        return (node.coordinates?.x ?? 0) < (root.coordinates?.x ?? 0);
    }
    
    // Wrapper methods with specific types
    public getNodeOrientation(node: Node): boolean | undefined {
        return this.getOrientation(node);
    }
    
    public getExportOrientation(node: ExportNodeProperties, rootNode: ExportNodeProperties): boolean | undefined {
        return this.getOrientation(node, rootNode);
    }

    /**
     * Return all descendants of a node.
     * @returns {Node[]} nodes
     */
    public getDescendants(node: Node): Node[] {
        let nodes = []
        this.getChildren(node).forEach((node: Node) => {
            nodes.push(node)
            nodes = nodes.concat(this.getDescendants(node))
        })
        return nodes
    }

    /**
     * Return an array of all nodes.
     */
    public getNodes(): Node[] {
        return Array.from(this.nodes.values())
    }

    /**
     * Export currently selected node
     */
    public exportSelectedNode = (): ExportNodeProperties => {
        return this.getNodeProperties(this.selectedNode)
    }

    /**
     * Return the node properties with the id equal to id passed as parameter.
     */
    public exportNodeProperties = (id: string): ExportNodeProperties => {
        return this.getNodeProperties(this.getNode(id))
    }

    /**
     * Return the root parameters
     */
    public exportRootProperties = (): ExportNodeProperties => {
        return this.getNodeProperties(this.getRoot())
    }

    /**
     * Set a node as a id-value copy.
     */
    public setNode(key: string, node: Node) {
        this.nodes.set(key, node)
    }

    /**
     * Get the counter number of the nodes.
     * @returns {number} counter
     */
    public getCounter() {
        return this.counter
    }

    /**
     * Set the counter of the nodes.
     * @param {number} number
     */
    public setCounter(number: number) {
        this.counter = number
    }

    /**
     * Return the current selected node.
     * @returns {Node}
     */
    public getSelectedNode = (): Node => {
        return this.selectedNode
    }

    /**
     * Set the root node as selected node.
     */
    public selectRootNode() {
        this.selectedNode = this.getRoot()
    }

    /**
     * Delete all nodes.
     */
    public clear() {
        this.nodes.clear()
    }

    /**
     * Return the root node.
     * @returns {Node} rootNode
     */
    public getRoot = (): Node => {
        return this.nodes.get(this.map.rootId)
    }

    /**
     * Return the node with the id equal to id passed as parameter.
     * @param {string} id
     * @returns {Node}
     */
    public getNode = (id: string): Node => {
        if (id !== undefined) {
            if (typeof id !== 'string') {
                Log.error('The node id must be a string', 'type')
                return
            }
            return this.nodes.get(id)
        }
    }

    /**
     * Return the siblings of a node.
     * @param {Node} node
     * @returns {Array<Node>} siblings
     */
    private getSiblings(node: Node): Array<Node> {
        if (!node.isRoot && !node.detached) {
            const parentChildren: Array<Node> = this.getChildren(node.parent)

            if (parentChildren.length > 1) {
                parentChildren.splice(parentChildren.indexOf(node), 1)
                return parentChildren
            } else {
                return []
            }
        } else {
            return []
        }
    }

    /**
     * Base method for calculating node coordinates. 
     * The reason this exists is so we can work with a JSON snapshot (as given by an import), but also allow saved, "real" nodes to calculate coordinates
     * This prevents duplication, whilst passing methods that differ depending on whether or not a JSON snapshot or "real" node is calculating coordinates.
     * @param node Either a node previously saved or one from a JSON snapshot
     * @param params
     * getParent() - Method to find the parent of the given node
     * getSiblings() - Method to get the siblings of the given node
     * isRoot() - If parent node is root
     * getOrientation() - Method to get the orientation of the node
     * @returns 
     */
    private calculateNodeCoordinates(
        node: Node | ExportNodeProperties,
        params: {
            getParent: () => (Node | ExportNodeProperties) | null,
            getSiblings: () => (Node | ExportNodeProperties)[],
            isRoot: boolean,
            getOrientation: (n: Node | ExportNodeProperties) => boolean | undefined
        }
    ): Coordinates {
        const nodeParent = params.getParent();
        
        let coordinates: Coordinates = {
            x: nodeParent?.coordinates?.x ?? (node.coordinates?.x ?? 0),
            y: nodeParent?.coordinates?.y ?? (node.coordinates?.y ?? 0)
        };
    
        let siblings = params.getSiblings();
    
        if (nodeParent && params.isRoot) {
            const [leftNodes, rightNodes] = siblings.reduce<[(Node | ExportNodeProperties)[], (Node | ExportNodeProperties)[]]>(
                (acc, sibling) => {
                    params.getOrientation(sibling) 
                        ? acc[0].push(sibling) 
                        : acc[1].push(sibling);
                    return acc;
                },
                [[], []]
            );
    
            if (leftNodes.length <= rightNodes.length) {
                coordinates.x -= NODE_HORIZONTAL_SPACING;
                siblings = leftNodes;
            } else {
                coordinates.x += NODE_HORIZONTAL_SPACING;
                siblings = rightNodes;
            }
        } else if (!node.detached) {
            if (nodeParent && params.getOrientation(nodeParent)) {
                coordinates.x -= NODE_HORIZONTAL_SPACING;
            } else {
                coordinates.x += NODE_HORIZONTAL_SPACING;
            }
        }
    
        if (siblings.length > 0) {
            const lowerNode = this.getLowerNode(siblings)
            coordinates.y = (lowerNode?.coordinates?.y ?? 0) + NODE_VERTICAL_SIBLING_OFFSET;
        } else if (!node.detached) {
            coordinates.y -= NODE_VERTICAL_SPACING;
        }
    
        return coordinates;
    }

    /**
     * Existing method to calculate the coordinates of "real", saved nodes in the database.
     * This method will pass on existing methods such as this.getSiblings() to calculateNodeCoordinates, so existing implementations don't break
     * @param node 
     * @returns 
     */
    private calculateCoordinates(node: Node): Coordinates {
        return this.calculateNodeCoordinates(
            node,
            {
                getParent: () => node.parent,
                getSiblings: () => this.getSiblings(node),
                isRoot: node.parent?.isRoot ?? false,
                getOrientation: (n: Node) => this.getNodeOrientation(n)
            }
        );
    }

    public applyCoordinatesToMapSnapshot = (map: MapSnapshot): MapSnapshot => {
        const rootNode = map.find(x => x.isRoot);
        
        return map.map(node => {
            if (!node.coordinates) {
                /**
                 * Since we're working with a JSON snapshot here, none of the nodes actually exist.
                 * This makes existing methods such as this.getSiblings() useless, because they only work with existing nodes.
                 * So here, we pass on methods that work directly with the JSON.
                 */
                node.coordinates = this.calculateNodeCoordinates(
                    node,
                    {
                        getParent: () => node.parent ? map.find(x => x.id === node.parent) : null,
                        getSiblings: () => node.parent ? map.filter(x => x.parent === node.parent && x.id !== node.id) : [],
                        isRoot: !!node.parent && map.find(x => x.id === node.parent)?.isRoot,
                        getOrientation: (n: ExportNodeProperties) => this.getExportOrientation(n, rootNode)
                    }
                );
            }

            return node
        });
    }

    /**
     * Return the lower node of a list of nodes.
     * @param {Node[]} nodes
     * @returns {Node} lowerNode
     */
    private getLowerNode(nodes: (Node | ExportNodeProperties)[]): Node | ExportNodeProperties | undefined {
        if (nodes.length === 0) {
            return;
        }
    
        return nodes.reduce((lowest, current) => {
            const lowestY = lowest.coordinates?.y ?? 0;
            const currentY = current.coordinates?.y ?? 0;
            
            return currentY > lowestY ? current : lowest;
        }, nodes[0]);
    }

    /**
     * Update the node name with a new value.
     * @param {Node} node
     * @param {string} name
     * @returns {boolean}
     */
    private updateNodeName = (node: Node, name: string): boolean => {
        if (name && typeof name !== 'string') {
            Log.error('The name must be a string', 'type')
        }

        if (node.name != name) {
            node.getNameDOM().innerHTML = DOMPurify.sanitize(name)

            this.map.draw.updateNodeShapes(node)

            node.name = name
            return true
        } else {
            return false
        }
    }

    /**
     * Update the node coordinates with a new value.
     * The main method for moving nodes is located inside the drag module.
     * This method acts as a more simpler way of just moving one node.
     * @param {Node} node
     * @param {Coordinates} coordinates
     * @returns {boolean}
     */
    private updateNodeCoordinatesWithoutDescendants = (initialNode: Node, coordinates: Coordinates): boolean => {
        // no moving of descendants here
        const fixedCoordinates = coordinates

        coordinates = Utils.mergeObjects(initialNode.coordinates, fixedCoordinates, true) as Coordinates

        if (!(coordinates.x === initialNode.coordinates.x && coordinates.y === initialNode.coordinates.y)) {
            initialNode.coordinates = Utils.cloneObject(coordinates) as Coordinates
            initialNode.dom.setAttribute('transform', 'translate(' + [coordinates.x, coordinates.y] + ')')

            d3.selectAll('.' + this.map.id + '_branch').attr('d', (node: Node) => {
                return this.map.draw.drawBranch(node) as any
            })

            return true
        } else {
            return false
        }
    }

    /**
     * Update the node background color with a new value.
     * @param {Node} node
     * @param {string} color
     * @returns {boolean}
     */
    private updateNodeBackgroundColor = (node: Node, color: string): boolean => {
        if (color && typeof color !== 'string') {
            Log.error('The background color must be a string', 'type')
        }

        const sanitizedColor = DOMPurify.sanitize(color)

        if (node.colors.background !== color) {
            const background = node.getBackgroundDOM()

            background.style.fill = sanitizedColor

            if (background.style.stroke !== '') {
                background.style.stroke = d3.color(sanitizedColor).darker(.5).toString()
            }

            node.colors.background = sanitizedColor
            return true
        } else {
            return false
        }
    }

    /**
     * Update the node text color with a new value.
     * @param {Node} node
     * @param {string} color
     * @returns {boolean}
     */
    private updateNodeNameColor = (node: Node, color: string): boolean => {
        if (color && typeof color !== 'string') {
            Log.error('The text color must be a string', 'type')
        }

        const sanitizedColor = DOMPurify.sanitize(color)

        if (node.colors.name !== color) {
            node.getNameDOM().style.color = sanitizedColor

            node.colors.name = sanitizedColor
            return true
        } else {
            return false
        }
    }

    /**
     * Update the node branch color with a new value.
     * @param {Node} node
     * @param {string} color
     * @returns {boolean}
     */
    private updateNodeBranchColor = (node: Node, color: string): boolean => {
        if (color && typeof color !== 'string') {
            Log.error('The branch color must be a string', 'type')
        }

        const sanitizedColor = DOMPurify.sanitize(color)

        if (!node.isRoot) {
            if (node.colors.name !== color) {
                const branch = document.getElementById(node.id + '_branch')

                branch.style.fill = branch.style.stroke = sanitizedColor

                node.colors.branch = sanitizedColor
                return true
            } else {
                return false
            }
        } else {
            Log.error('The root node has no branches')
            return false
        }
    }

    /**
     * Update the node font size with a new value.
     * @param {Node} node
     * @param {number} size
     * @returns {boolean}
     */
    private updateNodeFontSize = (node: Node, size: number): boolean => {
        if (size && typeof size !== 'number') {
            Log.error('The font size must be a number', 'type')
        }

        if (node.font.size != size) {
            node.getNameDOM().style['font-size'] = size + 'px'

            this.map.draw.updateNodeShapes(node)

            node.font.size = size
            return true
        } else {
            return false
        }
    }

    /**
     * Update the node image size with a new value.
     * @param {Node} node
     * @param {number} size
     * @returns {boolean}
     */
    private updateNodeImageSize = (node: Node, size: number): boolean => {
        if (size && typeof size !== 'number') {
            Log.error('The image size must be a number', 'type')
        }

        if (node.image.src !== '') {
            if (node.image.size !== size) {
                const image = node.getImageDOM(),
                    box = (image as any).getBBox(),
                    height = size,
                    width = box.width * height / box.height,
                    y = -(height + node.dimensions.height / 2 + 5),
                    x = -width / 2

                image.setAttribute('height', height.toString())
                image.setAttribute('width', width.toString())
                image.setAttribute('y', y.toString())
                image.setAttribute('x', x.toString())

                node.image.size = height
                return true
            } else {
                return false
            }
        } else {
            Log.error('The node does not have an image')
            return false
        }
    }

    /**
     * Update the node image src with a new value.
     * @param {Node} node
     * @param {string} src
     * @returns {boolean}
     */
    private updateNodeImageSrc = (node: Node, src: string): boolean => {
        if (src && typeof src !== 'string') {
            Log.error('The image path must be a string', 'type')
        }

        if (node.image.src !== src) {
            node.image.src = src

            this.map.draw.setImage(node)
            return true
        } else {
            return false
        }
    }

    /**
     * Update the node link href with a new value.
     * @param {Node} node
     * @param {string} href
     * @returns {boolean}
     */
    private updateNodeLinkHref = (node: Node, href: string): boolean => {
        if (href && typeof href !== 'string') {
            Log.error('The link href must be a string', 'type')
        }

        if (node.link.href !== href) {
            node.link.href = href

            this.map.draw.setLink(node)
            return true
        } else {
            return false
        }
    }

    /**
     * Update the node hidden value
     * @param {Node} node
     * @param {boolean} hidden
     * @returns {boolean}
     */
    private updateNodeHidden = (node: Node, hidden: boolean): boolean => {
        if (hidden && typeof hidden !== 'boolean') {
            Log.error('The hidden value must be boolean', 'type')
        }

        if (node.hidden !== hidden) {
            node.hidden = hidden;
            return true
        } else {
            return false
        }
    }

    /**
     * Update the node font style.
     * @param {Node} node
     * @param {string} style
     * @returns {boolean}
     */
    private updateNodeFontStyle = (node: Node, style: string): boolean => {
        if (style && typeof style !== 'string') {
            Log.error('The font style must be a string', 'type')
        }

        if (node.font.style !== style) {
            node.getNameDOM().style['font-style'] = DOMPurify.sanitize(style)

            node.font.style = style
            return true
        } else {
            return false
        }
    }

    /**
     * Update the node font weight.
     * @param {Node} node
     * @param {string} weight
     * @returns {boolean}
     */
    private updateNodeFontWeight = (node: Node, weight: string): boolean => {
        if (weight && typeof weight !== 'string') {
            Log.error('The font weight must be a string', 'type')
        }

        if (node.font.weight !== weight) {
            node.getNameDOM().style['font-weight'] = DOMPurify.sanitize(weight)

            this.map.draw.updateNodeShapes(node)

            node.font.weight = weight
            return true
        } else {
            return false
        }
    }

    /**
     * Update the node text decoration.
     * @param {Node} node
     * @param {string} decoration
     * @returns {boolean}
     */
    private updateNodeTextDecoration = (node: Node, decoration: string): boolean => {
        if (decoration && typeof decoration !== 'string') {
            Log.error('The text decoration must be a string', 'type')
        }

        if (node.font.decoration !== decoration) {
            node.getNameDOM().style['text-decoration'] = DOMPurify.sanitize(decoration)

            this.map.draw.updateNodeShapes(node)

            node.font.decoration = decoration
            return true
        } else {
            return false
        }
    }

    /**
     * Update the node locked status.
     * @param {Node} node
     * @param {boolean} flag
     * @returns {boolean}
     */
    private updateNodeLockedStatus = (node: Node, flag: boolean): boolean => {
        if (flag && typeof flag !== 'boolean') {
            Log.error('The node locked status must be a boolean', 'type')
        }

        if (!node.isRoot) {
            node.locked = flag || !node.locked
            return true
        } else {
            Log.error('The root node can not be locked')
            return false
        }
    }

    /**
     * Move the node selection on the level of the current node (true: up).
     * @param {boolean} direction
     */
    private moveSelectionOnLevel(direction: boolean) {
        if (!this.selectedNode.isRoot) {
            let siblings = this.getSiblings(this.selectedNode).filter((node: Node) => {
                return direction === node.coordinates.y < this.selectedNode.coordinates.y
            })

            if (this.selectedNode.parent.isRoot) {
                siblings = siblings.filter((node: Node) => {
                    return this.getNodeOrientation(node) === this.getNodeOrientation(this.selectedNode)
                })
            }

            if (siblings.length > 0) {
                let closerNode: Node = siblings[0],
                    tmp = Math.abs(siblings[0].coordinates.y - this.selectedNode.coordinates.y)

                for (const node of siblings) {
                    const distance = Math.abs(node.coordinates.y - this.selectedNode.coordinates.y)

                    if (distance < tmp) {
                        tmp = distance
                        closerNode = node
                    }
                }

                this.selectNode(closerNode.id)
            }
        }
    }

    /**
     * Move the node selection in a child node or in the parent node (true: left)
     * @param {boolean} direction
     */
    private moveSelectionOnBranch(direction: boolean) {
        if ((!this.getNodeOrientation(this.selectedNode) && direction) ||
        (this.getNodeOrientation(this.selectedNode) && !direction)) {
            this.selectNode(this.selectedNode.parent.id)
        } else {
            let children = this.getChildren(this.selectedNode)

            if (this.getNodeOrientation(this.selectedNode) === undefined) {
                // The selected node is the root
                children = children.filter((node: Node) => {
                    return this.getNodeOrientation(node) === direction
                })
            }

            const lowerNode = this.getLowerNode(children)

            if (children.length > 0) {
                this.selectNode(lowerNode.id)
            }
        }
    }

}

export const PropertyMapping = {
    name: ['name'],
    locked: ['locked'],
    coordinates: ['coordinates'],
    imageSrc: ['image', 'src'],
    imageSize: ['image', 'size'],
    linkHref: ['link', 'href'],
    backgroundColor: ['colors', 'background'],
    branchColor: ['colors', 'branch'],
    fontWeight: ['font', 'weight'],
    textDecoration: [],
    fontStyle: ['font', 'style'],
    fontSize: ['font', 'size'],
    nameColor: ['colors', 'name'],
    hidden: ['hidden']
} as const