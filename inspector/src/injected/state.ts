// Probe state. Values the inspector renderer assigns directly (executeJavaScript strings like
// "__hover=1;__autoUpdateTree=true;") MUST live on window; module-internal state stays here.

export const w = window as unknown as Record<string, any>;

/** node uuid -> live cc.Node; kept on window (as `__nd`) for console debugging parity. */
export const nodesById: Record<string, any> = ( w.__nd = w.__nd ?? {} );

/** Host-controlled flags: read/written by the renderer through direct window assignment. */
export const flags = {
    get hover(): number { return w.__hover ?? 0; },
    set hover( value: number ) { w.__hover = value; },
    get designMode(): boolean { return Boolean( w.__designMode ); },
    set designMode( value: boolean ) { w.__designMode = value; },
    get lockDragNode(): string | null { return w.__lockDragNode ?? null; },
    set lockDragNode( value: string | null ) { w.__lockDragNode = value; },
    get autoUpdateTree(): boolean { return w.__autoUpdateTree ?? true; },
    get syncNodeDetail(): boolean { return Boolean( w.__syncNodeDetail ); },
    get logCount(): number { return Number( w.__logCount ?? 0 ); },
    get showDevToolInTab(): boolean { return Boolean( w.__showDevToolInTab ); },
    get statistic(): boolean { return Boolean( w.__statistic ); },
    set statistic( value: boolean ) { w.__statistic = value; },
};

/** node uuid -> { [eventName]: true } - node breakpoints (debugger on node events). */
export const breakPoints: Record<string, Record<string, boolean>> = {};

/** node uuid -> true when its subtree is expanded in the inspector tree. */
export const openedNodes: Record<string, boolean> = {};

/** node uuid -> true when auto tree updates are suppressed for that subtree. */
export const donotAutoUpdates: Record<string, boolean> = {};

/** [timestamp, [uuid, name]] log of active-in-hierarchy changes while statistics run. */
export const nodeLogs: Array<[ number, [ string, string ] ]> = [];

export const treeState = {
    /** serialize every node once on the next tree pass (ignores openedNodes gating) */
    checkAllOneTime: false,
    /** DrawCall analysis mode */
    dcMode: false,
    lastAtlasId: null as string | null,
    lastTreeTime: 0,
    /** suppress one node-detail sync echo after the inspector itself wrote a value */
    stopSyncDetailOneTime: false,
};

export const detailState = {
    lastDetailNode: null as any,
    pendingDetailFun: null as ( () => void ) | null,
    /** fgui GComponent instance used to filter base-class keys out of $gobj serialization */
    fcom: null as any,
};

export const hoverState = {
    lastHoverNode: null as any,
    lastDesignNode: null as any,
    ray: null as any,
    /** true while a mouse button is held during a design-mode drag (CC 3.4+ mouse path) */
    dragging: false,
};
