// Mirrors console output and uncaught errors to the inspector's log panel.
import { flags } from './state';

const MAX_STRINGIFY_DEPTH = 3;

/** Human-readable one-line rendering of console arguments (objects one level deep). */
function stringifyArgs( args: unknown[], depth = 1 ): string {
    const parts = args.map( ( arg ) => {
        if ( typeof arg !== 'object' && typeof arg !== 'function' ) return String( arg );
        if ( arg === null ) return 'null';
        if ( Array.isArray( arg ) ) {
            return depth === MAX_STRINGIFY_DEPTH ? String( arg ) : `[${ stringifyArgs( arg, depth + 1 ) }]`;
        }
        const shallow: Record<string, unknown> = {};
        for ( const key in arg as Record<string, unknown> ) {
            const value = ( arg as Record<string, unknown> )[ key ];
            if ( typeof value !== 'object' && typeof value !== 'function' ) {
                shallow[ key ] = value === null ? 'null' : value;
            }
        }
        return JSON.stringify( shallow, null, '\t' );
    } );
    return parts.length === 1 ? parts[ 0 ] : parts.join( ',' );
}

function isAllComplex( args: unknown[] ): boolean {
    return args.every( ( arg ) => {
        const type = typeof arg;
        return type !== 'function' && type !== 'object';
    } );
}

function wrap( original: ( ...args: unknown[] ) => void, forward: ( text: string ) => void ) {
    return function ( this: unknown, ...args: unknown[] ): void {
        original.call( console, ...args );
        if ( !isAllComplex( args ) ) forward( stringifyArgs( args ) );
        else if ( ( window as any ).cc ) forward( cc.js.formatStr( ...args ) );
    };
}

export function initLogListeners(): void {
    if ( flags.logCount === 0 && flags.showDevToolInTab ) return;
    window.addEventListener( 'error', ( event ) => {
        console.error( event.message + '\n' + ( event.error?.stack ?? '' ) );
    }, true );
    window.addEventListener( 'unhandledrejection', ( event ) => {
        console.error( `${ event.reason }` );
    }, true );
    console.log = wrap( console.log, sendLog );
    console.info = wrap( console.info, sendLog );
    console.error = wrap( console.error, sendError );
    console.warn = wrap( console.warn, sendWarn );
}
