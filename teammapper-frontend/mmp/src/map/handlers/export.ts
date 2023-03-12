import Map from '../map'
import Log from '../../utils/log'
import {MapSnapshot} from './history'
import Utils from '../../utils/utils'
import {Event} from './events'

/**
 * Manage map image exports.
 */
export default class Export {

    private map: Map

    /**
     * Get the associated map instance.
     * @param {Map} map
     */
    constructor(map: Map) {
        this.map = map
    }

    /**
     * Return the snapshot (json) of the current map.
     * @returns {MapSnapshot} json
     */
    public asJSON = (): MapSnapshot => {
        const snapshot = this.map.history.current()
        console.log(snapshot)

        this.map.events.call(Event.exportJSON)

        return Utils.cloneObject(snapshot)
    }

    /**
     * Return the image data URI in the callback function.
     * @param {Function} callback
     * @param {string} type
     */
    public asImage = (callback: Function, type?: string) => {
        if (typeof callback !== 'function') {
            Log.error('The first parameter must be a function', 'type')
        }

        if (type && typeof type !== 'string') {
            Log.error('The second optional parameter must be a string', 'type')
        }

        this.map.nodes.deselectNode()

        this.dataURI(url => {
            if(type === 'svg') {
                return callback(url)
            }

            const image = new Image()

            image.src = url

            image.onload = () => {
                const canvas = document.createElement('canvas'),
                      context = canvas.getContext('2d')

                canvas.width = image.width
                canvas.height = image.height
                context.drawImage(image, 0, 0)
                context.globalCompositeOperation = 'destination-over'
                context.fillStyle = '#ffffff'
                context.fillRect(0, 0, canvas.width, canvas.height)

                if (typeof type === 'string') {
                    type = 'image/' + type
                }

                callback(canvas.toDataURL(type))
                this.map.events.call(Event.exportImage)
            }

            image.onerror = () => {
                Log.error('The image has not been loaded correctly')
            }
        })
    }

    /**
     * Convert the mind map svg in the data URI.
     * @param {Function} callback
     */
    private dataURI(callback: Function) {
        const element = this.map.dom.g.node(),
            clone = element.cloneNode(true),
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
            box = element.getBBox(),
            css = Utils.cssRules(element),
            xmlns = 'http://www.w3.org/2000/xmlns/',
            padding = 15,
            x = box.x - padding, y = box.y - padding,
            w = box.width + padding * 2, h = box.height + padding * 2

        svg.setAttributeNS(xmlns, 'xmlns', 'http://www.w3.org/2000/svg')
        svg.setAttributeNS(xmlns, 'xmlns:xlink', 'http://www.w3.org/1999/xlink')
        svg.setAttribute('version', '1.1')
        svg.setAttribute('width', w)
        svg.setAttribute('height', h)
        svg.setAttribute('viewBox', [x, y, w, h].join(' '))

        // If there is css, insert it
        if (css !== '') {
            const style = document.createElement('style'),
                defs = document.createElement('defs')

            style.setAttribute('type', 'text/css')
            style.innerHTML = '<![CDATA[\n' + css + '\n]]>'
            defs.appendChild(style)
            svg.appendChild(defs)
        }

        clone.setAttribute('transform', 'translate(0,0)')
        svg.appendChild(clone)

        this.convertImages(clone, () => {
            const xmls = new XMLSerializer(),
                reader = new FileReader()

            const blob = new Blob([
                xmls.serializeToString(svg)
            ], {
                type: 'image/svg+xml'
            })

            reader.readAsDataURL(blob)

            reader.onloadend = () => {
                callback(reader.result)
            }
        })
    }

    /**
     * If there are images in the map convert their href in dataURI.
     * @param {HTMLElement} element
     * @param {Function} callback
     */
    private convertImages(element: HTMLElement, callback: Function) {
        let images = element.querySelectorAll('image'),
            counter = images.length

        if (counter > 0) {
            for (const image of images as any) {
                const canvas = document.createElement('canvas'),
                    ctx = canvas.getContext('2d'),
                    img = new Image(),
                    href = image.getAttribute('href')

                img.crossOrigin = 'Anonymous'

                img.src = href

                img.onload = function () {
                    canvas.width = img.width
                    canvas.height = img.height
                    ctx.drawImage(img, 0, 0)

                    image.setAttribute('href', canvas.toDataURL('image/png'))

                    counter--

                    if (counter === 0) {
                        callback()
                    }
                }
                img.onerror = () => {
                    counter--

                    if (counter === 0) {
                        callback()
                    }
                }

            }
        } else {
            callback()
        }
    }

}