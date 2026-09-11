// Context menus (app / tree tab / node / component / console).
import { ipcRenderer } from 'electron';
import { IpcInvoke } from '@shared/protocol';
import { context, execInGame } from './context';
import { popupMenu, copyToClipboard, focusNodeInEditor, type MenuEntry } from './ipc';

const NODE_BREAK_EVENTS = [
    'size-changed', 'color-changed', 'child-removed', 'child-added',
    'layer-changed', 'sibling-order-changed', 'active-in-hierarchy-changed',
];
const TRANSFORM_BITS = [ 'POSITION', 'ROTATION', 'SCALE' ];

/** Extension entries loaded from the user-provided plugins json ([label, functionName]). */
export const extensionMenus = {
    node: [] as Array<[ string, string ]>,
    component: [] as Array<[ string, string ]>,
};

export function showAppMenu(): void {
    const setting = context.settingApp;
    const v = context.vueApp;
    const entries: MenuEntry[] = [
        { label: 'Toggle Mini Mode', action: () => setting.toggleSimpleMode() },
        { type: 'separator' },
        { label: 'Rotate Portrait/Landscape', action: () => setting.togglePortrait() },
        { label: 'Custom Resolution', action: () => { v.showResolutionSelector = !v.showResolutionSelector; } },
        {
            label: 'Open DevTools',
            action: () => {
                if ( !setting.showDevToolInTab ) v.openWvDevTool();
                else {
                    if ( setting.simpleMode ) setting.toggleSimpleMode();
                    v.tab = 1;
                }
            },
        },
        { type: 'separator' },
        { label: 'Help', action: () => v.showHelp() },
        { label: 'Setting', action: () => v.showSetting() },
        { type: 'separator' },
        { label: 'Open App DevTools', action: () => ipcRenderer.invoke( IpcInvoke.openAppDevtools ) },
    ];
    popupMenu( entries );
}

export function showNodeMenu( nodeId: string ): void {
    context.menuNodeId = nodeId;
    const v = context.vueApp;
    const entries: MenuEntry[] = [
        { label: 'Remove', action: () => execInGame( `__removeNode('${ nodeId }')` ) },
        { type: 'separator' },
        { label: 'Copy uuid', action: () => copyToClipboard( nodeId ) },
        { label: 'Print Path', action: () => execInGame( `__printPath('${ nodeId }')` ) },
        { label: 'Store in Global', action: () => execInGame( `__storeInGlobal('${ nodeId }')` ) },
        { label: 'Lock/Unlock Drag', action: () => v.toggleDrag( nodeId ) },
        { label: 'Toggle Auto Update Node', action: () => execInGame( `__donotAutoUpdate('${ nodeId }')` ) },
        { type: 'separator' },
        {
            label: 'Break On',
            submenuEntries: [
                {
                    label: 'transform-changed',
                    submenuEntries: TRANSFORM_BITS.map( ( bit ) => ( {
                        label: bit,
                        action: () => execInGame( `__setBreakPoint('${ nodeId }', 'transform-changed', '${ bit }')` ),
                    } ) ),
                },
                ...NODE_BREAK_EVENTS.map( ( eventName ) => ( {
                    label: eventName,
                    action: () => execInGame( `__setBreakPoint('${ nodeId }', '${ eventName }')` ),
                } ) ),
            ],
        },
        { label: 'Remove Break Points', action: () => execInGame( `__removeBreakPoint('${ nodeId }')` ) },
        { label: 'Remove All Break Points', action: () => execInGame( '__removeAllBreakPoint()' ) },
        { type: 'separator' },
        { label: 'Select in Editor', action: () => focusNodeInEditor( nodeId ) },
    ];
    for ( const [ label, functionName ] of extensionMenus.node ) {
        entries.push( { label, action: () => execInGame( `${ functionName }(__nd['${ nodeId }'])` ) } );
    }
    popupMenu( entries );
}

export function showComponentMenu( compId: string, compName: string, methodNames: string[], execMethod: ( name: string ) => void ): void {
    context.menuCompId = compId;
    context.menuCompName = compName;
    const v = context.vueApp;
    const setting = context.settingApp;
    const entries: MenuEntry[] = [
        { label: 'Remove', action: () => execInGame( `__removeComp('${ v.selectedNode }','${ compId }')` ) },
        { label: 'Store in Global', action: () => execInGame( `__storeCompInGlobal('${ v.selectedNode }','${ compId }')` ) },
        { label: 'Fields Sort', action: () => setting.toggleSortComp( compName ) },
    ];
    for ( const [ label, functionName ] of extensionMenus.component ) {
        entries.push( { label, action: () => execInGame( `${ functionName }(__getComp('${ v.selectedNode }','${ compId }'))` ) } );
    }
    if ( methodNames.length > 0 ) {
        entries.push( { type: 'separator' } );
        for ( const methodName of methodNames ) {
            entries.push( { label: `${ methodName }()`, action: () => execMethod( methodName ) } );
        }
    }
    popupMenu( entries );
}

export function showTreeMenu(): void {
    const v = context.vueApp;
    popupMenu( [
        { label: 'Toggle Draw Call (beta)', action: () => execInGame( '__toggleDC()' ) },
        { label: 'Toggle Root Node of 3D Node', action: () => { v.hide3dRootNode = !v.hide3dRootNode; } },
        { label: 'Toggle Children Count', action: () => { v.showChildrenCount = !v.showChildrenCount; } },
    ] );
}

export function showConsoleMenu(): void {
    const v = context.vueApp;
    popupMenu( [ { label: 'Clear Logs', action: () => { v.logs = []; } } ] );
}
