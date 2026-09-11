// Shared renderer context: late-bound references used across components and menus.
// `vueApp` / `settingApp` are also exposed on window because (a) the extension main process
// drives them through executeJavaScript ("v.switchMode(0)", "setting.configDataForMain") and
// (b) Vue templates compiled from strings resolve bare identifiers via the global scope.

export const context = {
    /** the game webview element */
    wv: null as HTMLWebViewElement | null,
    /** the devtools webview element */
    dwv: null as HTMLWebViewElement | null,
    /** main Vue instance (window.v) */
    vueApp: null as any,
    /** settings Vue instance (window.setting) */
    settingApp: null as any,
    /** node uuid the last tree context menu was opened on */
    menuNodeId: '',
    /** component uuid / display name the last component menu was opened on */
    menuCompId: '',
    menuCompName: '',
};

/** Runs a script inside the game page (the injected probe exposes the __ globals). */
export function execInGame( code: string ): Promise<any> {
    if ( !context.wv ) return Promise.resolve( undefined );
    return context.wv.executeJavaScript( code );
}
