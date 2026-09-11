// Game-webview preload: the injected probe calls these globals, each one forwards its payload
// to the inspector renderer via ipcRenderer.sendToHost.
import { ipcRenderer } from 'electron';
import { HostChannel } from '@shared/protocol';

declare const global: Record<string, unknown>;

const BRIDGE: Record<string, string> = {
    sendGameState: HostChannel.gameState,
    locateNode: HostChannel.locateNode,
    sendLog: HostChannel.consoleLog,
    sendError: HostChannel.consoleError,
    sendWarn: HostChannel.consoleWarn,
    sendTree: HostChannel.updateTree,
    showNodeDetail: HostChannel.showNodeDetail,
    sendStatistic: HostChannel.sendStatistic,
};

for ( const [ globalName, channel ] of Object.entries( BRIDGE ) ) {
    global[ globalName ] = ( payload: unknown ) => ipcRenderer.sendToHost( channel, payload );
}

global.canUpdateTree = () => ipcRenderer.sendToHost( HostChannel.canUpdateTree, true );
