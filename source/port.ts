import { MCPServerSettings } from './types';

/**
 * Port selection: every project gets a stable port derived from its uuid so several
 * Cocos projects can run side by side without manual configuration; if that port is
 * taken, the editor's free-port lookup moves us to the next available one.
 */

const PORT_RANGE_START = 20000;
const PORT_RANGE_SIZE = 20000;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a over the project uuid, folded into [PORT_RANGE_START, PORT_RANGE_START + PORT_RANGE_SIZE). */
export function hashPort(projectUuid: string): number {
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < projectUuid.length; i++) {
        hash ^= projectUuid.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME) >>> 0;
    }
    return PORT_RANGE_START + (hash % PORT_RANGE_SIZE);
}

/** Preferred port: the configured one, else the project-hash port. */
export function preferredPort(settings: MCPServerSettings): number {
    return settings.port ?? hashPort(Editor.Project.uuid);
}

/** Resolves the port the server should bind: preferred if free, otherwise the next free one. */
export async function resolvePort(settings: MCPServerSettings): Promise<number> {
    const preferred = preferredPort(settings);
    const actual = await Editor.Network.getFreePort(preferred);
    if (actual !== preferred) {
        console.warn(`[MCPServer] Port ${preferred} is in use, falling back to ${actual}`);
    }
    return actual;
}
