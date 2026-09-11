import * as fs from 'fs';
import * as path from 'path';

/**
 * Keeps the project's `.mcp.json` (read by Claude Code at session start) pointing at the
 * port this server actually bound. Only the `cocos-mcp` entry is touched; other servers
 * the user configured are preserved.
 */

const MCP_SERVER_KEY = 'cocos-mcp';
const MCP_JSON_INDENT = 2;

export function buildMcpUrl(port: number): string {
    return `http://127.0.0.1:${port}/mcp`;
}

function getMcpJsonPath(): string {
    return path.join(Editor.Project.path, '.mcp.json');
}

/** Returns true when the file was (re)written, false when it already matched. */
export function writeMcpJson(port: number): boolean {
    const filePath = getMcpJsonPath();
    let config: any = { mcpServers: {} };
    if (fs.existsSync(filePath)) {
        try {
            config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (err) {
            console.warn('[MCPServer] .mcp.json is not valid JSON, rewriting it:', err);
            config = { mcpServers: {} };
        }
    }
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        config.mcpServers = {};
    }

    const desired = { type: 'http', url: buildMcpUrl(port) };
    const current = config.mcpServers[MCP_SERVER_KEY];
    if (current && current.type === desired.type && current.url === desired.url) {
        return false;
    }

    config.mcpServers[MCP_SERVER_KEY] = { ...current, ...desired };
    fs.writeFileSync(filePath, JSON.stringify(config, null, MCP_JSON_INDENT) + '\n');
    console.log(`[MCPServer] .mcp.json updated → ${desired.url} (a running Claude Code session needs /mcp to reconnect)`);
    return true;
}
