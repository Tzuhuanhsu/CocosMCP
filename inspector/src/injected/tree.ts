// Scene-tree serialization and change tracking.
import { nodesById, flags, breakPoints, openedNodes, donotAutoUpdates, nodeLogs, treeState, detailState } from './state';
import { getSchedule } from './engine-compat';
import { onHoverNode } from './hover';
import { getNodeDetail, readyGetNodeDetail } from './node-detail';

const TREE_UPDATE_THROTTLE_MS = 2000;
const TREE_UPDATE_DELAY_S = 0.1;
/** marker event used both as an update trigger and as the "already instrumented" probe */
const MARKER_EVENT = '__haha__';

let eventTypes: any = null;
let watchedEvents: any[] | null = null;

function ensureEventTypes(): void {
    if ( !eventTypes ) eventTypes = cc.Node.EventType;
    if ( !watchedEvents ) {
        watchedEvents = [ eventTypes.TRANSFORM_CHANGED, eventTypes.SIZE_CHANGED, eventTypes.COLOR_CHANGED ];
    }
}

export function getEventTypes(): any {
    ensureEventTypes();
    return eventTypes;
}

export function getGobjName( gobj: any ): string {
    let name = gobj.name;
    if ( !name ) {
        if ( gobj.packageItem ) name = gobj.packageItem.name;
        else if ( gobj.constructor ) name = gobj.constructor.name;
    }
    return name;
}

export function toggleDC(): void {
    treeState.dcMode = !treeState.dcMode;
    readyUpdateTree();
}

function isNodeInstrumented( node: any ): boolean {
    return node.__listened && !( node._eventProcessor && !node._eventProcessor.hasEventListener( MARKER_EVENT ) );
}

export function hasBreakPoint( nodeId: string, eventName: string ): boolean {
    return Boolean( breakPoints[ nodeId ]?.[ eventName ] );
}

/** Attaches inspector listeners to a node once: hover, change tracking, node breakpoints. */
export function checkNode( node: any ): void {
    ensureEventTypes();
    if ( isNodeInstrumented( node ) ) return;

    node.off( eventTypes.MOUSE_ENTER, onHoverNode );
    node.off( eventTypes.MOUSE_LEAVE, onHoverNode );
    if ( node.getComponent( cc.RenderableComponent ) && node.getComponent( cc.UITransformComponent ) ) {
        node.on( eventTypes.MOUSE_ENTER, onHoverNode );
        node.on( eventTypes.MOUSE_LEAVE, onHoverNode );
    }

    const breakIfSet = ( eventName: string ): void => {
        if ( hasBreakPoint( node._id, eventName ) ) {
            debugger; // node breakpoint set from the inspector tree context menu
        }
    };
    const onTracked = ( eventName: string ): void => {
        breakIfSet( eventName );
        if ( flags.syncNodeDetail && node === detailState.lastDetailNode ) readyGetNodeDetail();
    };

    for ( const eventType of watchedEvents! ) {
        node.on( eventType, ( arg: any ) => {
            onTracked( eventType === eventTypes.TRANSFORM_CHANGED ? cc.Node.TransformBit[ arg ] : eventType );
        } );
    }
    node.on( eventTypes.CHILD_REMOVED, ( child: any ) => {
        deleteFromNodeMap( child );
        readyUpdateTree( false, node );
        breakIfSet( eventTypes.CHILD_REMOVED );
    } );
    node.on( eventTypes.CHILD_ADDED, () => {
        readyUpdateTree( false, node );
        breakIfSet( eventTypes.CHILD_ADDED );
    } );
    node.on( eventTypes.LAYER_CHANGED, () => breakIfSet( eventTypes.LAYER_CHANGED ) );
    node.on( eventTypes.SIBLING_ORDER_CHANGED, () => {
        readyUpdateTree( false, node );
        breakIfSet( eventTypes.SIBLING_ORDER_CHANGED );
    } );
    node.on( MARKER_EVENT, readyUpdateTree );
    node.on( 'active-in-hierarchy-changed', ( changed: any ) => {
        if ( node.parent ) readyUpdateTree( false, node );
        onTracked( 'active-in-hierarchy-changed' );
        if ( flags.statistic ) nodeLogs.push( [ Date.now(), [ changed._id, changed.name ] ] );
    } );
    node.__listened = true;
}

