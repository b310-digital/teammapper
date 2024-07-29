import * as d3 from 'd3'
import DOMPurify from 'dompurify'
import Map from '../map'
import Utils from '../../utils/utils'
import Node from '../models/node'
import {Path} from 'd3-path'

/**
 * Draw the map and update it.
 */
export default class Draw {

    private map: Map
    private base64regex: RegExp = /[^a-zA-Z0-9+\/;:,=]/i
    private editing: boolean = false
    private mapRef: HTMLElement

    /**
     * Get the associated map instance.
     * @param {Map} map
     */
    constructor(map: Map, ref: HTMLElement) {
        this.map = map
        this.mapRef = ref
    }

    /**
     * Create svg and main css map properties.
     */
    public create() {
        this.map.dom.container = d3.select(this.mapRef)
            .style('position', 'relative')

        this.map.dom.svg = this.map.dom.container.append('svg')
            .style('position', 'absolute')
            .style('width', '100%')
            .style('height', '100%')
            .style('top', 0)
            .style('left', 0)

        this.map.dom.svg.append('rect')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('fill', 'white')
            .attr('pointer-events', 'all')
            .on('click', () => {
                // Deselect the selected node when click on the map background
                this.map.nodes.deselectNode()
            })

        this.map.dom.g = this.map.dom.svg.append('g')
    }

    /**
     * Update the dom of the map with the (new) nodes.
     */
    public update() {
        let nodes = this.map.nodes.getNodes().filter(node => !node.hidden)

        const dom = {
            nodes: this.map.dom.g.selectAll('.' + this.map.id + '_node').data(nodes, (d) => d.id),
            branches: this.map.dom.g.selectAll('.' + this.map.id + '_branch').data(nodes.slice(1), (d) => d.id)
        }
        let tapedTwice = false

        dom.nodes.each((node: Node) => {
            const hasHiddenChildren = this.map.nodes.nodeChildren(node.id)?.filter(x => x.hidden).length > 0
            if (hasHiddenChildren) {
                this.setHiddenChildrenIcon(node)
            } else {
                this.removeHiddenChildrenIcon(node)
            }
        })

        const outer = dom.nodes.enter().append('g')
            .style('cursor', 'pointer')
            .style('touch-action', 'none')
            .attr('class', this.map.id + '_node')
            .attr('id', function (node: Node) {
                node.dom = this
                return node.id
            })
            .attr('transform', (node: Node) => 'translate(' + node.coordinates.x + ',' + node.coordinates.y + ')')
            .on('dblclick', (event: MouseEvent, node: Node) => {
                if (!this.map.options.edit) return

                event.stopPropagation()
                this.enableNodeNameEditing(node)
            }).on('touchstart', (event: TouchEvent, node: Node) => {
                if (!this.map.options.edit) return false
                // When not clicking a link and not in edit mode, disable all mobile native touch events
                // A single tap is supposed to move the node in this application
                if(!this.isLinkTarget(event) && !this.editing) {
                    event.preventDefault()
                }

                // a single tap should enter moving node mode - not a selection
                if (!tapedTwice) {
                    tapedTwice = true

                    setTimeout(function () {
                        tapedTwice = false
                    }, 300)

                    return false
                }

                this.enableNodeNameEditing(node)
            })
        if (this.map.options.drag === true) {
            outer.call(this.map.drag.getDragBehavior())
        } else {
            outer.on('mousedown', (node: Node) => {
                this.map.nodes.selectNode(node.id)
            })
        }

        // Set text of the node
        outer.insert('foreignObject')
            .html((node: Node) => this.createNodeNameDOM(node))
            .each((node: Node) => {
                this.updateNodeNameContainer(node)
            })

        // Set background of the node
        outer.insert('path', 'foreignObject')
            .style('fill', (node: Node) => DOMPurify.sanitize(node.colors.background))
            .style('stroke-width', 3)
            .attr('d', (node: Node) => this.drawNodeBackground(node))

        
        // Set image and link of the node
        outer.each((node: Node) => {
            this.setImage(node)
            this.setLink(node)
        })


        dom.branches.enter().insert('path', 'g')
            .style('fill', (node: Node) => DOMPurify.sanitize(node.colors.branch))
            .style('stroke', (node: Node) => DOMPurify.sanitize(node.colors.branch))
            .attr('class', this.map.id + '_branch')
            .attr('id', (node: Node) => node.id + '_branch')
            .attr('d', (node: Node) => this.drawBranch(node))

        dom.nodes.exit().remove()
        dom.branches.exit().remove()
    }

