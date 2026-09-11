// Logging for the extension main process. Console always; optional file log for diagnosing
// issues inside Creator (enable by setting COCOS_INSPECTOR_DEBUG_LOG=1 before launching Creator).
import * as fs from 'fs';
import * as path from 'path';

declare const Editor: { Project?: { tmpDir: string } } | undefined;

const FILE_LOG_ENABLED = process.env.COCOS_INSPECTOR_DEBUG_LOG === '1';
const LOG_FILE_NAME = 'inspector-debug.log';

function resolveLogPath(): string {
    // project temp dir when running inside Creator; extension folder otherwise
    const base = ( typeof Editor !== 'undefined' && Editor?.Project?.tmpDir ) ? Editor.Project.tmpDir : path.join( __dirname, '..' );
    return path.join( base, LOG_FILE_NAME );
}
const LOG_PATH = resolveLogPath();

export function resetLogFile(): void {
    if ( !FILE_LOG_ENABLED ) return;
    try { fs.writeFileSync( LOG_PATH, '' ); } catch { /* logging must never break the tool */ }
}

export function log( ...parts: unknown[] ): void {
    console.log( '[cocos-inspector]', ...parts );
    if ( !FILE_LOG_ENABLED ) return;
    const line = new Date().toISOString() + ' ' + parts.map(
        ( part ) => ( typeof part === 'string' ? part : JSON.stringify( part ) )
    ).join( ' ' );
    try { fs.appendFileSync( LOG_PATH, line + '\n' ); } catch { /* ignore */ }
}