/** Serializes one node (and, when expanded, its children) for the inspector tree view. */
export function serializeNode( out: any, node: any, parentOpacity = 255, parentOpen = true ): any {
    ensureEventTypes();
    const isScene = node instanceof cc.Scene;
    out.name = node.name;
    out.id = node._id;
    out.isFairyCom = false;
    out.breaks = breakPoints[ out.id ];
    out.autoUpdate = !donotAutoUpdates[ out.id ];
    if ( node.$gobj && ( window as any ).fgui ) {
        const gobj = node.$gobj;
        out.gobjName = getGobjName( gobj );
        out.isFairyCom = gobj instanceof fgui.GComponent;
    }
    out.active = isScene ? true : node.active;
    if ( out.name.length === 0 && isScene ) out.name = 'CurrentScene';
    out.selected = false;
    let countsTowardDrawCall = true;
    out.activeInHierarchy = isScene ? true : node.activeInHierarchy;
    const opacity = out.opacityInHierarchy = Number( parentOpacity && ( node._uiProps?.opacity || 1 ) );
    if ( !isScene ) {
        out.isMeshRender = cc.js.getClassName( node.getComponent( cc.RenderableComponent ) ) === 'cc.MeshRenderer';
    }
    if ( !isScene && treeState.dcMode && out.activeInHierarchy && node._uiProps.opacity && !( node instanceof cc.Scene ) ) {
        const renderable = node.getComponent( cc.RenderableComponent );
        if ( renderable && renderable.enabled ) {
            if ( renderable instanceof cc.SpriteComponent ) {
                const texture = renderable.spriteFrame?._texture;
                if ( texture ) out.atlasId = texture._id;
            } else if ( renderable instanceof cc.LabelComponent ) {
                if ( renderable._texture && renderable.string.length > 0 ) {
                    const texture = renderable._texture._texture;
                    if ( texture ) out.atlasId = texture._id;
                }
            } else if ( renderable instanceof cc.GraphicsComponent ) {
                if ( renderable._impl || renderable.impl ) {
                    out.rtype = 'gh';
                    out.atlasId = renderable._id;
                    countsTowardDrawCall = false;
                }
            } else if ( renderable instanceof cc.Mask ) {
                out.rtype = 'mk';
                out.atlasId = renderable._id;
                countsTowardDrawCall = false;
            } else {
                out.rtype = 'ot';
            }
        }
    }
    checkNode( node );
    let drawCalls = 0;
    if ( treeState.dcMode && opacity && out.activeInHierarchy ) {
        if ( out.atlasId && treeState.lastAtlasId !== out.atlasId ) {
            if ( countsTowardDrawCall ) drawCalls++;
            treeState.lastAtlasId = out.atlasId;
        }
    }
    out.childCount = node.children.length;
    if ( parentOpen || treeState.dcMode || treeState.checkAllOneTime ) {
        const isOpen = isScene || openedNodes[ out.id ] !== undefined;
        if ( !treeState.checkAllOneTime && !treeState.dcMode && !isOpen ) {
            out.children = [];
        } else {
            out.children = node.children.map( ( child: any ) => {
                nodesById[ child._id ] = child;
                return serializeNode( {}, child, opacity, isOpen );
            } );
        }
    } else {
        out.children = [];
    }
    if ( treeState.dcMode ) {
        if ( opacity && out.activeInHierarchy ) {
            out.children.forEach( ( child: any ) => { drawCalls += child.dc; } );
            out.dc = drawCalls;
            const childTypes = out.children.map( ( child: any ) => child.rtype ).filter( ( type: string ) => type );
            if ( childTypes.length > 0 ) {
                out.rtype = Array.from( new Set( childTypes.toString().split( ',' ) ) ).join( ',' );
            }
        } else {
            out.dc = 0;
        }
    }
    if ( !parentOpen ) out.children = [];
    return out;
}

export function deleteFromNodeMap( node: any ): void {
    delete nodesById[ node._id ];
    node.children?.forEach( deleteFromNodeMap );
}

/** Expands a path of uuids in the tree, then selects and details the last one. */
export function locateNodeByPath( uuidPath: string[] ): void {
    const lastId = uuidPath.slice( -1 )[ 0 ];
    let parent: any = null;
    for ( const uuid of uuidPath ) {
        let node = nodesById[ uuid ];
        if ( !node && parent ) {
            node = parent.getChildByUuid( uuid );
            nodesById[ uuid ] = node;
        }
        if ( node ) {
            checkNode( node );
            syncOpen( uuid, true, false );
            parent = node;
        }
    }
    if ( lastId ) {
        readyUpdateTree();
        getNodeDetail( lastId );
    }
}

export function syncOpen( nodeId: string, open: boolean, update = true ): void {
    if ( open ) {
        openedNodes[ nodeId ] = true;
        if ( update ) readyUpdateTree();
    } else {
        delete openedNodes[ nodeId ];
    }
}

/** FGUI containers wrap their content in a single "Container" child; auto-expand it. */
export function syncOpenFcom( nodeId: string ): void {
    const node = nodesById[ nodeId ];
    if ( node.children.length === 1 && node.children[ 0 ].name === 'Container' ) {
        syncOpen( node.children[ 0 ]._id, true, false );
    }
}

/** Debounced tree update; respects auto-update settings and per-subtree suppression. */
export function readyUpdateTree( force = false, changedNode: any = null ): void {
    if ( changedNode && !treeState.dcMode ) {
        if ( donotAutoUpdates[ changedNode._id ] ) return;
        for ( const suppressedId in donotAutoUpdates ) {
            if ( changedNode.isChildOf( nodesById[ suppressedId ] ) ) return;
        }
    }
    if ( !flags.autoUpdateTree && !force ) {
        canUpdateTree();
        return;
    }
    getSchedule()?.unschedule( updateTree );
    if ( Date.now() - treeState.lastTreeTime > TREE_UPDATE_THROTTLE_MS ) {
        updateTree();
        return;
    }
    getSchedule()?.scheduleOnce( updateTree, TREE_UPDATE_DELAY_S );
    // a paused game never ticks its scheduler; step twice so the scheduled update runs
    if ( cc.game.isPaused() ) {
        setTimeout( () => {
            cc.game.step();
            setTimeout( () => cc.game.step(), 0 );
        } );
    }
}

export function updateTree(): void {
    const scene = cc.director.getScene();
    if ( !scene ) return;
    treeState.lastAtlasId = null;
    treeState.lastTreeTime = Date.now();
    sendTree( serializeNode( {}, scene ) );
    treeState.checkAllOneTime = false;
}
