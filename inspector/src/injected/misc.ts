// Node operations and preview-page utilities.
import { nodesById, flags, nodeLogs } from './state';
import { isEngine3_4OrNewer } from './engine-compat';
import { deleteFromNodeMap, readyUpdateTree } from './tree';

export function toggleNodeActive( nodeId: string ): void {
    const node = nodesById[ nodeId ];
    if ( node ) node.active = !node.active;
    readyUpdateTree();
}

export function removeNode( nodeId: string ): void {
    const node = nodesById[ nodeId ];
    if ( node ) node.removeFromParent();
}

export function lockDragNode( nodeId: string | null ): void {
    flags.lockDragNode = nodeId;
}

/** Moves one node next to another (drag & drop reorder in the inspector tree). */
export function swapPos( draggedId: string, targetId: string ): void {
    const dragged = nodesById[ draggedId ];
    const target = nodesById[ targetId ];
    if ( !target || !dragged ) return;
    dragged.parent = target.parent;
    dragged.setSiblingIndex( target.getSiblingIndex() );
}

export function toggleFps(): void {
    if ( !cc.debug ) {
        cc.director.setDisplayStats( !cc.director.isDisplayStats() );
        return;
    }
    cc.debug.setDisplayStats( !cc.debug.isDisplayStats() );
}

/** Collects active-in-hierarchy change logs while enabled; sends them when disabled. */
export function startStatistic( enabled: boolean ): void {
    if ( enabled ) {
        nodeLogs.length = 0;
        flags.statistic = true;
        return;
    }
    flags.statistic = false;
    sendStatistic( nodeLogs.concat() );
    nodeLogs.length = 0;
}

/** Re-fires widget alignment after a manual resize of the preview frame. */
export function updateResize(): void {
    if ( !CC_PREVIEW ) return;
    const scene = cc.director.getScene();
    if ( !scene ) return;
    scene.getComponentsInChildren( cc.WidgetComponent ).forEach( ( widget: any ) => {
        if ( !widget.isValid ) return;
        if ( cc.WidgetComponent.AlignMode ) {
            if ( widget.alignMode === cc.WidgetComponent.AlignMode.ON_WINDOW_RESIZE ) widget.updateAlignment();
        } else if ( widget.enabledInHierarchy ) {
            widget.updateAlignment();
        }
    } );
}

/** Fits the game canvas to the webview after the preview page chrome was stripped. */
export function resizeCanvas(): void {
    if ( CC_BUILD ) return;
    const canvas = cc.game.canvas;
    if ( !canvas ) return;
    if ( isEngine3_4OrNewer() ) {
        cc.screen.windowSize = cc.size( window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio );
        return;
    }
    if ( !cc.ENGINE_VERSION.startsWith( '1.' ) && cc.view.setFrameSize ) {
        cc.view.setFrameSize( window.innerWidth, window.innerHeight );
        updateResize();
    } else {
        canvas.style.height = window.innerHeight + 'px';
        canvas.style.width = window.innerWidth + 'px';
    }
}

/** Strips the Cocos preview page chrome (toolbar/footer) so only the game canvas remains. */
export function removePreviewPageChrome(): void {
    const content = document.querySelector( '#content' );
    content?.querySelector( '.footer' )?.remove();
    content?.querySelector( '.error' )?.remove();
    if ( content && content.parentElement !== document.body ) document.body.append( content );
    const wrapper = document.querySelector( '.wrapper' ) as HTMLElement | null;
    if ( wrapper ) wrapper.style.border = 'none';
    const contentWrap = document.querySelector( '.contentWrap' ) as HTMLElement | null;
    if ( contentWrap ) {
        contentWrap.style.overflow = 'hidden';
        contentWrap.style.height = '100vh';
        contentWrap.style.width = '100vw';
    }
    const hiddenBin = document.createElement( 'div' );
    hiddenBin.style.display = 'none';
    document.body.append( hiddenBin );
    for ( const element of Array.from( document.body.children ) ) {
        if ( element !== hiddenBin && !element.contains( cc.game.canvas ) ) hiddenBin.append( element );
    }
    resizeCanvas();
}

/** Asks the preview server to re-import the asset database (best effort, fire and forget). */
export function reCompile(): void {
    const url = window.location.href + 'update-db';
    const request = new XMLHttpRequest();
    request.open( 'GET', url, true );
    request.send( null );
}
