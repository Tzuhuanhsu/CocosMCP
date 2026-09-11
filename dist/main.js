"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
const mcp_server_1 = require("./mcp-server");
const settings_1 = require("./settings");
const port_1 = require("./port");
const mcp_json_1 = require("./mcp-json");
const inspector_host_1 = require("./inspector-host");
let mcpServer = null;
/**
 * Starts the server on an automatically resolved port and keeps the two files that depend on
 * it in sync: `settings/mcp-server.json` (so the port stays stable next launch) and the
 * project's `.mcp.json` (so Claude Code connects to the right place).
 */
async function startServerWithAutoPort() {
    if (!mcpServer) {
        console.warn('[MCP插件] mcpServer 未初始化');
        return;
    }
    if (mcpServer.getStatus().running) {
        return;
    }
    const settings = mcpServer.getSettings();
    const port = await (0, port_1.resolvePort)(settings);
    await mcpServer.start(port);
    if (settings.port !== port) {
        (0, settings_1.saveSettings)(Object.assign(Object.assign({}, settings), { port }));
    }
    (0, mcp_json_1.writeMcpJson)(port);
}
/**
 * @en Registration method for the main process of Extension
 * @zh 为扩展的主进程的注册方法
 */
exports.methods = {
    /**
     * @en Open the MCP server panel
     * @zh 打开 MCP 服务器面板
     */
    openPanel() {
        Editor.Panel.open('cocos-mcp-server');
    },
    /**
     * @en Start the MCP server
     * @zh 启动 MCP 服务器
     */
    async startServer() {
        await startServerWithAutoPort();
    },
    /**
     * @en Stop the MCP server
     * @zh 停止 MCP 服务器
     */
    async stopServer() {
        if (mcpServer) {
            mcpServer.stop();
        }
        else {
            console.warn('[MCP插件] mcpServer 未初始化');
        }
    },
    /**
     * @en Get server status
     * @zh 获取服务器状态
     */
    getServerStatus() {
        const status = mcpServer ? mcpServer.getStatus() : { running: false, port: null, clients: 0 };
        const settings = mcpServer ? mcpServer.getSettings() : (0, settings_1.readSettings)();
        return Object.assign(Object.assign({}, status), { settings: settings });
    },
    /**
     * @en Update server settings; restarts the server if it was running
     * @zh 更新服务器设置，运行中则重启
     */
    async updateSettings(partial) {
        const settings = Object.assign(Object.assign({}, (0, settings_1.readSettings)()), partial);
        (0, settings_1.saveSettings)(settings);
        const wasRunning = mcpServer ? mcpServer.getStatus().running : false;
        if (mcpServer) {
            mcpServer.stop();
        }
        mcpServer = new mcp_server_1.MCPServer(settings);
        if (wasRunning) {
            await startServerWithAutoPort();
        }
        return settings;
    },
    /**
     * @en Get tools list
     * @zh 获取工具列表
     */
    getToolsList() {
        return mcpServer ? mcpServer.getAvailableTools() : [];
    },
    /**
     * @en Get server settings
     * @zh 获取服务器设置
     */
    async getServerSettings() {
        return mcpServer ? mcpServer.getSettings() : (0, settings_1.readSettings)();
    },
    // Runtime inspector window (inspector/): menu entries under "Cocos MCP Server"
    previewMode() {
        (0, inspector_host_1.getInspector)().methods.previewMode();
    },
    buildMobileMode() {
        (0, inspector_host_1.getInspector)().methods.buildMobileMode();
    },
    buildDesktopMode() {
        (0, inspector_host_1.getInspector)().methods.buildDesktopMode();
    },
    openCustomPage() {
        (0, inspector_host_1.getInspector)().methods.openCustomPage();
    }
};
/**
 * @en Method Triggered on Extension Startup
 * @zh 扩展启动时触发的方法
 */
