// Main-process access to the game webview for the runtime API (Editor.Message "runtime-*").
// Tracks the game guest webContents of the inspector window, mirrors its console output into a
// ring buffer, and offers eval / capture primitives. Never throws: callers get { ok: false }.
import { webContents } from 'electron';
import type { BrowserWindow, WebContents } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type {
    RuntimeCaptureResult,
    RuntimeConsoleEntry,
    RuntimeConsoleLevel,
    RuntimeConsoleResult,
    RuntimeEvalResult,
    RuntimeStatus,
} from '@shared/protocol';
import { log } from './log';

const CONSOLE_RING_CAPACITY = 500;
const GAME_READY_POLL_MS = 100;
const GAME_URL_PATTERN = /^https?:/;
const LEVEL_NAMES: RuntimeConsoleLevel[] = [ 'verbose', 'info', 'warning', 'error' ];
const ERROR_WINDOW_NOT_OPEN = 'inspector window not open';
const ERROR_GAME_NOT_READY = 'game page not loaded yet';

let hostWindow: BrowserWindow | null = null;
let gameGuest: WebContents | null = null;
let previewPort: number | null = null;
let consoleSeq = 0;
const consoleRing: RuntimeConsoleEntry[] = [];

function isGameGuest( guest: WebContents ): boolean {
    return GAME_URL_PATTERN.test( String( guest.getURL() ) );
}

function pushConsoleEntry( level: number, message: string, line: number, sourceId: string ): void {
    consoleSeq += 1;
    consoleRing.push( {
        seq: consoleSeq,
        t: Date.now(),
        level: LEVEL_NAMES[ level ] ?? 'info',
        message,
        line,
        sourceId,
    } );
    if ( consoleRing.length > CONSOLE_RING_CAPACITY ) consoleRing.shift();
}

function attachGuest( guest: WebContents ): void {
    if ( gameGuest === guest ) return;
    gameGuest = guest;
    log( 'runtime-api: game guest attached', { id: guest.id } );
    guest.on( 'console-message', ( _event, level, message, line, sourceId ) => {
        pushConsoleEntry( level, message, line, sourceId );
    } );
    guest.on( 'destroyed', () => {
        if ( gameGuest === guest ) gameGuest = null;
    } );
}

/** Fallback when did-attach-webview was missed (e.g. window opened before this module loaded). */
function findGameGuest(): WebContents | null {
    if ( !hostWindow || hostWindow.isDestroyed() ) return null;
    const hostId = hostWindow.webContents.id;
    const guest = webContents.getAllWebContents().find( ( candidate ) =>
        candidate.getType() === 'webview'
        && candidate.hostWebContents?.id === hostId
        && isGameGuest( candidate )
    );
    return guest ?? null;
}

function resolveGameGuest(): WebContents | null {
    if ( gameGuest && !gameGuest.isDestroyed() ) return gameGuest;
    const found = findGameGuest();
    if ( found ) attachGuest( found );
    return found;
}

function isWindowOpen(): boolean {
    return Boolean( hostWindow && !hostWindow.isDestroyed() );
}

/** Hooks the inspector window so every attached <webview> whose URL is the game gets tracked. */
export function trackHostWindow( win: BrowserWindow ): void {
    hostWindow = win;
    win.webContents.on( 'did-attach-webview', ( _event, guest ) => {
        // the devtools webview attaches with about:blank / devtools://; wait for the game URL
        if ( isGameGuest( guest ) ) {
            attachGuest( guest );
            return;
        }
        guest.once( 'did-finish-load', () => {
            if ( isGameGuest( guest ) ) attachGuest( guest );
        } );
    } );
    win.on( 'closed', () => {
        if ( hostWindow === win ) hostWindow = null;
        gameGuest = null;
    } );
}

export function setPreviewPort( port: number ): void {
    previewPort = port;
}

/** Resolves once the game page has finished loading (or immediately if it already has). */
export function waitForGameReady( timeoutMs: number ): Promise<boolean> {
    const guest = resolveGameGuest();
    if ( guest && !guest.isLoading() ) return Promise.resolve( true );
    return new Promise( ( resolve ) => {
        const startedAt = Date.now();
        const timer = setInterval( () => {
            const current = resolveGameGuest();
            if ( current && !current.isLoading() ) {
                clearInterval( timer );
                resolve( true );
            } else if ( Date.now() - startedAt >= timeoutMs ) {
                clearInterval( timer );
                resolve( false );
            }
        }, GAME_READY_POLL_MS );
    } );
}

export function getStatus(): RuntimeStatus {
    const windowOpen = isWindowOpen();
    const guest = windowOpen ? resolveGameGuest() : null;
    return {
        windowOpen,
        gameReady: Boolean( guest && !guest.isLoading() ),
        gameUrl: guest ? String( guest.getURL() ) : null,
        previewPort,
        consoleSeq,
    };
}

export async function evalInGame( code: string ): Promise<RuntimeEvalResult> {
    if ( !isWindowOpen() ) return { ok: false, error: ERROR_WINDOW_NOT_OPEN };
    const guest = resolveGameGuest();
    if ( !guest ) return { ok: false, error: ERROR_GAME_NOT_READY };
    try {
        const value = await guest.executeJavaScript( String( code ), true );
        return { ok: true, value };
    } catch ( error ) {
        return { ok: false, error: String( ( error as Error )?.stack ?? ( error as Error )?.message ?? error ) };
    }
}

export async function capture( outPath: string ): Promise<RuntimeCaptureResult> {
    if ( !isWindowOpen() ) return { ok: false, error: ERROR_WINDOW_NOT_OPEN };
    const guest = resolveGameGuest();
    if ( !guest ) return { ok: false, error: ERROR_GAME_NOT_READY };
    try {
        // a minimized / hidden window yields a blank capture
        if ( hostWindow!.isMinimized() ) hostWindow!.restore();
        if ( !hostWindow!.isVisible() ) hostWindow!.show();
        const image = await guest.capturePage();
        const size = image.getSize();
        const png = image.toPNG();
        fs.mkdirSync( path.dirname( outPath ), { recursive: true } );
        fs.writeFileSync( outPath, png );
        return { ok: true, path: outPath, width: size.width, height: size.height, bytes: png.length };
    } catch ( error ) {
        return { ok: false, error: String( ( error as Error )?.message ?? error ) };
    }
}

export function readConsole( sinceSeq: number, level?: RuntimeConsoleLevel | 'all' ): RuntimeConsoleResult {
    const wantLevel = level && level !== 'all' ? level : null;
    const entries = consoleRing.filter( ( entry ) =>
        entry.seq > sinceSeq && ( !wantLevel || entry.level === wantLevel )
    );
    return { ok: true, entries, latestSeq: consoleSeq };
}

export function clearConsole(): RuntimeConsoleResult {
    consoleRing.length = 0;
    return { ok: true, entries: [], latestSeq: consoleSeq };
}