    /**
     * Remove all nodes and branches of the map.
     */
    public clear() {
        d3.selectAll('.' + this.map.id + '_node, .' + this.map.id + '_branch').remove()
    }

    /**
     * Draw the background shape of the node.
     * @param {Node} node
     * @returns {Path} path
     */
    public drawNodeBackground(node: Node): Path {
        const name = node.getNameDOM(),
            path = d3.path()

        node.dimensions.width = name.clientWidth + 45
        node.dimensions.height = name.clientHeight + 30

        const x = node.dimensions.width / 2,
            y = node.dimensions.height / 2,
            k = node.k

        path.moveTo(-x, k / 3)
        path.bezierCurveTo(-x, -y + 10, -x + 10, -y, k, -y)
        path.bezierCurveTo(x - 10, -y, x, -y + 10, x, k / 3)
        path.bezierCurveTo(x, y - 10, x - 10, y, k, y)
        path.bezierCurveTo(-x + 10, y, -x, y - 10, -x, k / 3)
        path.closePath()

        return path
    }

    /**
     * Draw the branch of the node.
     * @param {Node} node
     * @returns {Path} path
     */
    public drawBranch(node: Node): Path {
        if(node.parent === undefined || node.parent === null) return

        const parent = node.parent,
            path = d3.path(),
            level = node.getLevel(),
            width = 22 - (level < 6 ? level : 6) * 3,
            mx = (parent.coordinates.x + node.coordinates.x) / 2,
            ory = parent.coordinates.y < node.coordinates.y + node.dimensions.height / 2 ? -1 : 1,
            orx = parent.coordinates.x > node.coordinates.x ? -1 : 1,
            inv = orx * ory

        path.moveTo(parent.coordinates.x, parent.coordinates.y - width * .8)
        path.bezierCurveTo(
            mx - width * inv, parent.coordinates.y - width / 2,
            parent.coordinates.x - width / 2 * inv, node.coordinates.y + node.dimensions.height / 2 - width / 3,
            node.coordinates.x - node.dimensions.width / 3 * orx, node.coordinates.y + node.dimensions.height / 2 + 3
        )
        path.bezierCurveTo(
            parent.coordinates.x + width / 2 * inv, node.coordinates.y + node.dimensions.height / 2 + width / 3,
            mx + width * inv, parent.coordinates.y + width / 2,
            parent.coordinates.x, parent.coordinates.y + width * .8
        )
        path.closePath()

        return path
    }

    /**
     * Update the node HTML elements.
     * @param {Node} node
     */
    public updateNodeShapes(node: Node) {
        const background = node.getBackgroundDOM()

        d3.select(background).attr('d', (node: Node) => this.drawNodeBackground(node) as any)
        d3.selectAll('.' + this.map.id + '_branch').attr('d', (node: Node) => this.drawBranch(node) as any)

        this.updateImagePosition(node)
        this.updateLinkPosition(node)

        this.updateNodeNameContainer(node)
    }

    /**
     * Set main properties of node image and create it if it does not exist.
     * @param {Node} node
     */
    public setImage(node: Node) {
        let domImage = node.getImageDOM()

        if (!domImage) {
            domImage = document.createElementNS('http://www.w3.org/2000/svg', 'image')
            node.dom.appendChild(domImage)
        }

        if (DOMPurify.sanitize(node.image.src) !== '' && !this.base64regex.test(node.image.src)) {
            const image = new Image()

            image.src = DOMPurify.sanitize(node.image.src)

            image.onload = function () {
                const h = node.image.size,
                    w = (this as any).width * h / (this as any).height,
                    y = -(h + node.dimensions.height / 2 + 5),
                    x = -w / 2

                domImage.setAttribute('href', DOMPurify.sanitize(node.image.src))
                domImage.setAttribute('height', h.toString())
                domImage.setAttribute('width', w.toString())
                domImage.setAttribute('y', y.toString())
                domImage.setAttribute('x', x.toString())
                domImage.setAttribute('clip-path', 'inset(0% round 15px)')
            }

            image.onerror = function () {
                domImage.remove()
                node.image.src = ''
            }
        } else {
            domImage.remove()
        }
    }

