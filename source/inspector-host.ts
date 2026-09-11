import * as path from 'path';
import { InspectorModule } from './types/inspector';

/**
 * Loads the bundled runtime inspector (`inspector/dist/main.js`). It is built by esbuild outside
 * the tsc rootDir, so it is required dynamically and typed by hand (types/inspector.ts).
 */

const INSPECTOR_ENTRY = path.join(__dirname, '..', 'inspector', 'dist', 'main.js');

let inspector: InspectorModule | null = null;

export function getInspector(): InspectorModule {
    if (!inspector) {
        inspector = require(INSPECTOR_ENTRY) as InspectorModule;
    }
    return inspector;
}
