import Map from '../map'
import Log from '../../utils/log'
import {MapSnapshot} from './history'
import Utils from '../../utils/utils'
import {Event} from './events'
import * as d3 from 'd3'
import DOMPurify from 'dompurify'

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
                      context = canvas.getContext('2d'),
                      scale = window.devicePixelRatio || 1

                // need to adjust scale of the image
                // see https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio
                canvas.style.width = image.width +'px'
                canvas.style.height = image.height +'px'
                canvas.width = Math.floor(image.width * scale);
                canvas.height = Math.floor(image.height * scale);
                context.scale(scale, scale);

                context.drawImage(image, 0, 0)
                context.globalCompositeOperation = 'destination-over'
                context.fillStyle = '#ffffff'
                context.fillRect(0, 0, canvas.width, canvas.height)

                if (typeof type === 'string') {
                    type = 'image/' + type
                }
                // Safari seems to have an issue with loading all included images on time during the download of the data url.
                // This is a small workaround, as calling toBlob before seems to solve the problem most of the times.
                canvas.toBlob(() => {})
                
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

        // Remove any text related to Material Icons
        d3.select(clone).selectAll('text.material-icons').text('')

        // convert all foreignObjects to native svg text to ensure better compatibility with svg readers
        d3.select(clone).selectAll('foreignObject').nodes().forEach((fo: HTMLElement) => {
            const parent = fo.parentElement
            const x = parseInt(fo.getAttribute('x'), 10) + Math.floor(parseInt(fo.getAttribute('width'), 10) / 2)
            const splittedText = fo.firstChild.textContent.split('\n')
            // line breaks are created via tspan elements that are relatively positioned using dy property
            const svgTextWithLineBreaks = splittedText.map((text, i) => `<tspan dy="${(i === 0) ? '0' : '1.2em'}" x="${x}">${text}</tspan>`)
            const textSVG = DOMPurify.sanitize(svgTextWithLineBreaks.join(''), { USE_PROFILES: { svg: true }, NAMESPACE: 'http://www.w3.org/2000/svg'})
            d3.select(parent)
              .attr('width', fo.getAttribute('width'))
              .append('text')
              .attr('y', parseInt(fo.getAttribute('y'), 10) + parseInt((fo.firstElementChild as HTMLElement).style.fontSize, 10))
              .attr('x', x)
              .attr('text-anchor', 'middle')
              .attr('font-family', (fo.firstElementChild as HTMLElement).style.fontFamily)
              .attr('font-size', (fo.firstElementChild as HTMLElement).style.fontSize)
              .attr('fill', (fo.firstElementChild as HTMLElement).style.color)
              .html(textSVG)
            fo.remove()
        })

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