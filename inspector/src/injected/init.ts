// Engine bootstrap: waits for cc, hooks scene lifecycle, applies compatibility shims.
import { applyEngineAliases } from './engine-compat';
import { patchPointerEventDispatcher } from './pointer-fix';
import { checkHover } from './hover';
import { readyUpdateTree } from './tree';
import { removePreviewPageChrome } from './misc';

const CC_DETECT_RETRIES = 30;
const CC_DETECT_INTERVAL_MS = 100;

let retryCount = 0;

function refreshDesignResolution(): void {
    const designSize = cc.view.getDesignResolutionSize();
    cc.view.setDesignResolutionSize( designSize.width, designSize.height, cc.view.getResolutionPolicy() );
    refreshCanvasCameras();
}

/**
 * Re-fits every UI camera to the visible area. In Creator 3.x the Canvas realigns its node on a
 * view resize, but the ortho height of its camera can stay at the pre-resize value, which shows
 * the scene zoomed in and crops the top/bottom edges of the game view.
 */
function refreshCanvasCameras(): void {
    const scene = cc.director.getScene();
    const CanvasClass = cc.Canvas;
    if ( !scene || !CanvasClass ) return;
    const targetOrthoHeight = cc.view.getVisibleSize().height / 2;
    scene.getComponentsInChildren( CanvasClass ).forEach( ( canvas: any ) => {
        const camera = canvas.cameraComponent;
        if ( camera && camera.orthoHeight !== targetOrthoHeight ) camera.orthoHeight = targetOrthoHeight;
    } );
}

export function initEngineHooks( retrying = false ): void {
    if ( !( window as any ).cc ) {
        if ( retryCount < CC_DETECT_RETRIES ) {
            setTimeout( () => initEngineHooks( true ), CC_DETECT_INTERVAL_MS );
            retryCount++;
            return;
        }
        if ( retrying ) console.error( 'maybe this is not a CocosCreator Game' );
        return;
    }
    // engine logging should reach the (wrapped) console so the inspector sees it
    cc.log = console.log;
    cc.warn = console.warn;
    cc.error = console.error;
    applyEngineAliases();
    patchPointerEventDispatcher();

    if ( CC_PREVIEW && !cc.ENGINE_VERSION.startsWith( '1.' ) ) {
        window.addEventListener( 'resize', refreshDesignResolution, { capture: true } );
    }

    cc.director.on( cc.Director.EVENT_AFTER_SCENE_LAUNCH, () => {
        checkHover();
        removePreviewPageChrome();
        readyUpdateTree( true );
        setTimeout( refreshDesignResolution, 0 );
        sendGameState( cc.game.isPaused() );
        if ( !( window as any ).fgui && CC_BUILD ) {
            try {
                System.import( 'chunks:///_virtual/fairygui.mjs' ).then( ( fguiModule ) => {
                    ( window as any ).fgui = fguiModule;
                    if ( fguiModule ) readyUpdateTree();
                } ).catch( () => { /* game has no fgui bundle */ } );
            } catch { /* System may be absent in exotic builds */ }
        }
    } );
    if ( cc.director.getScene() ) readyUpdateTree( true );

    // keep the inspector's play/pause button state in sync with the game
    const originalPause = cc.game.pause;
    cc.game.pause = function () {
        originalPause.call( cc.game );
        sendGameState( cc.game.isPaused() );
    };
    const originalResume = cc.game.resume;
    cc.game.resume = function () {
        originalResume.call( cc.game );
        sendGameState( cc.game.isPaused() );
    };
    cc._isContextMenuEnable = true;
}
