// Node detail serialization (inspector right panel) and component property editing.
import { nodesById, flags, treeState, detailState } from './state';
import { getSchedule } from './engine-compat';
import { getPath } from './node-path';
import { getGobjName, readyUpdateTree } from './tree';

/** node internals hidden from the detail panel in built games */
const BUILD_FILTER: Record<string, string> = {
    _prefab: '',
    _visFlags: '',
    _editorExtras__: '',
    __prefab: '',
    _name: '',
    _objFlags: '',
    _scriptAsset: '',
};

/** Zero-arg public methods of a component, offered as clickable actions in the panel. */
function getComponentMethodNames( comp: any ): string[] {
    const keys = Object.keys( comp.__proto__ );
    return keys.filter( ( key ) => {
        if ( key in cc.RenderableComponent.prototype || key.startsWith( '_' ) || key.startsWith( 'get' ) ) return false;
        const value = comp[ key ];
        return typeof value === 'function' && value.length === 0 && value.name !== 'warn';
    } );
}

type SerializedProp = [ unknown, string ] | [ unknown, string, unknown ];

/** Serializes one component (or the fgui $gobj pseudo-component) to [value, type] pairs. */
function serializeComponent( comp: any ): Record<string, unknown> {
    const out: Record<string, any> = {};
    const propNames: string[] = comp instanceof cc.Component ? comp.constructor.__props__ : Object.keys( comp );
    for ( let propName of propNames ) {
        const originalName = propName;
        if ( comp instanceof cc.Component ) {
            if ( CC_PREVIEW && propName.startsWith( '_' ) ) continue;
            if ( propName.startsWith( '_' ) && comp[ propName ] === comp[ propName.slice( 1 ) ] ) {
                propName = propName.slice( 1 );
            }
            out.isCC_COM = true;
        } else {
            out.isCC_COM = false;
        }
        if ( CC_BUILD && propName in BUILD_FILTER ) continue;
        if ( !( propName in { name: '', uuid: '', enabled: '' } ) && propName in cc.Component.prototype ) continue;

        let value = comp[ propName ];
        if ( value === null ) value = 'null';
        if ( value === undefined ) value = 'undefined';
        const valueType = typeof value;
        if ( valueType !== 'function' && valueType !== 'object' ) {
            const attrs = comp.constructor.__attrs__;
            const isEnum = attrs && ( attrs[ `${ propName }$_$type` ] === 'Enum' || attrs[ `${ originalName }$_$type` ] === 'Enum' );
            if ( isEnum ) {
                const enumList = attrs[ `${ propName }$_$enumList` ] || attrs[ `${ originalName }$_$enumList` ];
                out[ propName ] = [ enumList.find( ( entry: any ) => entry.value === value ), 'enum', enumList ] as SerializedProp;
            } else {
                out[ propName ] = [ value, valueType ] as SerializedProp;
            }
        } else {
            if ( value instanceof cc.Component ) {
                if ( !value.node ) out[ propName ] = `${ cc.js.getClassName( value ) }:@${ value.uuid }`;
                const { uuidPath } = getPath( value.node );
                out[ propName ] = `${ cc.js.getClassName( value ) }:@${ value.node ? value.node.name : value.node }|${ uuidPath.join( '//' ) }`;
            } else if ( value instanceof cc.Asset ) {
                out[ propName ] = `${ cc.js.getClassName( value ).slice( 3 ) }:@${ value.name }||${ value._uuid }`;
            } else if ( value instanceof cc.Color ) {
                out[ propName ] = `#${ value.toHEX( '#rrggbb' ) }`;
            } else if ( value instanceof cc.ValueType ) {
                out[ propName ] = `${ value.constructor.name }:${ value.toString() }`;
            } else if ( value.constructor === cc.Node ) {
                const { uuidPath } = getPath( value );
                if ( propName !== 'node' ) out[ propName ] = `Node:@${ value.name }|${ uuidPath.join( '//' ) }`;
            } else if ( !( value instanceof Function ) ) {
                if ( ( window as any ).fgui && value instanceof fgui.GObject ) {
                    const { uuidPath } = getPath( value.node );
                    if ( propName !== 'node' ) out[ propName ] = `Node:@${ getGobjName( value ) }|${ uuidPath.join( '//' ) }`;
                } else {
                    out[ propName ] = `$${ value.constructor ? value.constructor.name : 'object' }`;
                }
            }
            out[ propName ] = [ out[ propName ], value instanceof cc.Color ? 'color' : 'object' ] as SerializedProp;
        }
    }
    pruneIrrelevantProps( comp, out );
    out.name = comp.name;
    out.uuid = comp.uuid;
    out.enabled = comp.enabled;
    try {
        out.__methods___ = getComponentMethodNames( comp );
    } catch {
        out.__methods___ = [];
    }
    return out;
}

