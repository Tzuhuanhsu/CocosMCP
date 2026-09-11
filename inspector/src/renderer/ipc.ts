// Renderer-side IPC helpers (all main-process access goes through here - no `remote`).
import { ipcRenderer, shell, clipboard } from 'electron';
import { IpcSend, IpcInvoke, IpcEvent, type MenuItemSpec, type WireDevtoolsResult } from '@shared/protocol';

export interface MenuEntry extends MenuItemSpec {
    action?: () => void;
    submenuEntries?: MenuEntry[];
}

let menuAutoId = 0;

/** Shows a native context menu (built in the main process) and runs the clicked entry's action. */
export async function popupMenu( entries: MenuEntry[] ): Promise<void> {
    const actions = new Map<string, () => void>();
    const toSpec = ( entry: MenuEntry ): MenuItemSpec => {
        const id = entry.id ?? `menu-${ menuAutoId++ }`;
        if ( entry.action ) actions.set( id, entry.action );
        return {
            id,
            label: entry.label,
            type: entry.type,
            checked: entry.checked,
            enabled: entry.enabled,
            submenu: entry.submenuEntries?.map( toSpec ),
        };
    };
    const specs = entries.map( toSpec );
    const clickedId = await ipcRenderer.invoke( IpcInvoke.showMenu, specs );
    if ( clickedId && actions.has( clickedId ) ) actions.get( clickedId )!();
}

export function wireDevtoolsIpc( gameWcId: number, devtoolsWcId: number ): Promise<WireDevtoolsResult> {
    return ipcRenderer.invoke( IpcInvoke.wireDevtools, gameWcId, devtoolsWcId );
}

export function setAudioMutedIpc( gameWcId: number, muted: boolean ): void {
    ipcRenderer.invoke( IpcInvoke.setAudioMuted, gameWcId, muted );
}

export function showOpenDialogIpc( extensions: string[] ): Promise<string[] | null> {
    return ipcRenderer.invoke( IpcInvoke.showOpenDialog, extensions );
}

export function getLocaleIpc(): Promise<string> {
    return ipcRenderer.invoke( IpcInvoke.getLocale );
}

export function syncWindowModeIpc( width: number, height: number, simpleMode: boolean, minHeightExtra: number ): void {
    ipcRenderer.invoke( IpcInvoke.syncWindowMode, width, height, simpleMode, minHeightExtra );
}

export function focusNodeInEditor( uuid: string ): void {
    ipcRenderer.send( IpcSend.focusNode, uuid );
}

export function focusAssetInEditor( uuid: string ): void {
    ipcRenderer.send( IpcSend.focusAsset, uuid );
}

export function onDebuggerPaused( handler: () => void ): void {
    ipcRenderer.on( IpcEvent.debuggerPaused, handler );
}

export function openExternal( url: string ): void {
    shell.openExternal( url );
}

export function copyToClipboard( text: string ): void {
    clipboard.writeText( text );
}