    /**
     * Set main properties of node image and create it if it does not exist.
     * @param {Node} node
     */
    public setLink(node: Node) {
        let domLink = node.getLinkDOM()

        if (!domLink) {
            domLink = document.createElementNS('http://www.w3.org/2000/svg', 'a')
            const domText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            domText.textContent = 'link'
            domText.classList.add('link-text')
            domText.classList.add('material-icons')
            domText.style.setProperty('fill', DOMPurify.sanitize(node.colors.name))
            domText.setAttribute('y', node.dimensions.height.toString())
            domText.setAttribute('x', '-10')
            node.dom.appendChild(domLink)
            domLink.appendChild(domText)
        }

        if (DOMPurify.sanitize(node.link.href) !== '') {
            domLink.setAttribute('href', DOMPurify.sanitize(node.link.href))
            domLink.setAttribute('target', '_self')

        } else {
            domLink.remove()
        }
    }

    /**
     * Set a hidden eye icon if child nodes are hidden.
     * @param {Node} node
     */
    public setHiddenChildrenIcon(node: Node) {
        let domText = node.getHiddenChildIconDOM()
        if (!domText) {
            domText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
            domText.textContent = 'visibility_off'
            domText.classList.add('material-icons')
            domText.style.setProperty('fill', DOMPurify.sanitize(node.colors.name))
            domText.setAttribute('y', (-node.dimensions.height + 30).toString())
            domText.setAttribute('x', '-60')
            node.dom.appendChild(domText)
        }
    }

    /**
     * Explicitly remove the hidden eye icon even if not set
     * @param {Node} node
     */
    public removeHiddenChildrenIcon(node) {
        const domText = node.getHiddenChildIconDOM()
        if (domText) {
            domText.remove()
        }
    }

    /**
     * Update the node image position.
     * @param {Node} node
     */
    public updateImagePosition(node: Node) {
        if (DOMPurify.sanitize(node.image.src) !== '') {
            const image = node.getImageDOM(),
                y = -((image as any).getBBox().height + node.dimensions.height / 2 + 5)
            image.setAttribute('y', y.toString())
        }
    }

    /**
     * Update the node link position.
     * @param {Node} node
     */
    public updateLinkPosition(node: Node) {
        if (DOMPurify.sanitize(node.link.href) !== '') {
            const link = node.getLinkDOM(),
                  y = node.dimensions.height
            link.setAttribute('y', y.toString())
        }
    }

    /**
     * Enable and manage all events for the name editing.
     * @param {Node} node
     */
    public enableNodeNameEditing(node: Node) {
        this.editing = true
        const name = node.getNameDOM()
        name.setAttribute('contenteditable', 'true')
        name.innerHTML = DOMPurify.sanitize(node.name)

        Utils.focusWithCaretAtEnd(name)

        name.style.setProperty('cursor', 'auto')

        this.updateNodeShapes(node)

        name.ondblclick = name.onmousedown = (event) => {
            event.stopPropagation()
        }

        name.oninput = () => {
            this.updateNodeShapes(node)
        }

        // Allow only some shortcuts.
        name.onkeydown = (event) => {
            // Unfocus the node.
            if (event.code === 'Escape') {
                Utils.removeAllRanges()
                name.blur()
            }

            if (event.ctrlKey || event.metaKey) {
                switch (event.code) {
                    case 'KeyA':
                    case 'KeyC':
                    case 'KeyV':
                    case 'KeyX':
                    case 'KeyZ':
                    case 'ArrowLeft':
                    case 'ArrowRight':
                    case 'ArrowUp':
                    case 'ArrowDown':
                    case 'Backspace':
                    case 'Delete':
                        return true
                    default:
                        return false
                }
            }

            switch (event.code) {
                case 'Tab':
                    return false
                default:
                    return true
            }
        }

        // Remove html formatting when paste text on node
        name.onpaste = (event) => {
            event.preventDefault()

            const text = event.clipboardData.getData('text/plain')

            document.execCommand('insertHTML', false, text)
        }

        name.onblur = () => {
            this.editing = false

            if (name.innerHTML !== node.name) {
                this.map.nodes.updateNode('name', DOMPurify.sanitize(name.innerHTML))
            }
            name.innerHTML = DOMPurify.sanitize(name.innerHTML)
            this.updateNodeShapes(node)

            name.ondblclick = name.onmousedown = name.onblur =
                name.onkeydown = name.oninput = name.onpaste = null

            name.setAttribute('contenteditable', 'false')
            name.style.setProperty('cursor', 'pointer')

            name.blur()
        }
    }

