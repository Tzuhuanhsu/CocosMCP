// Defensive patch for a Cocos Creator 3.8 engine bug.
//
// PointerEventDispatcher._sortPointerEventProcessorList reads
// `node._getUITransformComp().cameraPriority` WITHOUT null-checking the UITransform, even though
// its sibling comparator `_sortByPriority` guards the same case. Any registered pointer-event
// processor whose node lacks a UITransform crashes the whole mouse/touch dispatch with
// "Cannot read properties of null (reading 'cameraPriority')".
//
// Enabling the hover crosshair registers pointer handlers on many nodes and forces the list to
// re-sort on the next mouse event, which surfaces this latent engine crash in some projects.
// We patch the dispatcher singleton once with a faithful, null-safe reimplementation.

const ADD_POINTER_EVENT_PROCESSOR = 0; // DispatcherEventType enum value in CC 3.8

let patched = false;

/** Locates the PointerEventDispatcher singleton via the static callbacks invoker it subscribes to. */
function findDispatcher(): any {
    const nodeEventProcessor = cc.NodeEventProcessor;
    const invoker = nodeEventProcessor?.callbacksInvoker;
    const table = invoker?._callbackTable;
    const list = table?.[ ADD_POINTER_EVENT_PROCESSOR ];
    const infos = list?.callbackInfos;
    if ( !Array.isArray( infos ) ) return null;
    for ( const info of infos ) {
        const target = info?.target;
        if ( target && Array.isArray( target._pointerEventProcessorList )
            && typeof target._sortPointerEventProcessorList === 'function' ) {
            return target;
        }
    }
    return null;
}

export function patchPointerEventDispatcher(): void {
    if ( patched ) return;
    try {
        const dispatcher = findDispatcher();
        if ( !dispatcher ) return;
        // instance-level override (mirrors the engine, adds the missing UITransform null guard)
        dispatcher._sortPointerEventProcessorList = function () {
            if ( !this._isListDirty ) return;
            const list = this._pointerEventProcessorList;
            for ( let i = 0; i < list.length; i++ ) {
                const processor = list[ i ];
                const node = processor && processor.node;
                if ( node && node._uiProps ) {
                    const trans = node._getUITransformComp ? node._getUITransformComp() : null;
                    if ( trans ) processor.cachedCameraPriority = trans.cameraPriority;
                }
            }
            list.sort( this._sortByPriority );
            this._isListDirty = false;
        };
        patched = true;
    } catch ( error ) {
        console.warn( 'cocos-inspector: pointer dispatcher patch failed', error );
    }
}