/** Hides properties that are meaningless for the component's current mode. */
function pruneIrrelevantProps( comp: any, out: Record<string, unknown> ): void {
    if ( comp instanceof cc.ButtonComponent ) {
        if ( comp.transition !== cc.ButtonComponent.Transition.SPRITE ) {
            delete out.hoverSprite; delete out.pressedSprite; delete out.disabledSprite; delete out.normalSprite;
        }
        if ( comp.transition !== cc.Button.Transition.COLOR ) {
            delete out.hoverColor; delete out.pressedColor; delete out.disabledColor; delete out.normalColor;
        }
        if ( comp.transition !== cc.Button.Transition.SCALE ) delete out.zoomScale;
    }
    if ( comp instanceof cc.SpriteComponent && comp.type !== cc.SpriteComponent.Type.FILLED ) {
        delete out.fillType; delete out.fillRange; delete out.fillStart; delete out.fillCenter;
    }
    if ( comp instanceof cc.LayoutComponent ) {
        if ( comp.type === cc.LayoutComponent.Type.NONE ) {
            delete out.verticalDirection; delete out.startAxis; delete out.spacingX; delete out.spacingY;
            delete out.horizontalDirection; delete out.cellSize;
            if ( comp.resizeMode === cc.LayoutComponent.ResizeMode.NONE ) {
                delete out.paddingBottom; delete out.paddingTop; delete out.paddingLeft; delete out.paddingRight;
            }
        }
        if ( comp.type === cc.LayoutComponent.Type.HORIZONTAL ) {
            delete out.spacingY; delete out.verticalDirection; delete out.paddingBottom; delete out.paddingTop;
        }
        if ( comp.type === cc.LayoutComponent.Type.VERTICAL ) {
            delete out.spacingX; delete out.horizontalDirection; delete out.paddingLeft; delete out.paddingRight;
        }
        if ( comp.resizeMode !== cc.LayoutComponent.ResizeMode.CHILDREN ) delete out.cellSize;
        if ( comp.type !== cc.LayoutComponent.Type.GRID ) delete out.startAxis;
    }
    if ( comp instanceof cc.WidgetComponent ) {
        delete out.isStretchHeight; delete out.isStretchWidth;
        delete out.isAbsoluteHorizontalCenter; delete out.isAbsoluteVerticalCenter;
        delete out.isAbsoluteTop; delete out.isAbsoluteBottom; delete out.isAbsoluteRight; delete out.isAbsoluteLeft;
        for ( const key of Object.keys( out ) ) {
            if ( key.startsWith( 'editor' ) ) delete out[ key ];
        }
    }
}

export function getNodeDetail( nodeId: string, includeComps = true ): void {
    if ( !detailState.fcom && ( window as any ).fgui ) detailState.fcom = new fgui.GComponent();
    const node = nodesById[ nodeId ];
    if ( !node ) return;
    detailState.lastDetailNode = node;
    const detail: Record<string, any> = {
        id: nodeId,
        active: node.active,
        name: node.name,
        position: node.position,
        scale: node.scale,
        eulerAngles: node.eulerAngles,
        opacity: node._uiProps.opacity,
        layer: cc.Layers.Enum[ node.layer ] || node.layer,
    };
    if ( includeComps ) {
        // fgui nodes expose their GObject as a pseudo-component ahead of the cc components
        let gobjPseudoComp: any = null;
        if ( node.$gobj ) {
            const gobj = node.$gobj;
            const filtered: Record<string, unknown> = Object.assign( {}, gobj );
            for ( const key in detailState.fcom ) delete filtered[ key ];
            filtered.name = gobj.constructor.name;
            gobjPseudoComp = filtered;
        }
        const comps = node._components.concat();
        if ( gobjPseudoComp ) comps.unshift( gobjPseudoComp );
        detail.coms = comps.map( serializeComponent );
        comps.length = 0;
    }
    detail.includeComps = includeComps;
    showNodeDetail( detail );
}

