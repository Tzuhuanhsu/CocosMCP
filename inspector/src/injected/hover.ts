// Hover crosshair (2D/3D node picking) and design mode (drag nodes in the running game).
import { nodesById, flags, hoverState, treeState } from './state';
import { isEngine3_4OrNewer } from './engine-compat';
import { getEventTypes, readyUpdateTree } from './tree';
import { drawRect, clearRect } from './draw-rect';
import { getPath } from './node-path';

export const HoverMode = { OFF: 0, PICK_2D: 1, PICK_3D: 2 } as const;

export function toggleDesignMode( enabled: boolean ): void {
    flags.designMode = enabled;
    checkHover();
    if ( !enabled ) clearRect();
}

export function setHover( mode: number ): void {
    flags.hover = mode;
    checkHover();
    if ( !mode ) clearRect();
}

/**
 * (Re)registers the pick listeners. Registered on every Canvas in the scene - games commonly
 * keep a second Canvas under DontDestroyOnLoad and clicks there would otherwise be missed.
 */
export function checkHover(): void {
    const scene = cc.director.getScene();
    const canvases = ( scene?.getComponentsInChildren( cc.CanvasComponent ) ?? [] ).map( ( canvas: any ) => canvas.node );
    if ( !isEngine3_4OrNewer() ) unregisterHover( scene );
    canvases.forEach( unregisterHover );
    if ( flags.hover || flags.designMode ) {
        if ( !isEngine3_4OrNewer() ) registerHover( scene );
        canvases.forEach( registerHover );
    }
    treeState.checkAllOneTime = true;
    readyUpdateTree();
}

function registerHover( target: any ): void {
    if ( !target ) return;
    const et = getEventTypes();
    // Touch path (touch devices / touch simulators)
    target.on( et.TOUCH_CANCEL, onDesignTouch, null, true );
    target.on( et.TOUCH_MOVE, onDesignTouch, null, true );
    target.on( et.TOUCH_START, onDesignTouch, null, true );
    target.on( et.TOUCH_END, onPickCommit, null, true );
    // Mouse path. CC 3.4+ no longer synthesizes node TOUCH events from mouse input, so both the
    // crosshair click (MOUSE_UP) and design-mode drag (MOUSE_DOWN/MOVE/UP) must use mouse events.
    target.on( et.MOUSE_DOWN, onMouseDown, null, true );
    target.on( et.MOUSE_MOVE, onMouseMove, null, true );
    target.on( et.MOUSE_UP, onMouseUp, null, true );
}

function unregisterHover( target: any ): void {
    if ( !target ) return;
    const et = getEventTypes();
    target.off( et.TOUCH_CANCEL, onDesignTouch, null, true );
    target.off( et.TOUCH_MOVE, onDesignTouch, null, true );
    target.off( et.TOUCH_START, onDesignTouch, null, true );
    target.off( et.TOUCH_END, onPickCommit, null, true );
    target.off( et.MOUSE_DOWN, onMouseDown, null, true );
    target.off( et.MOUSE_MOVE, onMouseMove, null, true );
    target.off( et.MOUSE_UP, onMouseUp, null, true );
}

/** Reads a pointer event's UI-space delta, tolerating engine-version differences. */
function uiDelta( event: any ): { x: number; y: number } {
    if ( typeof event.getUIDelta === 'function' ) return event.getUIDelta();
    if ( typeof event.getDelta === 'function' ) return event.getDelta();
    return { x: 0, y: 0 };
}

/** Picks up the hovered node when a mouse drag starts in design mode (mirrors TOUCH_START). */
function onMouseDown( event: any ): void {
    if ( !flags.designMode ) return;
    beginDesignDrag();
    hoverState.dragging = true;
    event.propagationStopped = true;
    event.propagationImmediateStopped = true;
}

/** Ends a mouse drag / click: commit selection, then stop dragging (mirrors TOUCH_END). */
function onMouseUp( event: any ): void {
    hoverState.dragging = false;
    onPickCommit( event );
}

