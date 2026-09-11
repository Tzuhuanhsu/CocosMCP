// Selection rectangle drawn over the game with a Graphics node ("INSPECTOR-NODE").
import { nodesById } from './state';
import { isEngine3_4OrNewer } from './engine-compat';

const RECT_COLOR = '#35b0fd';
const GRAPHICS_NODE_NAME = 'INSPECTOR-NODE';
const PHYSICS_DEBUG_NODE_NAME = 'PHYSICS_2D_DEBUG_DRAW';
const TINY_NODE_SIZE = 4;

let graphics: any = null;
let scratchVec: any = null;

export function clearRect(): void {
    if ( graphics && graphics.node ) graphics.clear();
}

function ensureGraphics( canvasNode: any ): void {
    if ( !graphics || !graphics.node ) {
        const node = new cc.Node( GRAPHICS_NODE_NAME );
        node.layer = cc.Layers.Enum.UI_2D;
        graphics = node.addComponent( cc.GraphicsComponent );
        const transform = node.getComponent( cc.UITransformComponent );
        transform.setContentSize( cc.Size.ZERO );
        graphics.strokeColor = cc.Color.WHITE.clone().fromHEX( RECT_COLOR );
    }
    if ( !graphics.node.parent ) canvasNode.addChild( graphics.node );
    graphics?.node?.setPosition( cc.Vec3.ZERO );
    // stay topmost, but below the physics debug overlay when it exists
    let fromEnd = 1;
    if ( graphics.node.parent.children.slice( -1 )[ 0 ]?.name === PHYSICS_DEBUG_NODE_NAME ) fromEnd = 2;
    graphics.node.setSiblingIndex( ( graphics.node.parent.children.length - fromEnd ) || 0 );
}

function firstCamera(): any {
    return cc.director.getScene().getComponentsInChildren( cc.Camera ).find( ( camera: any ) => camera );
}

/** Draws the wireframe of a 3D model's bounds (nodes without UITransform). */
function drawModelBounds( node: any, renderable: any ): void {
    const bounds = renderable.model.modelBounds;
    const min = cc.v3();
    const max = cc.v3();
    bounds.getBoundary( min, max );
    let bottomRing = [
        min,
        min.clone().add( cc.v3( 0, 0, bounds.halfExtents.z * 2 ) ),
        max.clone().add( cc.v3( 0, -bounds.halfExtents.y * 2, 0 ) ),
        min.clone().add( cc.v3( bounds.halfExtents.x * 2, 0, 0 ) ),
    ];
    let topRing = [
        min.clone().add( cc.v3( 0, bounds.halfExtents.y * 2, 0 ) ),
        max.clone().add( cc.v3( -bounds.halfExtents.x * 2, 0, 0 ) ),
        max,
        max.clone().add( cc.v3( 0, 0, -bounds.halfExtents.z * 2 ) ),
    ];
    const worldMatrix = node.worldMatrix;
    const camera = firstCamera();
    bottomRing = bottomRing.map( ( point ) => camera.convertToUINode( point.transformMat4( worldMatrix ), graphics.node ) );
    topRing = topRing.map( ( point ) => camera.convertToUINode( point.transformMat4( worldMatrix ), graphics.node ) );
    graphics.clear();
    graphics.lineWidth = 4;
    const originalColor = graphics.strokeColor.clone();
    graphics.strokeColor._set_a_unsafe( 180 );
    bottomRing.forEach( ( point, index ) => {
        if ( index === 0 ) graphics.moveTo( point.x, point.y );
        else graphics.lineTo( point.x, point.y );
    } );
    graphics.lineTo( bottomRing[ 0 ].x, bottomRing[ 0 ].y );
    topRing.forEach( ( point, index ) => {
        if ( index === 0 ) graphics.moveTo( point.x, point.y );
        else graphics.lineTo( point.x, point.y );
    } );
    graphics.lineTo( topRing[ 0 ].x, topRing[ 0 ].y );
    topRing.forEach( ( point, index ) => {
        const below = bottomRing[ index ];
        graphics.moveTo( point.x, point.y );
        graphics.lineTo( below.x, below.y );
    } );
    graphics.stroke();
    graphics.strokeColor = originalColor;
}