export function setComAttr( nodeId: string, compUuid: string, propName: string, value: any ): void {
    const node = nodesById[ nodeId ];
    if ( !node ) return;
    const comp = node._components.find( ( entry: any ) => entry.uuid === compUuid );
    if ( !comp ) return;
    if ( comp[ propName ] instanceof cc.Color ) value = cc.Color.BLACK.clone().fromHEX( value );
    comp[ propName ] = value;
    if ( treeState.dcMode ) readyUpdateTree();
    // changing a button's transition changes which properties are relevant - refresh the panel
    if ( comp instanceof cc.ButtonComponent && propName === 'transition' ) getNodeDetail( nodeId );
}

export function execCompMethod( nodeId: string, compUuid: string, methodName: string ): void {
    const node = nodesById[ nodeId ];
    if ( !node ) return;
    const comp = node._components.filter( ( entry: any ) => entry.uuid === compUuid )[ 0 ];
    if ( comp && comp[ methodName ] ) comp[ methodName ]();
}

export function toggleComp( nodeId: string, compUuid: string ): void {
    const node = nodesById[ nodeId ];
    if ( !node ) return;
    const comp = node._components.filter( ( entry: any ) => entry.uuid === compUuid )[ 0 ];
    if ( comp ) {
        comp.enabled = !comp.enabled;
        getNodeDetail( nodeId );
        if ( treeState.dcMode ) readyUpdateTree();
    }
}

export function removeComp( nodeId: string, compUuid: string ): void {
    const node = nodesById[ nodeId ];
    if ( !node ) return;
    const comp = node._components.filter( ( entry: any ) => entry.uuid === compUuid )[ 0 ];
    if ( comp ) {
        node.removeComponent( comp );
        getSchedule().scheduleOnce( () => {
            getNodeDetail( nodeId );
            if ( treeState.dcMode ) readyUpdateTree();
        } );
    }
}

/** Writes a (possibly dotted, e.g. "position.x") node property from the detail panel. */
export function syncNode( nodeId: string, propPath: string, value: any ): void {
    const node = nodesById[ nodeId ];
    if ( !node ) return;
    treeState.stopSyncDetailOneTime = true;
    const parts = propPath.split( '.' );
    value = Number( value );
    const current = parts.length > 1 ? node[ parts[ 0 ] ][ parts[ 1 ] ] : node[ propPath ];
    if ( current !== value ) {
        if ( parts.length > 1 ) {
            node[ parts[ 0 ] ][ parts[ 1 ] ] = value;
            node[ parts[ 0 ] ] = node[ parts[ 0 ] ]; // reassign to trigger the engine setter
        } else {
            node[ propPath ] = value;
        }
    }
    treeState.stopSyncDetailOneTime = false;
}

export function syncNodeColor( nodeId: string, rgba: number[] ): void {
    const node = nodesById[ nodeId ];
    rgba = rgba.map( ( channel ) => channel * 255 );
    if ( node ) node.color = cc.color( ...rgba );
}

/** Debounced re-send of the detail panel while "Sync Node Detail" is enabled. */
export function readyGetNodeDetail(): void {
    if ( detailState.pendingDetailFun ) return;
    if ( treeState.stopSyncDetailOneTime ) {
        treeState.stopSyncDetailOneTime = false;
        return;
    }
    if ( !flags.syncNodeDetail ) return;
    detailState.pendingDetailFun = () => {
        detailState.pendingDetailFun = null;
        if ( !flags.syncNodeDetail ) return;
        getNodeDetail( detailState.lastDetailNode._id, false );
    };
    getSchedule().scheduleOnce( detailState.pendingDetailFun );
}