/** MOUSE_ENTER/LEAVE handler registered per renderable node (see tree.checkNode). */
export function onHoverNode( event: any ): void {
    if ( event.type === cc.Node.EventType.MOUSE_LEAVE ) {
        clearRect();
        hoverState.lastHoverNode = null;
        return;
    }
    if ( flags.hover === HoverMode.PICK_2D || flags.designMode ) {
        if ( flags.designMode && hoverState.lastDesignNode ) return;
        let node = event.target;
        if ( flags.designMode ) node = nodesById[ flags.lockDragNode as string ] || node;
        drawRect( node.uuid );
        hoverState.lastHoverNode = node;
        event.propagationStopped = true;
        event.propagationImmediateStopped = true;
    }
}

/** Mouse move: design-mode drag when a drag is in progress, otherwise 3D hover picking. */
function onMouseMove( event: any ): void {
    if ( flags.designMode && hoverState.dragging ) {
        const node = hoverState.lastDesignNode;
        if ( !node?.isValid ) return;
        const delta = uiDelta( event );
        const position = node.position;
        if ( !position ) return;
        position.add3f( delta.x, delta.y, 0 );
        node.setPosition( position );
        event.propagationStopped = true;
        event.propagationImmediateStopped = true;
        return;
    }
    if ( flags.hover !== HoverMode.PICK_3D ) return;
    if ( !hoverState.ray ) hoverState.ray = new cc.geometry.Ray();
    const camera = cc.director.getScene().getComponentInChildren( cc.CameraComponent );
    const location = event.getLocation();
    camera.screenPointToRay( location.x, location.y, hoverState.ray );
    const hit = cc.director.getScene()
        .getComponentsInChildren( cc.ModelComponent || 'cc.MeshRenderer' )
        .filter( ( model: any ) => model.model && model.node.activeInHierarchy )
        .map( ( model: any ) => [ model, cc.geometry.intersect.rayModel( hoverState.ray, model.model ) ] )
        .filter( ( entry: any[] ) => entry[ 1 ] > 0 )
        .sort( ( a: any[], b: any[] ) => a[ 1 ] - b[ 1 ] )[ 0 ];
    if ( hit ) {
        hoverState.lastHoverNode = hit[ 0 ].node;
        drawRect( hoverState.lastHoverNode.uuid );
    }
}

/** Click/tap commit: locate the hovered node in the inspector tree. */
function onPickCommit( event: any ): void {
    if ( !flags.hover && !flags.designMode ) return;
    if ( flags.hover && hoverState.lastHoverNode ) {
        const { uuidPath } = getPath( hoverState.lastHoverNode );
        locateNode( uuidPath );
    }
    if ( flags.designMode && hoverState.lastDesignNode ) {
        const { uuidPath } = getPath( hoverState.lastDesignNode );
        locateNode( uuidPath );
        drawRect( hoverState.lastDesignNode.uuid );
        hoverState.lastDesignNode = null;
    }
    if ( event ) {
        event.propagationStopped = true;
        event.propagationImmediateStopped = true;
    }
}

/** Picks up the currently hovered node for dragging, disabling layout/widget that would fight it. */
function beginDesignDrag(): void {
    hoverState.lastDesignNode = hoverState.lastHoverNode;
    const node = hoverState.lastDesignNode;
    if ( node && node.isValid ) {
        const parentLayout = node.parent?.getComponent( cc.LayoutComponent );
        if ( parentLayout ) parentLayout.enabled = false;
        const widget = node.getComponent( cc.WidgetComponent );
        if ( widget ) widget.enabled = false;
    }
}

/** Design-mode drag on touch devices: TOUCH_START picks up, TOUCH_MOVE drags, TOUCH_CANCEL commits. */
function onDesignTouch( event: any ): void {
    if ( !flags.hover && !flags.designMode ) return;
    event.propagationStopped = true;
    event.propagationImmediateStopped = true;
    if ( !flags.designMode ) return;
    const et = getEventTypes();
    switch ( event.type ) {
        case et.TOUCH_START:
            beginDesignDrag();
            break;
        case et.TOUCH_MOVE: {
            if ( !hoverState.lastDesignNode?.isValid ) return;
            const delta = uiDelta( event );
            const position = hoverState.lastDesignNode?.position;
            if ( !position ) break;
            position.add3f( delta.x, delta.y, 0 );
            hoverState.lastDesignNode?.setPosition( position );
            break;
        }
        case et.TOUCH_CANCEL:
            onPickCommit( undefined );
            break;
    }
}
