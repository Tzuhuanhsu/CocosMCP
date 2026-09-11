// DevTools CDP-over-WebSocket bridge.
//
// Inside Cocos Creator, Electron's embedder binding for custom devtools frontends
// (webContents.setDevToolsWebContents) delivers no Runtime/DOM/Console traffic, while
// webContents.debugger on the same page works fine. So the in-tab DevTools frontend is loaded
// in standard remote-debugging mode (inspector.html?ws=...) and its CDP messages are bridged
// to webContents.debugger through a minimal local WebSocket server (RFC6455, text frames only,
// zero dependencies).
import * as http from 'http';
import * as crypto from 'crypto';
import type { Socket } from 'net';
import type { WebContents } from 'electron';

const WS_ACCEPT_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OPCODE_CONTINUATION = 0x0;
const OPCODE_TEXT = 0x1;
const OPCODE_CLOSE = 0x8;
const OPCODE_PING = 0x9;
const PONG_HEADER = 0x8a;

interface CdpRequest {
    id: number;
    method: string;
    params?: Record<string, unknown>;
}

interface Bridge {
    server: http.Server;
    port: number;
    activeSocket: Socket | null;
}

type LogFunction = ( ...parts: unknown[] ) => void;

const bridges = new Map<number, Bridge>();

function encodeTextFrame( payload: string ): Buffer {
    const data = Buffer.from( payload, 'utf8' );
    let header: Buffer;
    if ( data.length < 126 ) {
        header = Buffer.from( [ 0x80 | OPCODE_TEXT, data.length ] );
    } else if ( data.length < 65536 ) {
        header = Buffer.alloc( 4 );
        header[ 0 ] = 0x80 | OPCODE_TEXT;
        header[ 1 ] = 126;
        header.writeUInt16BE( data.length, 2 );
    } else {
        header = Buffer.alloc( 10 );
        header[ 0 ] = 0x80 | OPCODE_TEXT;
        header[ 1 ] = 127;
        header.writeBigUInt64BE( BigInt( data.length ), 2 );
    }
    return Buffer.concat( [ header, data ] );
}

/** Feeds socket bytes through a websocket frame parser; onMessage fires per complete text message. */
function attachFrameReceiver( socket: Socket, onMessage: ( text: string ) => void, onClose: () => void ): void {
    let buffer = Buffer.alloc( 0 );
    let fragments: Buffer[] = [];
    socket.on( 'data', ( chunk: Buffer ) => {
        buffer = Buffer.concat( [ buffer, chunk ] );
        while ( true ) {
            if ( buffer.length < 2 ) return;
            const fin = ( buffer[ 0 ] & 0x80 ) !== 0;
            const opcode = buffer[ 0 ] & 0x0f;
            const masked = ( buffer[ 1 ] & 0x80 ) !== 0;
            let length = buffer[ 1 ] & 0x7f;
            let offset = 2;
            if ( length === 126 ) {
                if ( buffer.length < 4 ) return;
                length = buffer.readUInt16BE( 2 );
                offset = 4;
            } else if ( length === 127 ) {
                if ( buffer.length < 10 ) return;
                length = Number( buffer.readBigUInt64BE( 2 ) );
                offset = 10;
            }
            const maskLength = masked ? 4 : 0;
            if ( buffer.length < offset + maskLength + length ) return;
            let payload = buffer.slice( offset + maskLength, offset + maskLength + length );
            if ( masked ) {
                const mask = buffer.slice( offset, offset + 4 );
                payload = Buffer.from( payload );
                for ( let i = 0; i < payload.length; i++ ) payload[ i ] ^= mask[ i & 3 ];
            }
            buffer = buffer.slice( offset + maskLength + length );
            if ( opcode === OPCODE_CLOSE ) {
                onClose();
                socket.end();
                return;
            }
            if ( opcode === OPCODE_PING ) {
                socket.write( Buffer.concat( [ Buffer.from( [ PONG_HEADER, payload.length ] ), payload ] ) );
                continue;
            }
            if ( opcode === OPCODE_TEXT || opcode === OPCODE_CONTINUATION ) {
                fragments.push( payload );
                if ( fin ) {
                    const message = Buffer.concat( fragments ).toString( 'utf8' );
                    fragments = [];
                    onMessage( message );
                }
            }
        }
    } );
    socket.on( 'error', onClose );
    socket.on( 'close', onClose );
}