/** Fallback for models exposing only worldBounds: draw its diagonal. */
function drawWorldBoundsDiagonal( renderable: any ): void {
    const bounds = renderable.model.worldBounds;
    const min = cc.v3();
    const max = cc.v3();
    bounds.getBoundary( min, max );
    const camera = firstCamera();
    camera.convertToUINode( min, graphics.node, min );
    camera.convertToUINode( max, graphics.node, max );
    graphics.clear();
    graphics.lineWidth = 4;
    const originalColor = graphics.strokeColor.clone();
    graphics.strokeColor._set_a_unsafe( 200 );
    graphics.moveTo( min.x, min.y );
    graphics.lineTo( max.x, max.y );
    graphics.stroke();
    graphics.strokeColor = originalColor;
}

export function drawRect( nodeId: string ): void {
    if ( !( window as any ).cc ) return;
    if ( !cc.director.getScene() ) return;
    let canvasNode = cc.director.getScene().getComponentInChildren( cc.CanvasComponent )?.node;
    if ( !canvasNode ) {
        const scene = cc.director.getScene();
        canvasNode = new cc.Node();
        canvasNode.addComponent( cc.CanvasComponent );
        scene.addChild( canvasNode );
    }
    if ( !scratchVec ) scratchVec = cc.v3();
    if ( !cc.director.getScene() ) return;
    ensureGraphics( canvasNode );

    const node = nodesById[ nodeId ];
    if ( !node || !node.isValid ) return;
    node.getWorldPosition( scratchVec );
    scratchVec.subtract( canvasNode.position );

    const transform = node.getComponent( cc.UITransformComponent );
    let width = 0;
    let height = 0;
    let anchorX = 0.5;
    let anchorY = 0.5;
    if ( transform ) {
        width = transform.width;
        height = transform.height;
        anchorX = transform.anchorX;
        anchorY = transform.anchorY;
    } else {
        const renderable = node.getComponent( cc.RenderableComponent );
        if ( renderable && renderable.model?.modelBounds ) {
            drawModelBounds( node, renderable );
        } else if ( renderable && renderable.model?.worldBounds ) {
            drawWorldBoundsDiagonal( renderable );
        }
        return;
    }

    scratchVec.multiplyScalar( 0 );
    if ( anchorX !== 0.5 ) scratchVec.x += width * ( 0.5 - anchorX );
    if ( anchorY !== 0.5 ) scratchVec.y += height * ( 0.5 - anchorY );
    const originalColor = graphics.strokeColor.clone();
    graphics.clear();
    graphics.lineWidth = isEngine3_4OrNewer() ? 4 : ( cc.view.isRetinaEnabled() ? 3 : 5 );
    const canvasTransform = canvasNode.getComponent( cc.UITransformComponent );
    if ( width < TINY_NODE_SIZE || height < TINY_NODE_SIZE ) {
        // node is too small for a rectangle - mark it with concentric circles instead
        transform.convertToWorldSpaceAR( scratchVec, scratchVec );
        scratchVec.subtract( cc.v3( canvasTransform.width / 2, canvasTransform.height / 2 ) );
        graphics.strokeColor = cc.Color.BLACK;
        graphics.circle( scratchVec.x, scratchVec.y, 13 );
        graphics.stroke();
        graphics.strokeColor = originalColor;
        graphics.circle( scratchVec.x, scratchVec.y, 10 );
    } else {
        const corners = [
            cc.v3( scratchVec.x - width / 2, scratchVec.y - height / 2 ),
            cc.v3( scratchVec.x + width / 2, scratchVec.y - height / 2 ),
            cc.v3( scratchVec.x + width / 2, scratchVec.y + height / 2 ),
            cc.v3( scratchVec.x - width / 2, scratchVec.y + height / 2 ),
        ];
        corners.forEach( ( corner ) => {
            transform.convertToWorldSpaceAR( corner, corner );
            corner.subtract( cc.v3( canvasTransform.width / 2, canvasTransform.height / 2 ) );
        } );
        const first = corners.shift();
        corners.push( first );
        graphics.moveTo( first.x, first.y );
        // black shadow pass first, then the highlight color
        graphics.strokeColor = cc.Color.BLACK;
        corners.forEach( ( corner ) => graphics.lineTo( corner.x + 1, corner.y - 1 ) );
        graphics.stroke();
        graphics.strokeColor = originalColor;
        corners.forEach( ( corner ) => graphics.lineTo( corner.x, corner.y ) );
    }
    graphics.stroke();
}
