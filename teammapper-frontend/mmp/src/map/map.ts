import * as d3 from 'd3'
import Events from './handlers/events'
import Zoom from './handlers/zoom'
import Draw from './handlers/draw'
import Options, {OptionParameters} from './options'
import History, { MapSnapshot } from './handlers/history'
import Drag from './handlers/drag'
import Nodes from './handlers/nodes'
import Export from './handlers/export'
import CopyPaste from './handlers/copy-paste'
import { UserNodeProperties } from './types'

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
        // We define every function as an arrow function to preserve proper "this" context within all methods.
        return this.instance = {
            addNode: (userProperties?: UserNodeProperties, notifyWithEvent: boolean = true, updateHistory: boolean = true, parentId?: string, overwriteId?: string) => 
                this.nodes.addNode(userProperties, notifyWithEvent, updateHistory, parentId, overwriteId),
                
            center: (type?: 'zoom' | 'position', duration: number = 500) => 
                this.zoom.center(type, duration),
                
            copyNode: (id: string) => 
                this.copyPaste.copy(id),
                
            cutNode: (id: string) => 
                this.copyPaste.cut(id),
                
            applyCoordinatesToMapSnapshot: (nodes) => 
                this.nodes.applyCoordinatesToMapSnapshot(nodes),
                
            deselectNode: () => 
                this.nodes.deselectNode(),
                
            getSelectedNode: () => 
                this.nodes.getSelectedNode(),
                
            editNode: () => 
                this.nodes.editNode(),
                
            toggleBranchVisibility: () => 
                this.nodes.toggleBranchVisibility(),
                
            existNode: (id?: string): boolean => 
                this.nodes.existNode(id),
                
            exportAsImage: (callback: Function, type?: string) => 
                this.export.asImage(callback, type),
                
            exportAsJSON: (): MapSnapshot => 
                this.export.asJSON(),
                
            exportNodeProperties: (id: string) => 
                this.nodes.exportNodeProperties(id),
                
            exportRootProperties: () => 
                this.nodes.exportRootProperties(),
                
            exportSelectedNode: () => 
                this.nodes.exportSelectedNode(),
                
            highlightNode: (id: string, color: string, notifyWithEvent: boolean = true) => 
                this.nodes.highlightNodeWithColor(id, color, notifyWithEvent),
                
            history: () => 
                this.history.getHistory(),
                
            new: (snapshot?: MapSnapshot, notifyWithEvent: boolean = true) => 
                this.history.new(snapshot, notifyWithEvent),
                
            nodeChildren: (id?: string) => 
                this.nodes.nodeChildren(id),
                
            on: (event: string, callback: Function) => 
                this.events.on(event, callback),
                
            pasteNode: (id: string) => 
                this.copyPaste.paste(id),
                
            redo: () => 
                this.history.redo(),
                
            remove: () => 
                this.remove(),
                
            removeNode: (id?: string, notifyWithEvent: boolean = true) => 
                this.nodes.removeNode(id, notifyWithEvent),
                
            selectNode: (id?: string) => 
                this.nodes.selectNode(id),
                
            undo: () => 
                this.history.undo(),
                
            unsubscribeAll: () => 
                this.events.unsubscribeAll(),
                
            updateNode: (property: string, value: any, notifyWithEvent: boolean = true, updateHistory: boolean = true, id?: string) => 
                this.nodes.updateNode(property, value, notifyWithEvent, updateHistory, id),
                
            updateOptions: (property: string, value: any) => 
                this.options.update(property, value),
                
            zoomIn: (duration?: number) => 
                this.zoom.zoomIn(duration),
                
            zoomOut: (duration?: number) => 
                this.zoom.zoomOut(duration)
        }
    }

}

export interface MmpInstance {
    addNode: Function
    center: Function
    copyNode: Function
    cutNode: Function
    applyCoordinatesToMapSnapshot: Function
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
