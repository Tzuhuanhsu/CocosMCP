// Node path helpers and scene-wide component search.
import { nodesById } from './state';

export function getPath( node: any ): { path: string; uuidPath: string[] } {
    const names = [ node.name ];
    const uuids = [ node.uuid ];
    while ( node.parent && !( node.parent instanceof cc.Scene ) ) {
        names.push( node.parent.name );
        uuids.push( node.parent.uuid );
        node = node.parent;
    }
    return { path: names.reverse().join( '/' ), uuidPath: uuids.reverse() };
}

export function getPathById( nodeId: string ): string {
    const node = nodesById[ nodeId ];
    return node ? getPath( node ).path : '';
}

export function getUuidPathByPath( scenePath: string ): string[] {
    const node = cc.find( scenePath );
    return node ? getPath( node ).uuidPath : [];
}

export function printPath( nodeId: string ): void {
    console.log( getPathById( nodeId ) );
}

export function storeInGlobal( nodeId: string ): void {
    const node = nodesById[ nodeId ];
    if ( node ) {
        ( window as any ).temp1 = node;
        console.log( `node: ${ node.name }, store in temp1 already!` );
    }
}

export function getComp( nodeId: string, compUuid: string ): any {
    const node = nodesById[ nodeId ];
    if ( !node ) return null;
    return node._components.filter( ( comp: any ) => comp.uuid === compUuid )[ 0 ];
}

export function storeCompInGlobal( nodeId: string, compUuid: string ): void {
    const comp = getComp( nodeId, compUuid );
    if ( comp ) {
        ( window as any ).comp1 = comp;
        console.log( `component: ${ comp.name }, store in comp1 already!` );
    }
}

/** Case-insensitive component-class search across the scene (inspector search panel). */
export function searchComs( keyword: string ): unknown[] {
    keyword = keyword.toLowerCase();
    let comps = cc.director.getScene().getComponentsInChildren( cc.Component );
    comps = comps.filter( ( comp: any ) => cc.js.getClassName( comp ).toLowerCase().includes( keyword ) );
    return comps.map( ( comp: any ) => {
        const { uuid } = comp;
        const name = cc.js.getClassName( comp );
        const visible = comp.node.activeInHierarchy
            && ( !comp.getComponent( 'cc.UIOpacity' ) || comp.getComponent( 'cc.UIOpacity' ).opacity > 0 );
        const { path, uuidPath } = getPath( comp.node );
        return { name, uuid, visible, path, uuidPath };
    } );
}
