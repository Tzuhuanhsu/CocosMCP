// IPC handlers that operate on the game webview's webContents from the main process,
// so the renderer never needs the deprecated `remote` module.
import { webContents } from 'electron';
import type { WebContents } from 'electron';
import { startDevtoolsBridge, bridgeFrontendUrl } from './devtools-bridge';
import { IpcEvent, type WireDevtoolsResult } from '@shared/protocol';
import { log } from './log';

interface GameWebContents extends WebContents {
    __inspectorWired?: boolean;
    __inspectorWatcher?: boolean;
}

type PausedNotifier = () => void;

/**
 * Watches the game's debugger session for Debugger.paused so the inspector can auto-switch to
 * the DevTool tab, and keeps the "Paused in debugger" overlay from covering the game view.
 */
function ensurePausedWatcher( game: GameWebContents, devtoolsView: WebContents, notifyPaused: PausedNotifier ): void {
    if ( game.__inspectorWatcher ) return;
    game.__inspectorWatcher = true;
    if ( !game.debugger.isAttached() ) game.debugger.attach();
    game.debugger.on( 'message', ( _event, method ) => {
        if ( method !== 'Debugger.paused' ) return;
        notifyPaused();
        void disablePausedOverlay( devtoolsView );
    } );
}

async function disablePausedOverlay( devtoolsView: WebContents ): Promise<void> {
    try {
        const overlayDisabled = await devtoolsView.executeJavaScript(
            "Common.settings.moduleSetting('disablePausedStateOverlay').get()"
        );
        if ( !overlayDisabled ) {
            await devtoolsView.executeJavaScript(
                "Common.settings.moduleSetting('disablePausedStateOverlay').set(true)"
            );
        }
    } catch {
        // devtools frontend internals may change between versions; the overlay tweak is optional
    }
}

/**
 * Loads the DevTools frontend into the devtools webview and connects it to the game page.
 * Idempotent: repeated calls while wired are no-ops (re-wiring reloads the frontend and makes
 * it miss the boot-time logs; repeated setDevToolsWebContents corrupts the binding entirely).
 */
export async function wireDevtools(
    gameWcId: number,
    devtoolsWcId: number,
    notifyPaused: PausedNotifier
): Promise<WireDevtoolsResult> {
    try {
        const game = webContents.fromId( gameWcId ) as GameWebContents | null;
        const devtoolsView = webContents.fromId( devtoolsWcId );
        if ( !game || !devtoolsView ) {
            log( 'wire-devtools: webContents not found', { gameWcId, devtoolsWcId } );
            return { ok: false, error: `webContents not found (game=${ gameWcId }, devtools=${ devtoolsWcId })` };
        }
        const gameUrl = String( game.getURL() );
        if ( !/^(https?|file):/.test( gameUrl ) ) {
            return { ok: false, error: 'game page not loaded yet' };
        }
        const alreadyWired = Boolean( game.__inspectorWired ) && String( devtoolsView.getURL() ).startsWith( 'devtools://' );
        if ( !alreadyWired ) {
            const port = await startDevtoolsBridge( game, log );
            const frontendUrl = bridgeFrontendUrl( port );
            try {
                await devtoolsView.loadURL( frontendUrl );
                log( 'wire-devtools: frontend loaded via ws bridge', { gameWcId, port } );
            } catch ( error ) {
                // some environments refuse direct devtools:// navigation on a webview; bootstrap
                // the frontend through the embedder API, then redirect it to the ws transport
                log( 'wire-devtools: direct devtools:// load failed, using embedder bootstrap', String( ( error as Error )?.message ?? error ) );
                game.setDevToolsWebContents( devtoolsView );
                game.openDevTools();
                setTimeout( () => {
                    devtoolsView.loadURL( frontendUrl ).catch(
                        ( redirectError: Error ) => log( 'wire-devtools: ws redirect failed', String( redirectError?.message ?? redirectError ) )
                    );
                }, 800 );
            }
            game.__inspectorWired = true;
        }
        ensurePausedWatcher( game, devtoolsView, notifyPaused );
        return { ok: true, muted: game.isAudioMuted() };
    } catch ( error ) {
        log( 'wire-devtools: FAILED', String( ( error as Error )?.stack ?? error ) );
        return { ok: false, error: String( ( error as Error )?.message ?? error ) };
    }
}

export function setGameAudioMuted( gameWcId: number, muted: boolean ): WireDevtoolsResult {
    try {
        const game = webContents.fromId( gameWcId );
        if ( game ) game.setAudioMuted( Boolean( muted ) );
        return { ok: true };
    } catch ( error ) {
        return { ok: false, error: String( ( error as Error )?.message ?? error ) };
    }
}

export { IpcEvent };
