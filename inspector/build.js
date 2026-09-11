// Build script: bundles the TypeScript sources into dist/ with esbuild.
// Usage: node build.js [--watch]
'use strict';
const esbuild = require('esbuild');
const path = require('path');

// Version of the host extension (cocos-mcp-server) — the inspector ships inside it.
const PKG_VERSION = require( '../package.json' ).version;

const COMMON = {
    // run from any cwd (npm run build at the extension root): paths resolve against this folder
    absWorkingDir: __dirname,
    bundle: true,
    sourcemap: 'inline',
    target: [ 'chrome91', 'node14' ],
    logLevel: 'info',
    alias: { '@shared': path.join( __dirname, 'src/shared' ) },
    define: { __PKG_VERSION__: JSON.stringify( PKG_VERSION ) },
};

// Node/Electron contexts: electron is provided by the runtime, never bundled.
const NODE_BUNDLES = [
    { entryPoints: [ 'src/main/main.ts' ], outfile: 'dist/main.js', platform: 'node', format: 'cjs', external: [ 'electron' ] },
    { entryPoints: [ 'src/preload/mainPreload.ts' ], outfile: 'dist/mainPreload.js', platform: 'node', format: 'cjs', external: [ 'electron' ] },
    { entryPoints: [ 'src/preload/gamePreload.ts' ], outfile: 'dist/gamePreload.js', platform: 'node', format: 'cjs', external: [ 'electron' ] },
];

// Renderer runs with nodeIntegration, so require('electron') resolves at runtime through the
// global require; esbuild keeps those calls intact because of `external`.
const RENDERER_BUNDLE = {
    entryPoints: [ 'src/renderer/app.ts' ],
    outfile: 'dist/renderer.js',
    platform: 'node',
    format: 'iife',
    external: [ 'electron', 'fs', 'path', 'os', 'process' ],
};

// Injected probe runs inside the inspected game page: pure browser code, no node APIs.
const INJECTED_BUNDLE = {
    entryPoints: [ 'src/injected/index.ts' ],
    outfile: 'dist/injected.js',
    platform: 'browser',
    format: 'iife',
};

async function run() {
    const watch = process.argv.includes( '--watch' );
    const configs = [ ...NODE_BUNDLES, RENDERER_BUNDLE, INJECTED_BUNDLE ].map( ( config ) => ( { ...COMMON, ...config } ) );
    if ( watch ) {
        const contexts = await Promise.all( configs.map( ( config ) => esbuild.context( config ) ) );
        await Promise.all( contexts.map( ( context ) => context.watch() ) );
        console.log( 'watching for changes...' );
    } else {
        await Promise.all( configs.map( ( config ) => esbuild.build( config ) ) );
    }
}

run().catch( ( error ) => {
    console.error( error );
    process.exit( 1 );
} );
