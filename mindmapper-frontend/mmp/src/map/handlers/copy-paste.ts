import Map from '../map'
import Node, {Colors, Coordinates, ExportNodeProperties} from '../models/node'
import Log from '../../utils/log'
import Utils from '../../utils/utils'

/**
 * Manage the drag events of the nodes.
 */
export default class CopyPaste {

    private map: Map

    private copiedNodes: ExportNodeProperties[]

    /**
     * Get the associated map instance.
     * @param {Map} map
     */
    constructor(map: Map) {
        this.map = map
    }

    /**
     * Copy the node with the id passed as parameter or
     * the selected node in the mmp clipboard.
     * @param {string} id
     */
    public copy = (id: string) => {
        if (id && typeof id !== 'string') {
            Log.error('The node id must be a string', 'type')
        }

        const node: Node = id ? this.map.nodes.getNode(id) : this.map.nodes.getSelectedNode()

        if (node === undefined) {
            Log.error('There are no nodes with id "' + id + '"')
        }

        if (!node.isRoot) {
            this.copiedNodes = [this.map.nodes.getNodeProperties(node, false)]

            this.map.nodes.getDescendants(node).forEach((node: Node) => {
                this.copiedNodes.push(this.map.nodes.getNodeProperties(node, false))
            })
        } else {
            Log.error('The root node can not be copied')
        }
    }

    /**
     * Remove and copy the node with the id passed as parameter or
     * the selected node in the mmp clipboard.
     * @param {string} id
     */
    public cut = (id: string) => {
        if (id && typeof id !== 'string') {
            Log.error('The node id must be a string', 'type')
        }

        const node: Node = id ? this.map.nodes.getNode(id) : this.map.nodes.getSelectedNode()

        if (node === undefined) {
            Log.error('There are no nodes with id "' + id + '"')
        }

        if (!node.isRoot) {
            this.copiedNodes = [this.map.nodes.getNodeProperties(node, false)]

            this.map.nodes.getDescendants(node).forEach((node: Node) => {
                this.copiedNodes.push(this.map.nodes.getNodeProperties(node, false))
            })

            this.map.nodes.removeNode(node.id)
        } else {
            Log.error('The root node can not be cut')
        }
    }

    /**
     * If there are nodes in the mmp clipboard paste them in the map as children
     * of the node with the passed as parameter or of the selected node.
     * @param {string} id
     */
    public paste = (id: string) => {
        if (this.copiedNodes === undefined) {
            Log.error('There are not nodes in the mmp clipboard')
        }

        if (id && typeof id !== 'string') {
            Log.error('The node id must be a string', 'type')
        }

        const node: Node = id ? this.map.nodes.getNode(id) : this.map.nodes.getSelectedNode()

        if (node === undefined) {
            Log.error('There are no nodes with id "' + id + '"')
        }

        const rootNode = this.map.nodes.getRoot()

        const addNodes = (nodeProperties: ExportNodeProperties, newParentNode: Node) => {
            let coordinates: Coordinates

            if (nodeProperties.id !== this.copiedNodes[0].id) {
                coordinates = {x: 0, y: 0}

                const oldParentNode = (this.copiedNodes as any).find((np) => {
                    return np.id === nodeProperties.parent
                })

                let dx = oldParentNode.coordinates.x - nodeProperties.coordinates.x
                const dy = oldParentNode.coordinates.y - nodeProperties.coordinates.y

                const newParentOrientation = this.map.nodes.getOrientation(newParentNode)
                const oldParentOrientation = oldParentNode.coordinates.x < rootNode.coordinates.x

                if (oldParentOrientation !== newParentOrientation) {
                    dx = -dx
                }

                coordinates.x = newParentNode.coordinates.x - dx
                coordinates.y = newParentNode.coordinates.y - dy

                coordinates = this.map.nodes.fixCoordinates(coordinates, true)
            }

            const nodePropertiesCopy = Utils.cloneObject(nodeProperties)
            // use the new parents branch color
            const fixedColors: Colors = Object.assign({}, nodePropertiesCopy.color, { branch: newParentNode?.colors?.branch })

            this.map.nodes.addNode({
                name: nodePropertiesCopy.name,
                coordinates,
                image: nodePropertiesCopy.image,
                colors: fixedColors,
                font: nodePropertiesCopy.font,
                locked: nodePropertiesCopy.locked,
                isRoot: nodePropertiesCopy.isRoot,
            }, true, newParentNode.id)

            const children = this.copiedNodes.filter((np: ExportNodeProperties) => {
                return np.parent === nodeProperties.id
            })

            // If there are children add them.
            if (children.length > 0) {
                const nodes = this.map.nodes.getNodes()

                newParentNode = nodes[nodes.length - 1]

                children.forEach((np: ExportNodeProperties) => {
                    addNodes(np, newParentNode)
                })
            }
        }

        addNodes(this.copiedNodes[0], node)
    }

}