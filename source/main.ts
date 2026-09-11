import { MCPServer } from './mcp-server';
import { readSettings, saveSettings } from './settings';
import { resolvePort } from './port';
import { writeMcpJson } from './mcp-json';
import { MCPServerSettings } from './types';
import { getInspector } from './inspector-host';

let mcpServer: MCPServer | null = null;

/**
 * Starts the server on an automatically resolved port and keeps the two files that depend on
 * it in sync: `settings/mcp-server.json` (so the port stays stable next launch) and the
 * project's `.mcp.json` (so Claude Code connects to the right place).
 */
async function startServerWithAutoPort(): Promise<void> {
    if (!mcpServer) {
        console.warn('[MCP插件] mcpServer 未初始化');
        return;
    }
    if (mcpServer.getStatus().running) {
        return;
    }
    const settings = mcpServer.getSettings();
    const port = await resolvePort(settings);
    await mcpServer.start(port);
    if (settings.port !== port) {
        saveSettings({ ...settings, port });
    }
    writeMcpJson(port);
}

/**
 * @en Registration method for the main process of Extension
 * @zh 为扩展的主进程的注册方法
 */
export const methods: { [key: string]: (...any: any) => any } = {
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
        } else {
            console.warn('[MCP插件] mcpServer 未初始化');
        }
    },

    /**
     * @en Get server status
     * @zh 获取服务器状态
     */
    getServerStatus() {
        const status = mcpServer ? mcpServer.getStatus() : { running: false, port: null, clients: 0 };
        const settings = mcpServer ? mcpServer.getSettings() : readSettings();
        return {
            ...status,
            settings: settings
        };
    },

    /**
     * @en Update server settings; restarts the server if it was running
     * @zh 更新服务器设置，运行中则重启
     */
    async updateSettings(partial: Partial<MCPServerSettings>) {
        const settings: MCPServerSettings = { ...readSettings(), ...partial };
        saveSettings(settings);
        const wasRunning = mcpServer ? mcpServer.getStatus().running : false;
        if (mcpServer) {
            mcpServer.stop();
        }
        mcpServer = new MCPServer(settings);
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
        return mcpServer ? mcpServer.getSettings() : readSettings();
    },

    // Runtime inspector window (inspector/): menu entries under "Cocos MCP Server"
    previewMode() {
        getInspector().methods.previewMode();
    },
    buildMobileMode() {
        getInspector().methods.buildMobileMode();
    },
    buildDesktopMode() {
        getInspector().methods.buildDesktopMode();
    },
    openCustomPage() {
        getInspector().methods.openCustomPage();
    }
};

/**
 * @en Method Triggered on Extension Startup
 * @zh 扩展启动时触发的方法
 */
export async function load() {
    console.log('Cocos MCP Server extension loaded');

    try {
        await getInspector().load();
    } catch (err) {
        console.error('[MCPServer] Failed to load runtime inspector module:', err);
    }

    const settings = readSettings();
    mcpServer = new MCPServer(settings);

    if (settings.autoStart) {
        try {
            await startServerWithAutoPort();
        } catch (err) {
            console.error('Failed to auto-start MCP server:', err);
        }
    }
}

/**
 * @en Method triggered when uninstalling the extension
 * @zh 卸载扩展时触发的方法
 */
export function unload() {
    if (mcpServer) {
        mcpServer.stop();
        mcpServer = null;
    }
    try {
        getInspector().unload();
    } catch (err) {
        console.error('[MCPServer] Failed to unload runtime inspector module:', err);
    }
}
