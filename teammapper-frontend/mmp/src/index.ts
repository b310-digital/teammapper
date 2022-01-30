import {OptionParameters} from './map/options'
import MmpMap from './map/map'
import { PropertyMapping } from './map/handlers/nodes'
import { marked, Renderer } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Return a mmp object with all mmp functions.
 */
export function create (id: string, options?: OptionParameters) {
    return new MmpMap(id, options)
}

DOMPurify.setConfig({ADD_ATTR: ['contenteditable']})

const renderer = {
    link(href: string, title: string, text: string): string {
        const link: string = new Renderer().link(href, title, text)
        return link.slice(0, 2) + ' contenteditable="false" ' + link.slice(3)
    }
}
marked.use({ renderer })

export const NodePropertyMapping = PropertyMapping