    /**
     * Update node name container (foreign object) dimensions.
     * @param {Node} node
     */
    private updateNodeNameContainer(node: Node) {
        const name = node.getNameDOM(),
              foreignObject: SVGForeignObjectElement = name?.parentNode as SVGForeignObjectElement
        
        const [width, height]: number[] = (() => {
            if (!this.browserIsFirefox()) {
              // Default case
              // Text is rendered based on needed width and height
              // works well at least for chrome and safari
              name.style.setProperty('width', 'auto')
              name.style.setProperty('height', 'auto')
              return [name.clientWidth, name.clientHeight]
            } else {
              // More recent versions of firefox seem to render too late to actually fetch the width and height of the dom element.
              // In these cases, try to approximate height and width before rendering.
              name.style.setProperty('width', '100%')
              name.style.setProperty('height', '100%')
              // split by line break
              const linesByLineBreaks = name.textContent.split(/\r?\n|\r|\n/g)
              // take longest line as width, when no lines are present use 1 as length
              const width = Math.max(...linesByLineBreaks.map((line: string) => line.length), 1)
              // take number of lines as height factor
              const height = linesByLineBreaks.length
              return [width * node.font.size / 1.2, height * node.font.size * 1.2]
            }
        })().map((value: number) => Math.max(value, 25))

        foreignObject.setAttribute('x', (-width / 2).toString())
        foreignObject.setAttribute('y', (-height / 2).toString())
        foreignObject.setAttribute('width', width.toString())
        foreignObject.setAttribute('height', height.toString())
    }

    /**
     * Create a string with HTML of the node name div.
     * @param {Node} node
     * @returns {string} html
     */
    private createNodeNameDOM(node: Node) {
        const div = document.createElement('div')

        div.style.setProperty('font-size', DOMPurify.sanitize(node.font.size.toString()) + 'px')
        div.style.setProperty('color', DOMPurify.sanitize(node.colors.name))
        div.style.setProperty('font-style', DOMPurify.sanitize(node.font.style))
        div.style.setProperty('font-weight', DOMPurify.sanitize(node.font.weight))
        div.style.setProperty('text-decoration', DOMPurify.sanitize(node.font.decoration))

        div.style.setProperty('touch-action', 'none')
        div.style.setProperty('display', 'inline-block')
        div.style.setProperty('white-space', 'pre')
        div.style.setProperty('width', 'auto')
        div.style.setProperty('height', 'auto')
        div.style.setProperty('font-family', this.map.options.fontFamily)
        div.style.setProperty('text-align', 'center')
        // fix against cursor jumping out of nodes on firefox if empty
        div.style.setProperty('min-width', '20px')

        div.innerHTML = DOMPurify.sanitize(node.name)

        return div.outerHTML
    }

    /**
     * Checks if the target of the event is the link below the node
     * @param {TouchEvent} event
     * @returns {boolean}
     */
    private isLinkTarget(event: TouchEvent): boolean {
        return event.target['classList'][0] === 'link-text'
    }

    /**
     * Checks if the browser is firefox
     * @returns {boolean}
     */
    private browserIsFirefox(): boolean {
        return navigator.userAgent.toLowerCase().indexOf('firefox') > -1
    }
}
