"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMcpUrl = buildMcpUrl;
exports.writeMcpJson = writeMcpJson;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Keeps the project's `.mcp.json` (read by Claude Code at session start) pointing at the
 * port this server actually bound. Only the `cocos-mcp` entry is touched; other servers
 * the user configured are preserved.
 */
const MCP_SERVER_KEY = 'cocos-mcp';
const MCP_JSON_INDENT = 2;
function buildMcpUrl(port) {
    return `http://127.0.0.1:${port}/mcp`;
}
function getMcpJsonPath() {
    return path.join(Editor.Project.path, '.mcp.json');
}
/** Returns true when the file was (re)written, false when it already matched. */
function writeMcpJson(port) {
    const filePath = getMcpJsonPath();
    let config = { mcpServers: {} };
    if (fs.existsSync(filePath)) {
        try {
            config = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
        catch (err) {
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
    config.mcpServers[MCP_SERVER_KEY] = Object.assign(Object.assign({}, current), desired);
    fs.writeFileSync(filePath, JSON.stringify(config, null, MCP_JSON_INDENT) + '\n');
    console.log(`[MCPServer] .mcp.json updated → ${desired.url} (a running Claude Code session needs /mcp to reconnect)`);
    return true;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwLWpzb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2UvbWNwLWpzb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFZQSxrQ0FFQztBQU9ELG9DQXlCQztBQTlDRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCOzs7O0dBSUc7QUFFSCxNQUFNLGNBQWMsR0FBRyxXQUFXLENBQUM7QUFDbkMsTUFBTSxlQUFlLEdBQUcsQ0FBQyxDQUFDO0FBRTFCLFNBQWdCLFdBQVcsQ0FBQyxJQUFZO0lBQ3BDLE9BQU8sb0JBQW9CLElBQUksTUFBTSxDQUFDO0FBQzFDLENBQUM7QUFFRCxTQUFTLGNBQWM7SUFDbkIsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQ3ZELENBQUM7QUFFRCxpRkFBaUY7QUFDakYsU0FBZ0IsWUFBWSxDQUFDLElBQVk7SUFDckMsTUFBTSxRQUFRLEdBQUcsY0FBYyxFQUFFLENBQUM7SUFDbEMsSUFBSSxNQUFNLEdBQVEsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLENBQUM7SUFDckMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7UUFDMUIsSUFBSSxDQUFDO1lBQ0QsTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUMzRCxDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNYLE9BQU8sQ0FBQyxJQUFJLENBQUMsd0RBQXdELEVBQUUsR0FBRyxDQUFDLENBQUM7WUFDNUUsTUFBTSxHQUFHLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxDQUFDO1FBQ2hDLENBQUM7SUFDTCxDQUFDO0lBQ0QsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLElBQUksT0FBTyxNQUFNLENBQUMsVUFBVSxLQUFLLFFBQVEsRUFBRSxDQUFDO1FBQzlELE1BQU0sQ0FBQyxVQUFVLEdBQUcsRUFBRSxDQUFDO0lBQzNCLENBQUM7SUFFRCxNQUFNLE9BQU8sR0FBRyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsR0FBRyxFQUFFLFdBQVcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDO0lBQ3pELE1BQU0sT0FBTyxHQUFHLE1BQU0sQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLENBQUM7SUFDbEQsSUFBSSxPQUFPLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxPQUFPLENBQUMsSUFBSSxJQUFJLE9BQU8sQ0FBQyxHQUFHLEtBQUssT0FBTyxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQzFFLE9BQU8sS0FBSyxDQUFDO0lBQ2pCLENBQUM7SUFFRCxNQUFNLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxtQ0FBUSxPQUFPLEdBQUssT0FBTyxDQUFFLENBQUM7SUFDL0QsRUFBRSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLGVBQWUsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDO0lBQ2pGLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUNBQW1DLE9BQU8sQ0FBQyxHQUFHLDBEQUEwRCxDQUFDLENBQUM7SUFDdEgsT0FBTyxJQUFJLENBQUM7QUFDaEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbi8qKlxuICogS2VlcHMgdGhlIHByb2plY3QncyBgLm1jcC5qc29uYCAocmVhZCBieSBDbGF1ZGUgQ29kZSBhdCBzZXNzaW9uIHN0YXJ0KSBwb2ludGluZyBhdCB0aGVcbiAqIHBvcnQgdGhpcyBzZXJ2ZXIgYWN0dWFsbHkgYm91bmQuIE9ubHkgdGhlIGBjb2Nvcy1tY3BgIGVudHJ5IGlzIHRvdWNoZWQ7IG90aGVyIHNlcnZlcnNcbiAqIHRoZSB1c2VyIGNvbmZpZ3VyZWQgYXJlIHByZXNlcnZlZC5cbiAqL1xuXG5jb25zdCBNQ1BfU0VSVkVSX0tFWSA9ICdjb2Nvcy1tY3AnO1xuY29uc3QgTUNQX0pTT05fSU5ERU5UID0gMjtcblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkTWNwVXJsKHBvcnQ6IG51bWJlcik6IHN0cmluZyB7XG4gICAgcmV0dXJuIGBodHRwOi8vMTI3LjAuMC4xOiR7cG9ydH0vbWNwYDtcbn1cblxuZnVuY3Rpb24gZ2V0TWNwSnNvblBhdGgoKTogc3RyaW5nIHtcbiAgICByZXR1cm4gcGF0aC5qb2luKEVkaXRvci5Qcm9qZWN0LnBhdGgsICcubWNwLmpzb24nKTtcbn1cblxuLyoqIFJldHVybnMgdHJ1ZSB3aGVuIHRoZSBmaWxlIHdhcyAocmUpd3JpdHRlbiwgZmFsc2Ugd2hlbiBpdCBhbHJlYWR5IG1hdGNoZWQuICovXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVNY3BKc29uKHBvcnQ6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgIGNvbnN0IGZpbGVQYXRoID0gZ2V0TWNwSnNvblBhdGgoKTtcbiAgICBsZXQgY29uZmlnOiBhbnkgPSB7IG1jcFNlcnZlcnM6IHt9IH07XG4gICAgaWYgKGZzLmV4aXN0c1N5bmMoZmlsZVBhdGgpKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25maWcgPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyhmaWxlUGF0aCwgJ3V0ZjgnKSk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS53YXJuKCdbTUNQU2VydmVyXSAubWNwLmpzb24gaXMgbm90IHZhbGlkIEpTT04sIHJld3JpdGluZyBpdDonLCBlcnIpO1xuICAgICAgICAgICAgY29uZmlnID0geyBtY3BTZXJ2ZXJzOiB7fSB9O1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmICghY29uZmlnLm1jcFNlcnZlcnMgfHwgdHlwZW9mIGNvbmZpZy5tY3BTZXJ2ZXJzICE9PSAnb2JqZWN0Jykge1xuICAgICAgICBjb25maWcubWNwU2VydmVycyA9IHt9O1xuICAgIH1cblxuICAgIGNvbnN0IGRlc2lyZWQgPSB7IHR5cGU6ICdodHRwJywgdXJsOiBidWlsZE1jcFVybChwb3J0KSB9O1xuICAgIGNvbnN0IGN1cnJlbnQgPSBjb25maWcubWNwU2VydmVyc1tNQ1BfU0VSVkVSX0tFWV07XG4gICAgaWYgKGN1cnJlbnQgJiYgY3VycmVudC50eXBlID09PSBkZXNpcmVkLnR5cGUgJiYgY3VycmVudC51cmwgPT09IGRlc2lyZWQudXJsKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBjb25maWcubWNwU2VydmVyc1tNQ1BfU0VSVkVSX0tFWV0gPSB7IC4uLmN1cnJlbnQsIC4uLmRlc2lyZWQgfTtcbiAgICBmcy53cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBKU09OLnN0cmluZ2lmeShjb25maWcsIG51bGwsIE1DUF9KU09OX0lOREVOVCkgKyAnXFxuJyk7XG4gICAgY29uc29sZS5sb2coYFtNQ1BTZXJ2ZXJdIC5tY3AuanNvbiB1cGRhdGVkIOKGkiAke2Rlc2lyZWQudXJsfSAoYSBydW5uaW5nIENsYXVkZSBDb2RlIHNlc3Npb24gbmVlZHMgL21jcCB0byByZWNvbm5lY3QpYCk7XG4gICAgcmV0dXJuIHRydWU7XG59XG4iXX0=