async function load() {
    console.log('Cocos MCP Server extension loaded');
    try {
        await (0, inspector_host_1.getInspector)().load();
    }
    catch (err) {
        console.error('[MCPServer] Failed to load runtime inspector module:', err);
    }
    const settings = (0, settings_1.readSettings)();
    mcpServer = new mcp_server_1.MCPServer(settings);
    if (settings.autoStart) {
        try {
            await startServerWithAutoPort();
        }
        catch (err) {
            console.error('Failed to auto-start MCP server:', err);
        }
    }
}
/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸载扩展时触发的方法
 */
function unload() {
    if (mcpServer) {
        mcpServer.stop();
        mcpServer = null;
    }
    try {
        (0, inspector_host_1.getInspector)().unload();
    }
    catch (err) {
        console.error('[MCPServer] Failed to unload runtime inspector module:', err);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWFpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NvdXJjZS9tYWluLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQWtJQSxvQkFtQkM7QUFNRCx3QkFVQztBQXJLRCw2Q0FBeUM7QUFDekMseUNBQXdEO0FBQ3hELGlDQUFxQztBQUNyQyx5Q0FBMEM7QUFFMUMscURBQWdEO0FBRWhELElBQUksU0FBUyxHQUFxQixJQUFJLENBQUM7QUFFdkM7Ozs7R0FJRztBQUNILEtBQUssVUFBVSx1QkFBdUI7SUFDbEMsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO1FBQ2IsT0FBTyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQ3ZDLE9BQU87SUFDWCxDQUFDO0lBQ0QsSUFBSSxTQUFTLENBQUMsU0FBUyxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDaEMsT0FBTztJQUNYLENBQUM7SUFDRCxNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsV0FBVyxFQUFFLENBQUM7SUFDekMsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFBLGtCQUFXLEVBQUMsUUFBUSxDQUFDLENBQUM7SUFDekMsTUFBTSxTQUFTLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQzVCLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxJQUFJLEVBQUUsQ0FBQztRQUN6QixJQUFBLHVCQUFZLGtDQUFNLFFBQVEsS0FBRSxJQUFJLElBQUcsQ0FBQztJQUN4QyxDQUFDO0lBQ0QsSUFBQSx1QkFBWSxFQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3ZCLENBQUM7QUFFRDs7O0dBR0c7QUFDVSxRQUFBLE9BQU8sR0FBNEM7SUFDNUQ7OztPQUdHO0lBQ0gsU0FBUztRQUNMLE1BQU0sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUVEOzs7T0FHRztJQUNILEtBQUssQ0FBQyxXQUFXO1FBQ2IsTUFBTSx1QkFBdUIsRUFBRSxD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LHNCQUFTLENBQUMsUUFBUSxDQUFDLENBQUM7SUFFcEMsSUFBSSxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7UUFDckIsSUFBSSxDQUFDO1lBQ0QsTUFBTSx1QkFBdUIsRUFBRSxDQUFDO1FBQ3BDLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ1gsT0FBTyxDQUFDLEtBQUssQ0FBQyxrQ0FBa0MsRUFBRSxHQUFHLENBQUMsQ0FBQztRQUMzRCxDQUFDO0lBQ0wsQ0FBQztBQUNMLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxTQUFnQixNQUFNO0lBQ2xCLElBQUksU0FBUyxFQUFFLENBQUM7UUFDWixTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakIsU0FBUyxHQUFHLElBQUksQ0FBQztJQUNyQixDQUFDO0lBQ0QsSUFBSSxDQUFDO1FBQ0QsSUFBQSw2QkFBWSxHQUFFLENBQUMsTUFBTSxFQUFFLENBQUM7SUFDNUIsQ0FBQztJQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDWCxPQUFPLENBQUMsS0FBSyxDQUFDLHdEQUF3RCxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ2pGLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTUNQU2VydmVyIH0gZnJvbSAnLi9tY3Atc2VydmVyJztcbmltcG9ydCB7IHJlYWRTZXR0aW5ncywgc2F2ZVNldHRpbmdzIH0gZnJvbSAnLi9zZXR0aW5ncyc7XG5pbXBvcnQgeyByZXNvbHZlUG9ydCB9IGZyb20gJy4vcG9ydCc7XG5pbXBvcnQgeyB3cml0ZU1jcEpzb24gfSBmcm9tICcuL21jcC1qc29uJztcbmltcG9ydCB7IE1DUFNlcnZlclNldHRpbmdzIH0gZnJvbSAnLi90eXBlcyc7XG5pbXBvcnQgeyBnZXRJbnNwZWN0b3IgfSBmcm9tICcuL2luc3BlY3Rvci1ob3N0JztcblxubGV0IG1jcFNlcnZlcjogTUNQU2VydmVyIHwgbnVsbCA9IG51bGw7XG5cbi8qKlxuICogU3RhcnRzIHRoZSBzZXJ2ZXIgb24gYW4gYXV0b21hdGljYWxseSByZXNvbHZlZCBwb3J0IGFuZCBrZWVwcyB0aGUgdHdvIGZpbGVzIHRoYXQgZGVwZW5kIG9uXG4gKiBpdCBpbiBzeW5jOiBgc2V0dGluZ3MvbWNwLXNlcnZlci5qc29uYCAoc28gdGhlIHBvcnQgc3RheXMgc3RhYmxlIG5leHQgbGF1bmNoKSBhbmQgdGhlXG4gKiBwcm9qZWN0J3MgYC5tY3AuanNvbmAgKHNvIENsYXVkZSBDb2RlIGNvbm5lY3RzIHRvIHRoZSByaWdodCBwbGFjZSkuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHN0YXJ0U2VydmVyV2l0aEF1dG9Qb3J0KCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghbWNwU2VydmVyKSB7XG4gICAgICAgIGNvbnNvbGUud2FybignW01DUOaPkuS7tl0gbWNwU2VydmVyIOacquWIneWni+WMlicpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChtY3BTZXJ2ZXIuZ2V0U3RhdHVzKCkucnVubmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHNldHRpbmdzID0gbWNwU2VydmVyLmdldFNldHRpbmdzKCk7XG4gICAgY29uc3QgcG9ydCA9IGF3YWl0IHJlc29sdmVQb3J0KHNldHRpbmdzKTtcbiAgICBhd2FpdCBtY3BTZXJ2ZXIuc3RhcnQocG9ydCk7XG4gICAgaWYgKHNldHRpbmdzLnBvcnQgIT09IHBvcnQpIHtcbiAgICAgICAgc2F2ZVNldHRpbmdzKHsgLi4uc2V0dGluZ3MsIHBvcnQgfSk7XG4gICAgfVxuICAgIHdyaXRlTWNwSnNvbihwb3J0KTtcbn1cblxuLyoqXG4gKiBAZW4gUmVnaXN0cmF0aW9uIG1ldGhvZCBmb3IgdGhlIG1haW4gcHJvY2VzcyBvZiBFeHRlbnNpb25cbiAqIEB6aCDkuLrmianlsZXnmoTkuLvov5vnqIvnmoTms6jlhozmlrnms5VcbiAqL1xuZXhwb3J0IGNvbnN0IG1ldGhvZHM6IHsgW2tleTogc3RyaW5nXTogKC4uLmFueTogYW55KSA9PiBhbnkgfSA9IHtcbiAgICAvKipcbiAgICAgKiBAZW4gT3BlbiB0aGUgTUNQIHNlcnZlciBwYW5lbFxuICAgICAqIEB6aCDmiZPlvIAgTUNQIOacjeWKoeWZqOmdouadv1xuICAgICAqL1xuICAgIG9wZW5QYW5lbCgpIHtcbiAgICAgICAgRWRpdG9yLlBhbmVsLm9wZW4oJ2NvY29zLW1jcC1zZXJ2ZXInKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQGVuIFN0YXJ0IHRoZSBNQ1Agc2VydmVyXG4gICAgICogQHpoIOWQr+WKqCBNQ1Ag5pyN5Yqh5ZmoXG4gICAgICovXG4gICAgYXN5bmMgc3RhcnRTZXJ2ZXIoKSB7XG4gICAgICAgIGF3YWl0IHN0YXJ0U2VydmVyV2l0aEF1dG9Qb3J0KCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBTdG9wIHRoZSBNQ1Agc2VydmVyXG4gICAgICogQHpoIOWBnOatoiBNQ1Ag5pyN5Yqh5ZmoXG4gICAgICovXG4gICAgYXN5bmMgc3RvcFNlcnZlcigpIHtcbiAgICAgICAgaWYgKG1jcFNlcnZlcikge1xuICAgICAgICAgICAgbWNwU2VydmVyLnN0b3AoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybignW01DUOaPkuS7tl0gbWNwU2VydmVyIOacquWIneWni+WMlicpO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBHZXQgc2VydmVyIHN0YXR1c1xuICAgICAqIEB6aCDojrflj5bmnI3liqHlmajnirbmgIFcbiAgICAgKi9cbiAgICBnZXRTZXJ2ZXJTdGF0dXMoKSB7XG4gICAgICAgIGNvbnN0IHN0YXR1cyA9IG1jcFNlcnZlciA/IG1jcFNlcnZlci5nZXRTdGF0dXMoKSA6IHsgcnVubmluZzogZmFsc2UsIHBvcnQ6IG51bGwsIGNsaWVudHM6IDAgfTtcbiAgICAgICAgY29uc3Qgc2V0dGluZ3MgPSBtY3BTZXJ2ZXIgPyBtY3BTZXJ2ZXIuZ2V0U2V0dGluZ3MoKSA6IHJlYWRTZXR0aW5ncygpO1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgLi4uc3RhdHVzLFxuICAgICAgICAgICAgc2V0dGluZ3M6IHNldHRpbmdzXG4gICAgICAgIH07XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBVcGRhdGUgc2VydmVyIHNldHRpbmdzOyByZXN0YXJ0cyB0aGUgc2VydmVyIGlmIGl0IHdhcyBydW5uaW5nXG4gICAgICogQHpoIOabtOaWsOacjeWKoeWZqOiuvue9ru+8jOi/kOihjOS4reWImemHjeWQr1xuICAgICAqL1xuICAgIGFzeW5jIHVwZGF0ZVNldHRpbmdzKHBhcnRpYWw6IFBhcnRpYWw8TUNQU2VydmVyU2V0dGluZ3M+KSB7XG4gICAgICAgIGNvbnN0IHNldHRpbmdzOiBNQ1BTZXJ2ZXJTZXR0aW5ncyA9IHsgLi4ucmVhZFNldHRpbmdzKCksIC4uLnBhcnRpYWwgfTtcbiAgICAgICAgc2F2ZVNldHRpbmdzKHNldHRpbmdzKTtcbiAgICAgICAgY29uc3Qgd2FzUnVubmluZyA9IG1jcFNlcnZlciA/IG1jcFNlcnZlci5nZXRTdGF0dXMoKS5ydW5uaW5nIDogZmFsc2U7XG4gICAgICAgIGlmIChtY3BTZXJ2ZXIpIHtcbiAgICAgICAgICAgIG1jcFNlcnZlci5zdG9wKCk7XG4gICAgICAgIH1cbiAgICAgICAgbWNwU2VydmVyID0gbmV3IE1DUFNlcnZlcihzZXR0aW5ncyk7XG4gICAgICAgIGlmICh3YXNSdW5uaW5nKSB7XG4gICAgICAgICAgICBhd2FpdCBzdGFydFNlcnZlcldpdGhBdXRvUG9ydCgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzZXR0aW5ncztcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQGVuIEdldCB0b29scyBsaXN0XG4gICAgICogQHpoIOiOt+WPluW3peWFt+WIl+ihqFxuICAgICAqL1xuICAgIGdldFRvb2xzTGlzdCgpIHtcbiAgICAgICAgcmV0dXJuIG1jcFNlcnZlciA/IG1jcFNlcnZlci5nZXRBdmFpbGFibGVUb29scygpIDogW107XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIEBlbiBHZXQgc2VydmVyIHNldHRpbmdzXG4gICAgICogQHpoIOiOt+WPluacjeWKoeWZqOiuvue9rlxuICAgICAqL1xuICAgIGFzeW5jIGdldFNlcnZlclNldHRpbmdzKCkge1xuICAgICAgICByZXR1cm4gbWNwU2VydmVyID8gbWNwU2VydmVyLmdldFNldHRpbmdzKCkgOiByZWFkU2V0dGluZ3MoKTtcbiAgICB9LFxuXG4gICAgLy8gUnVudGltZSBpbnNwZWN0b3Igd2luZG93IChpbnNwZWN0b3IvKTogbWVudSBlbnRyaWVzIHVuZGVyIFwiQ29jb3MgTUNQIFNlcnZlclwiXG4gICAgcHJldmlld01vZGUoKSB7XG4gICAgICAgIGdldEluc3BlY3RvcigpLm1ldGhvZHMucHJldmlld01vZGUoKTtcbiAgICB9LFxuICAgIGJ1aWxkTW9iaWxlTW9kZSgpIHtcbiAgICAgICAgZ2V0SW5zcGVjdG9yKCkubWV0aG9kcy5idWlsZE1vYmlsZU1vZGUoKTtcbiAgICB9LFxuICAgIGJ1aWxkRGVza3RvcE1vZGUoKSB7XG4gICAgICAgIGdldEluc3BlY3RvcigpLm1ldGhvZHMuYnVpbGREZXNrdG9wTW9kZSgpO1xuICAgIH0sXG4gICAgb3BlbkN1c3RvbVBhZ2UoKSB7XG4gICAgICAgIGdldEluc3BlY3RvcigpLm1ldGhvZHMub3BlbkN1c3RvbVBhZ2UoKTtcbiAgICB9XG59O1xuXG4vKipcbiAqIEBlbiBNZXRob2QgVHJpZ2dlcmVkIG9uIEV4dGVuc2lvbiBTdGFydHVwXG4gKiBAemgg5omp5bGV5ZCv5Yqo5pe26Kem5Y+R55qE5pa55rOVXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsb2FkKCkge1xuICAgIGNvbnNvbGUubG9nKCdDb2NvcyBNQ1AgU2VydmVyIGV4dGVuc2lvbiBsb2FkZWQnKTtcblxuICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IGdldEluc3BlY3RvcigpLmxvYWQoKTtcbiAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcignW01DUFNlcnZlcl0gRmFpbGVkIHRvIGxvYWQgcnVudGltZSBpbnNwZWN0b3IgbW9kdWxlOicsIGVycik7XG4gICAgfVxuXG4gICAgY29uc3Qgc2V0dGluZ3MgPSByZWFkU2V0dGluZ3MoKTtcbiAgICBtY3BTZXJ2ZXIgPSBuZXcgTUNQU2VydmVyKHNldHRpbmdzKTtcblxuICAgIGlmIChzZXR0aW5ncy5hdXRvU3RhcnQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGF3YWl0IHN0YXJ0U2VydmVyV2l0aEF1dG9Qb3J0KCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGF1dG8tc3RhcnQgTUNQIHNlcnZlcjonLCBlcnIpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vKipcbiAqIEBlbiBNZXRob2QgdHJpZ2dlcmVkIHdoZW4gdW5pbnN0YWxsaW5nIHRoZSBleHRlbnNpb25cbiAqIEB6aCDljbjovb3mianlsZXml7bop6blj5HnmoTmlrnms5VcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHVubG9hZCgpIHtcbiAgICBpZiAobWNwU2VydmVyKSB7XG4gICAgICAgIG1jcFNlcnZlci5zdG9wKCk7XG4gICAgICAgIG1jcFNlcnZlciA9IG51bGw7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICAgIGdldEluc3BlY3RvcigpLnVubG9hZCgpO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLmVycm9yKCdbTUNQU2VydmVyXSBGYWlsZWQgdG8gdW5sb2FkIHJ1bnRpbWUgaW5zcGVjdG9yIG1vZHVsZTonLCBlcnIpO1xuICAgIH1cbn1cbiJdfQ==