function handleConnection( bridge: Bridge, game: WebContents, socket: Socket, log: LogFunction ): void {
    socket.setNoDelay( true );
    if ( bridge.activeSocket ) {
        try { bridge.activeSocket.destroy(); } catch { /* replaced by the new frontend connection */ }
    }
    bridge.activeSocket = socket;
    log( 'bridge: devtools frontend connected', { gameWcId: game.id } );

    let closed = false;
    const close = (): void => {
        if ( closed ) return;
        closed = true;
        if ( bridge.activeSocket === socket ) bridge.activeSocket = null;
    };
    const send = ( message: object ): void => {
        if ( closed || bridge.activeSocket !== socket ) return;
        try {
            socket.write( encodeTextFrame( JSON.stringify( message ) ) );
        } catch {
            close();
        }
    };
    const onDebuggerMessage = ( _event: unknown, method: string, params: unknown ): void => send( { method, params } );
    const onDebuggerDetach = (): void => {
        close();
        try { socket.end(); } catch { /* already gone */ }
    };

    try {
        if ( !game.debugger.isAttached() ) game.debugger.attach();
    } catch ( error ) {
        log( 'bridge: debugger attach failed', String( error ) );
    }
    game.debugger.on( 'message', onDebuggerMessage );
    game.debugger.once( 'detach', onDebuggerDetach );
    socket.once( 'close', () => {
        game.debugger.removeListener( 'message', onDebuggerMessage );
        game.debugger.removeListener( 'detach', onDebuggerDetach );
        close();
    } );

    attachFrameReceiver( socket, ( text ) => {
        let request: CdpRequest;
        try {
            request = JSON.parse( text ) as CdpRequest;
        } catch {
            return;
        }
        game.debugger.sendCommand( request.method, request.params ?? {} ).then(
            ( result ) => send( { id: request.id, result: result ?? {} } ),
            ( error: unknown ) => send( {
                id: request.id,
                error: { code: -32000, message: String( ( error as Error )?.message ?? error ) },
            } )
        );
    }, close );
}

/** Starts (or reuses) the bridge server for one game webContents; resolves with its port. */
export function startDevtoolsBridge( game: WebContents, log: LogFunction ): Promise<number> {
    const existing = bridges.get( game.id );
    if ( existing ) return Promise.resolve( existing.port );
    return new Promise( ( resolve, reject ) => {
        const server = http.createServer( ( _req, res ) => {
            res.writeHead( 404 );
            res.end();
        } );
        const bridge: Bridge = { server, port: 0, activeSocket: null };
        server.on( 'upgrade', ( request, socket ) => {
            const key = request.headers[ 'sec-websocket-key' ];
            if ( !key ) {
                socket.destroy();
                return;
            }
            const accept = crypto.createHash( 'sha1' ).update( key + WS_ACCEPT_GUID ).digest( 'base64' );
            socket.write(
                'HTTP/1.1 101 Switching Protocols\r\n' +
                'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
                `Sec-WebSocket-Accept: ${ accept }\r\n\r\n`
            );
            handleConnection( bridge, game, socket as Socket, log );
        } );
        server.on( 'error', reject );
        server.listen( 0, '127.0.0.1', () => {
            bridge.port = ( server.address() as { port: number } ).port;
            bridges.set( game.id, bridge );
            game.once( 'destroyed', () => {
                try { server.close(); } catch { /* shutting down */ }
                bridges.delete( game.id );
            } );
            log( 'bridge: listening', { gameWcId: game.id, port: bridge.port } );
            resolve( bridge.port );
        } );
    } );
}

/** The devtools frontend URL that talks to the bridge on the given port. */
export function bridgeFrontendUrl( port: number ): string {
    return `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:${ port }/game`;
}
