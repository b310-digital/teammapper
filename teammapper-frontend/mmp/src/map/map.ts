import * as d3 from 'd3'
import Events from './handlers/events'
import Zoom from './handlers/zoom'
import Draw from './handlers/draw'
import Options, {OptionParameters} from './options'
import History from './handlers/history'
import Drag from './handlers/drag'
import Nodes from './handlers/nodes'
import Export from './handlers/export'
import CopyPaste from './handlers/copy-paste'

/**
 * Initialize all handlers and return a mmp object.
 */
export default class MmpMap {

    public id: string
    public dom: DomElements
    public rootId: string

    public options: Options
    public history: History
    public events: Events
    public zoom: Zoom
    public draw: Draw
    public drag: Drag
    public nodes: Nodes
    public export: Export
    public copyPaste: CopyPaste

    public instance: MmpInstance

    /**
     * Create all handler instances, set some map behaviors and return a mmp instance.
     * @param {string} id
     * @param {OptionParameters} options
     * @returns {MmpInstance} mmpInstance
     */
    constructor(id: string, ref: HTMLElement, options?: OptionParameters) {
        this.id = id

        this.dom = {}
        this.events = new Events()
        this.options = new Options(options, this)
        this.zoom = new Zoom(this)
        this.history = new History(this)
        this.drag = new Drag(this)
        this.draw = new Draw(this, ref)
        this.nodes = new Nodes(this)
        this.export = new Export(this)
        this.copyPaste = new CopyPaste(this)
        this.rootId = ''

        this.draw.create()

        if (this.options.centerOnResize === true) {
            d3.select(window).on('resize.' + this.id, () => {
                this.zoom.center()
            })
        }

        if (this.options.zoom === true) {
            this.dom.svg.call(this.zoom.getZoomBehavior())
        }

        this.history.save()

        this.createMmpInstance()
    }

    /**
     * Remove permanently mmp instance.
     */
    private remove = () => {
        this.dom.svg.remove()

        const props = Object.keys(this.instance)
        for (let i = 0; i < props.length; i++) {
            delete this.instance[props[i]]
        }
    }

    /**
     * Return a mmp instance with all mmp library functions.
     * @return {MmpInstance} mmpInstance
     */
    private createMmpInstance(): MmpInstance {
        return this.instance = {
            addNode: this.nodes.addNode,
            center: this.zoom.center,
            copyNode: this.copyPaste.copy,
            cutNode: this.copyPaste.cut,
            deselectNode: this.nodes.deselectNode,
            getSelectedNode: this.nodes.getSelectedNode,
            editNode: this.nodes.editNode,
            toggleBranchVisibility: this.nodes.toggleBranchVisibility,
            existNode: this.nodes.existNode,
            exportAsImage: this.export.asImage,
            exportAsJSON: this.export.asJSON,
            exportNodeProperties: this.nodes.exportNodeProperties,
            exportRootProperties: this.nodes.exportRootProperties,
            exportSelectedNode: this.nodes.exportSelectedNode,
            highlightNode: this.nodes.highlightNodeWithColor,
            history: this.history.getHistory,
            new: this.history.new,
            nodeChildren: this.nodes.nodeChildren,
            on: this.events.on,
            pasteNode: this.copyPaste.paste,
            redo: this.history.redo,
            remove: this.remove,
            removeNode: this.nodes.removeNode,
            selectNode: this.nodes.selectNode,
            undo: this.history.undo,
            unsubscribeAll: this.events.unsubscribeAll,
            updateNode: this.nodes.updateNode,
            updateOptions: this.options.update,
            zoomIn: this.zoom.zoomIn,
            zoomOut: this.zoom.zoomOut
        }
    }

}

export interface MmpInstance {
    addNode: Function
    center: Function
    copyNode: Function
    cutNode: Function
    deselectNode: Function
    getSelectedNode: Function
    editNode: Function
    toggleBranchVisibility: Function
    existNode: Function
    exportAsImage: Function
    exportAsJSON: Function
    exportNodeProperties: Function
    exportRootProperties: Function
    exportSelectedNode: Function
    highlightNode: Function
    history: Function
    new: Function
    nodeChildren: Function
    on: Function
    pasteNode: Function
    redo: Function
    remove: Function
    removeNode: Function
    selectNode: Function
    undo: Function
    unsubscribeAll: Function
    updateNode: Function
    updateOptions: Function
    zoomIn: Function
    zoomOut: Function
}

export interface DomElements {
    container?: any
    g?: any
    svg?: any
}
