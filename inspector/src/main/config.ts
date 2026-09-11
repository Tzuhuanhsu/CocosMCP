// Inspector settings persistence, shared with the renderer preload.
// Resolution order: the path handed over by the main process (project settings dir),
// then the legacy extensions/cocos-inspector-config.json, then the bundled default config.json.
import * as fs from 'fs';
import * as path from 'path';
import type { InspectorConfig } from '@shared/protocol';

/** CLI switches used to hand project facts to the inspector renderer (webPreferences.additionalArguments). */
export const CONFIG_PATH_ARG = '--inspector-config=';
export const DESIGN_SIZE_ARG = '--design-size=';
export const CONFIG_FILE_NAME = 'cocos-inspector.json';
const PROJECT_SETTINGS_RELATIVE = [ 'settings', 'v2', 'packages', 'project.json' ];

// __dirname is inspector/dist at runtime; the bundled default lives in the inspector root.
const INSPECTOR_ROOT = path.join( __dirname, '..' );
const LOCAL_CONFIG_PATH = path.join( INSPECTOR_ROOT, 'config.json' );
// pre-merge location (CocosInspector was a sibling extension, config sat next to it)
const LEGACY_CONFIG_PATH = path.join( INSPECTOR_ROOT, '../../cocos-inspector-config.json' );

declare const Editor: { Project?: { path: string } } | undefined;

/** Project-level config path: from argv in the renderer, from Editor in the main process. */
export function getProjectConfigPath(): string | null {
    const fromArgv = process.argv.find( ( arg ) => arg.startsWith( CONFIG_PATH_ARG ) );
    if ( fromArgv ) return fromArgv.slice( CONFIG_PATH_ARG.length );
    if ( typeof Editor !== 'undefined' && Editor?.Project?.path ) {
        return path.join( Editor.Project.path, 'settings', CONFIG_FILE_NAME );
    }
    return null;
}

/** Project design resolution [width, height] from settings/v2/packages/project.json (main process only). */
export function readProjectDesignSize(): [ number, number ] | null {
    if ( typeof Editor === 'undefined' || !Editor?.Project?.path ) return null;
    try {
        const raw = fs.readFileSync( path.join( Editor.Project.path, ...PROJECT_SETTINGS_RELATIVE ), { encoding: 'utf-8' } );
        const resolution = JSON.parse( raw )?.general?.designResolution;
        if ( typeof resolution?.width === 'number' && typeof resolution?.height === 'number' ) {
            return [ resolution.width, resolution.height ];
        }
    } catch { /* project has no explicit design resolution */ }
    return null;
}

/** Design resolution handed over by the main process (renderer side). */
export function getDesignSize(): [ number, number ] | null {
    const fromArgv = process.argv.find( ( arg ) => arg.startsWith( DESIGN_SIZE_ARG ) );
    if ( !fromArgv ) return null;
    const [ width, height ] = fromArgv.slice( DESIGN_SIZE_ARG.length ).split( 'x' ).map( Number );
    return width > 0 && height > 0 ? [ width, height ] : null;
}

export function readConfig(): InspectorConfig {
    const projectPath = getProjectConfigPath();
    const candidates = [ projectPath, LEGACY_CONFIG_PATH, LOCAL_CONFIG_PATH ].filter( ( p ): p is string => Boolean( p ) );
    const configPath = candidates.find( ( p ) => fs.existsSync( p ) ) ?? LOCAL_CONFIG_PATH;
    return JSON.parse( fs.readFileSync( configPath, { encoding: 'utf-8' } ) ) as InspectorConfig;
}

export function saveConfig( config: InspectorConfig ): void {
    const target = getProjectConfigPath() ?? LEGACY_CONFIG_PATH;
    fs.mkdirSync( path.dirname( target ), { recursive: true } );
    fs.writeFileSync( target, JSON.stringify( config ), { encoding: 'utf-8' } );
}
