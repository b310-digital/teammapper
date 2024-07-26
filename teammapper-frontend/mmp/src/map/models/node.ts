import * as d3 from 'd3'

/**
 * Model of the nodes.
 */
export default class Node implements NodeProperties {

    public id: string
    public parent: Node
    public k: number

    public name: string
    public dimensions: Dimensions
    public coordinates: Coordinates
    public image: Image
    public colors: Colors
    public font: Font
    public link: Link
    public locked: boolean
    public dom: SVGGElement
    public isRoot: boolean
    public detached: boolean
    public hidden: boolean

    /**
     * Initialize the node properties, the dimensions and the k coefficient.
     * @param {NodeProperties} properties
     */
    constructor(properties: NodeProperties) {
        this.id = properties.id
        this.parent = properties.parent
        this.name = properties.name
        this.coordinates = properties.coordinates
        this.colors = properties.colors
        this.image = properties.image
        this.font = properties.font
        this.link = properties.link
        this.locked = properties.locked
        this.isRoot = properties.isRoot
        this.detached = properties.detached
        this.hidden = properties.hidden

        this.dimensions = {
            width: 0,
            height: 0
        }
        this.k = properties.k || d3.randomUniform(-20, 20)()
    }

    /**
     * Return the level of the node.
     * @returns {number} level
     */
    public getLevel(): number {
        let level = 1, parent = this.parent

        while (parent) {
            level++
            parent = parent.parent
        }

        return level
    }

    /**
     * Return the div element of the node name.
     * @returns {HTMLDivElement} div
     */
    public getNameDOM(): HTMLDivElement {
        return this.dom.querySelector('foreignObject > div')
    }

    /**
     * Return the SVG path of the node background.
     * @returns {SVGPathElement} path
     */
    public getBackgroundDOM(): SVGPathElement {
        return this.dom.querySelector('path')
    }

    /**
     * Return the SVG image of the node image.
     * @returns {SVGImageElement} image
     */
    public getImageDOM(): SVGImageElement {
        return this.dom.querySelector('image')
    }

    /**
     * Return the SVG a of the node link.
     * @returns {SVGIAElement} a
     */
    public getLinkDOM(): SVGAElement {
        // Unfortunately typescript returns an html type as default - in this case its a SVG element
        // https://github.com/microsoft/TypeScript/issues/51844
        return this.dom.querySelector('a > text') as any
    }

    /**
     * Returns the SVG text of the hidden child icon.
     * @returns {SVGITextElement} text
     */
    public getHiddenChildIconDOM(): SVGTextElement {
        return this.dom.querySelector('text') as any
    }

}

export interface UserNodeProperties {
    name?: string
    coordinates?: Coordinates
    image?: Image
    link?: Link
    colors?: Colors
    font?: Font
    locked?: boolean
    isRoot?: boolean
    detached?: boolean
    hidden?: boolean
    hasHiddenChildNodes?: boolean
}

export interface NodeProperties extends UserNodeProperties {
    id: string
    parent: Node
    k?: number
}

export interface ExportNodeProperties extends UserNodeProperties {
    id: string
    parent: string
    k: number
}

export interface Coordinates {
    x: number
    y: number
}

export interface Dimensions {
    width: number
    height: number
}

export interface Image {
    src: string
    size: number
}

export interface Link {
    href: string
}

export interface Colors {
    name?: string
    background?: string
    branch: string
}

export interface Font {
    size: number
    style: string
    weight: string
    decoration: string
}
