// Engine-version compatibility helpers for Cocos Creator 1.x - 3.8+.

/** true when the engine is Cocos Creator >= 3.4 (input/system API differences). */
export function isEngine3_4OrNewer(): boolean {
    const parts = String( cc.ENGINE_VERSION ).split( '.' );
    return Number( parts[ 0 ] ) >= 3 && Number( parts[ 1 ] ) >= 4;
}

/** A component whose scheduler survives scene switches; used for scheduleOnce debouncing. */
export function getSchedule(): any {
    return cc.ENGINE_VERSION.startsWith( '3.' )
        ? cc.director.getScene()?.getComponentInChildren( cc.Camera )
        : cc.Canvas.instance;
}

/**
 * Applies legacy alias adjustments the probe relies on.
 *
 * - Creator 3.x renamed classes; the probe uses the "Component"-suffixed legacy aliases, and
 *   3.x pages keep them - but 3.6+ repointed cc.RenderableComponent to the 3D-only
 *   ModelRenderer, so 2D UI nodes (Sprite/Label = UIRenderer) never match getComponent().
 *   The page-global cc is cclegacy (no cc.Renderer/cc.UIRenderer), so the real classes are
 *   resolved through the class registry / Sprite prototype chain, then the alias is retargeted
 *   to Renderer - the common base of UIRenderer and ModelRenderer.
 */
export function applyEngineAliases(): void {
    if ( !cc.ENGINE_VERSION.startsWith( '3.' ) ) return;
    cc.Sprite = cc.SpriteComponent;
    cc.Label = cc.LabelComponent;
    cc.Widget = cc.WidgetComponent;
    cc.Layout = cc.LayoutComponent;
    try {
        if ( !cc.RenderableComponent ) return;
        const byName = ( name: string ): any => ( cc.js.getClassByName ? cc.js.getClassByName( name ) : null );
        const uiRenderer = byName( 'cc.UIRenderer' ) || byName( 'cc.Renderable2D' )
            || ( cc.Sprite && Object.getPrototypeOf( cc.Sprite.prototype ).constructor );
        if ( !uiRenderer || uiRenderer.prototype instanceof cc.RenderableComponent ) return;
        const commonBase = byName( 'cc.Renderer' ) || Object.getPrototypeOf( uiRenderer.prototype ).constructor;
        if ( commonBase && uiRenderer.prototype instanceof commonBase && cc.RenderableComponent.prototype instanceof commonBase ) {
            cc.RenderableComponent = commonBase;
        }
    } catch ( error ) {
        console.warn( 'cocos-inspector renderable shim failed', error );
    }
}
