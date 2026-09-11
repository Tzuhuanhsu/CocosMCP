"use strict";
(() => {
  // src/injected/state.ts
  var w = window;
  var nodesById = w.__nd = w.__nd ?? {};
  var flags = {
    get hover() {
      return w.__hover ?? 0;
    },
    set hover(value) {
      w.__hover = value;
    },
    get designMode() {
      return Boolean(w.__designMode);
    },
    set designMode(value) {
      w.__designMode = value;
    },
    get lockDragNode() {
      return w.__lockDragNode ?? null;
    },
    set lockDragNode(value) {
      w.__lockDragNode = value;
    },
    get autoUpdateTree() {
      return w.__autoUpdateTree ?? true;
    },
    get syncNodeDetail() {
      return Boolean(w.__syncNodeDetail);
    },
    get logCount() {
      return Number(w.__logCount ?? 0);
    },
    get showDevToolInTab() {
      return Boolean(w.__showDevToolInTab);
    },
    get statistic() {
      return Boolean(w.__statistic);
    },
    set statistic(value) {
      w.__statistic = value;
    }
  };
  var breakPoints = {};
  var openedNodes = {};
  var donotAutoUpdates = {};
  var nodeLogs = [];
  var treeState = {
    /** serialize every node once on the next tree pass (ignores openedNodes gating) */
    checkAllOneTime: false,
    /** DrawCall analysis mode */
    dcMode: false,
    lastAtlasId: null,
    lastTreeTime: 0,
    /** suppress one node-detail sync echo after the inspector itself wrote a value */
    stopSyncDetailOneTime: false
  };
  var detailState = {
    lastDetailNode: null,
    pendingDetailFun: null,
    /** fgui GComponent instance used to filter base-class keys out of $gobj serialization */
    fcom: null
  };
  var hoverState = {
    lastHoverNode: null,
    lastDesignNode: null,
    ray: null,
    /** true while a mouse button is held during a design-mode drag (CC 3.4+ mouse path) */
    dragging: false
  };

  // src/injected/engine-compat.ts
  function isEngine3_4OrNewer() {
    const parts = String(cc.ENGINE_VERSION).split(".");
    return Number(parts[0]) >= 3 && Number(parts[1]) >= 4;
  }
  function getSchedule() {
    var _a;
    return cc.ENGINE_VERSION.startsWith("3.") ? (_a = cc.director.getScene()) == null ? void 0 : _a.getComponentInChildren(cc.Camera) : cc.Canvas.instance;
  }
  function applyEngineAliases() {
    if (!cc.ENGINE_VERSION.startsWith("3.")) return;
    cc.Sprite = cc.SpriteComponent;
    cc.Label = cc.LabelComponent;
    cc.Widget = cc.WidgetComponent;
    cc.Layout = cc.LayoutComponent;
    try {
      if (!cc.RenderableComponent) return;
      const byName = (name) => cc.js.getClassByName ? cc.js.getClassByName(name) : null;
      const uiRenderer = byName("cc.UIRenderer") || byName("cc.Renderable2D") || cc.Sprite && Object.getPrototypeOf(cc.Sprite.prototype).constructor;
      if (!uiRenderer || uiRenderer.prototype instanceof cc.RenderableComponent) return;
      const commonBase = byName("cc.Renderer") || Object.getPrototypeOf(uiRenderer.prototype).constructor;
      if (commonBase && uiRenderer.prototype instanceof commonBase && cc.RenderableComponent.prototype instanceof commonBase) {
        cc.RenderableComponent = commonBase;
      }
    } catch (error) {
      console.warn("cocos-inspector renderable shim failed", error);
    }
  }

  // src/injected/draw-rect.ts
  var RECT_COLOR = "#35b0fd";
  var GRAPHICS_NODE_NAME = "INSPECTOR-NODE";
  var PHYSICS_DEBUG_NODE_NAME = "PHYSICS_2D_DEBUG_DRAW";
  var TINY_NODE_SIZE = 4;
  var graphics = null;
  var scratchVec = null;
  function clearRect() {
    if (graphics && graphics.node) graphics.clear();
  }
  function ensureGraphics(canvasNode) {
    var _a, _b;
    if (!graphics || !graphics.node) {
      const node = new cc.Node(GRAPHICS_NODE_NAME);
      node.layer = cc.Layers.Enum.UI_2D;
      graphics = node.addComponent(cc.GraphicsComponent);
      const transform = node.getComponent(cc.UITransformComponent);
      transform.setContentSize(cc.Size.ZERO);
      graphics.strokeColor = cc.Color.WHITE.clone().fromHEX(RECT_COLOR);
    }
    if (!graphics.node.parent) canvasNode.addChild(graphics.node);
    (_a = graphics == null ? void 0 : graphics.node) == null ? void 0 : _a.setPosition(cc.Vec3.ZERO);
    let fromEnd = 1;
    if (((_b = graphics.node.parent.children.slice(-1)[0]) == null ? void 0 : _b.name) === PHYSICS_DEBUG_NODE_NAME) fromEnd = 2;
    graphics.node.setSiblingIndex(graphics.node.parent.children.length - fromEnd || 0);
  }
  function firstCamera() {
    return cc.director.getScene().getComponentsInChildren(cc.Camera).find((camera) => camera);
  }
  function drawModelBounds(node, renderable) {
    const bounds = renderable.model.modelBounds;
    const min = cc.v3();
    const max = cc.v3();
    bounds.getBoundary(min, max);
    let bottomRing = [
      min,
      min.clone().add(cc.v3(0, 0, bounds.halfExtents.z * 2)),
      max.clone().add(cc.v3(0, -bounds.halfExtents.y * 2, 0)),
      min.clone().add(cc.v3(bounds.halfExtents.x * 2, 0, 0))
    ];
    let topRing = [
      min.clone().add(cc.v3(0, bounds.halfExtents.y * 2, 0)),
      max.clone().add(cc.v3(-bounds.halfExtents.x * 2, 0, 0)),
      max,
      max.clone().add(cc.v3(0, 0, -bounds.halfExtents.z * 2))
    ];
    const worldMatrix = node.worldMatrix;
    const camera = firstCamera();
    bottomRing = bottomRing.map((point) => camera.convertToUINode(point.transformMat4(worldMatrix), graphics.node));
    topRing = topRing.map((point) => camera.convertToUINode(point.transformMat4(worldMatrix), graphics.node));
    graphics.clear();
    graphics.lineWidth = 4;
    const originalColor = graphics.strokeColor.clone();
    graphics.strokeColor._set_a_unsafe(180);
    bottomRing.forEach((point, index) => {
      if (index === 0) graphics.moveTo(point.x, point.y);
      else graphics.lineTo(point.x, point.y);
    });
    graphics.lineTo(bottomRing[0].x, bottomRing[0].y);
    topRing.forEach((point, index) => {
      if (index === 0) graphics.moveTo(point.x, point.y);
      else graphics.lineTo(point.x, point.y);
    });
    graphics.lineTo(topRing[0].x, topRing[0].y);
    topRing.forEach((point, index) => {
      const below = bottomRing[index];
      graphics.moveTo(point.x, point.y);
      graphics.lineTo(below.x, below.y);
    });
    graphics.stroke();
    graphics.strokeColor = originalColor;
  }
  function drawWorldBoundsDiagonal(renderable) {
    const bounds = renderable.model.worldBounds;
    const min = cc.v3();
    const max = cc.v3();
    bounds.getBoundary(min, max);
    const camera = firstCamera();
    camera.convertToUINode(min, graphics.node, min);
    camera.convertToUINode(max, graphics.node, max);
    graphics.clear();
    graphics.lineWidth = 4;
    const originalColor = graphics.strokeColor.clone();
    graphics.strokeColor._set_a_unsafe(200);
    graphics.moveTo(min.x, min.y);
    graphics.lineTo(max.x, max.y);
    graphics.stroke();
    graphics.strokeColor = originalColor;
  }
  function drawRect(nodeId) {
    var _a, _b, _c;
    if (!window.cc) return;
    if (!cc.director.getScene()) return;
    let canvasNode = (_a = cc.director.getScene().getComponentInChildren(cc.CanvasComponent)) == null ? void 0 : _a.node;
    if (!canvasNode) {
      const scene = cc.director.getScene();
      canvasNode = new cc.Node();
      canvasNode.addComponent(cc.CanvasComponent);
      scene.addChild(canvasNode);
    }
    if (!scratchVec) scratchVec = cc.v3();
    if (!cc.director.getScene()) return;
    ensureGraphics(canvasNode);
    const node = nodesById[nodeId];
    if (!node || !node.isValid) return;
    node.getWorldPosition(scratchVec);
    scratchVec.subtract(canvasNode.position);
    const transform = node.getComponent(cc.UITransformComponent);
    let width = 0;
    let height = 0;
    let anchorX = 0.5;
    let anchorY = 0.5;
    if (transform) {
      width = transform.width;
      height = transform.height;
      anchorX = transform.anchorX;
      anchorY = transform.anchorY;
    } else {
      const renderable = node.getComponent(cc.RenderableComponent);
      if (renderable && ((_b = renderable.model) == null ? void 0 : _b.modelBounds)) {
        drawModelBounds(node, renderable);
      } else if (renderable && ((_c = renderable.model) == null ? void 0 : _c.worldBounds)) {
        drawWorldBoundsDiagonal(renderable);
      }
      return;
    }
    scratchVec.multiplyScalar(0);
    if (anchorX !== 0.5) scratchVec.x += width * (0.5 - anchorX);
    if (anchorY !== 0.5) scratchVec.y += height * (0.5 - anchorY);
    const originalColor = graphics.strokeColor.clone();
    graphics.clear();
    graphics.lineWidth = isEngine3_4OrNewer() ? 4 : cc.view.isRetinaEnabled() ? 3 : 5;
    const canvasTransform = canvasNode.getComponent(cc.UITransformComponent);
    if (width < TINY_NODE_SIZE || height < TINY_NODE_SIZE) {
      transform.convertToWorldSpaceAR(scratchVec, scratchVec);
      scratchVec.subtract(cc.v3(canvasTransform.width / 2, canvasTransform.height / 2));
      graphics.strokeColor = cc.Color.BLACK;
      graphics.circle(scratchVec.x, scratchVec.y, 13);
      graphics.stroke();
      graphics.strokeColor = originalColor;
      graphics.circle(scratchVec.x, scratchVec.y, 10);
    } else {
      const corners = [
        cc.v3(scratchVec.x - width / 2, scratchVec.y - height / 2),
        cc.v3(scratchVec.x + width / 2, scratchVec.y - height / 2),
        cc.v3(scratchVec.x + width / 2, scratchVec.y + height / 2),
        cc.v3(scratchVec.x - width / 2, scratchVec.y + height / 2)
      ];
      corners.forEach((corner) => {
        transform.convertToWorldSpaceAR(corner, corner);
        corner.subtract(cc.v3(canvasTransform.width / 2, canvasTransform.height / 2));
      });
      const first = corners.shift();
      corners.push(first);
      graphics.moveTo(first.x, first.y);
      graphics.strokeColor = cc.Color.BLACK;
      corners.forEach((corner) => graphics.lineTo(corner.x + 1, corner.y - 1));
      graphics.stroke();
      graphics.strokeColor = originalColor;
      corners.forEach((corner) => graphics.lineTo(corner.x, corner.y));
    }
    graphics.stroke();
  }

  // src/injected/node-path.ts
  function getPath(node) {
    const names = [node.name];
    const uuids = [node.uuid];
    while (node.parent && !(node.parent instanceof cc.Scene)) {
      names.push(node.parent.name);
      uuids.push(node.parent.uuid);
      node = node.parent;
    }
    return { path: names.reverse().join("/"), uuidPath: uuids.reverse() };
  }
  function getPathById(nodeId) {
    const node = nodesById[nodeId];
    return node ? getPath(node).path : "";
  }
  function getUuidPathByPath(scenePath) {
    const node = cc.find(scenePath);
    return node ? getPath(node).uuidPath : [];
  }
  function printPath(nodeId) {
    console.log(getPathById(nodeId));
  }
  function storeInGlobal(nodeId) {
    const node = nodesById[nodeId];
    if (node) {
      window.temp1 = node;
      console.log(`node: ${node.name}, store in temp1 already!`);
    }
  }
  function getComp(nodeId, compUuid) {
    const node = nodesById[nodeId];
    if (!node) return null;
    return node._components.filter((comp) => comp.uuid === compUuid)[0];
  }
  function storeCompInGlobal(nodeId, compUuid) {
    const comp = getComp(nodeId, compUuid);
    if (comp) {
      window.comp1 = comp;
      console.log(`component: ${comp.name}, store in comp1 already!`);
    }
  }
  function searchComs(keyword) {
    keyword = keyword.toLowerCase();
    let comps = cc.director.getScene().getComponentsInChildren(cc.Component);
    comps = comps.filter((comp) => cc.js.getClassName(comp).toLowerCase().includes(keyword));
    return comps.map((comp) => {
      const { uuid } = comp;
      const name = cc.js.getClassName(comp);
      const visible = comp.node.activeInHierarchy && (!comp.getComponent("cc.UIOpacity") || comp.getComponent("cc.UIOpacity").opacity > 0);
      const { path, uuidPath } = getPath(comp.node);
      return { name, uuid, visible, path, uuidPath };
    });
  }

  // src/injected/hover.ts
  var HoverMode = { OFF: 0, PICK_2D: 1, PICK_3D: 2 };
  function toggleDesignMode(enabled) {
    flags.designMode = enabled;
    checkHover();
    if (!enabled) clearRect();
  }
  function setHover(mode) {
    flags.hover = mode;
    checkHover();
    if (!mode) clearRect();
  }
  function checkHover() {
    const scene = cc.director.getScene();
    const canvases = ((scene == null ? void 0 : scene.getComponentsInChildren(cc.CanvasComponent)) ?? []).map((canvas) => canvas.node);
    if (!isEngine3_4OrNewer()) unregisterHover(scene);
    canvases.forEach(unregisterHover);
    if (flags.hover || flags.designMode) {
      if (!isEngine3_4OrNewer()) registerHover(scene);
      canvases.forEach(registerHover);
    }
    treeState.checkAllOneTime = true;
    readyUpdateTree();
  }
  function registerHover(target) {
    if (!target) return;
    const et = getEventTypes();
    target.on(et.TOUCH_CANCEL, onDesignTouch, null, true);
    target.on(et.TOUCH_MOVE, onDesignTouch, null, true);
    target.on(et.TOUCH_START, onDesignTouch, null, true);
    target.on(et.TOUCH_END, onPickCommit, null, true);
    target.on(et.MOUSE_DOWN, onMouseDown, null, true);
    target.on(et.MOUSE_MOVE, onMouseMove, null, true);
    target.on(et.MOUSE_UP, onMouseUp, null, true);
  }
  function unregisterHover(target) {
    if (!target) return;
    const et = getEventTypes();
    target.off(et.TOUCH_CANCEL, onDesignTouch, null, true);
    target.off(et.TOUCH_MOVE, onDesignTouch, null, true);
    target.off(et.TOUCH_START, onDesignTouch, null, true);
    target.off(et.TOUCH_END, onPickCommit, null, true);
    target.off(et.MOUSE_DOWN, onMouseDown, null, true);
    target.off(et.MOUSE_MOVE, onMouseMove, null, true);
    target.off(et.MOUSE_UP, onMouseUp, null, true);
  }
  function uiDelta(event) {
    if (typeof event.getUIDelta === "function") return event.getUIDelta();
    if (typeof event.getDelta === "function") return event.getDelta();
    return { x: 0, y: 0 };
  }
  function onMouseDown(event) {
    if (!flags.designMode) return;
    beginDesignDrag();
    hoverState.dragging = true;
    event.propagationStopped = true;
    event.propagationImmediateStopped = true;
  }
  function onMouseUp(event) {
    hoverState.dragging = false;
    onPickCommit(event);
  }
  function onHoverNode(event) {
    if (event.type === cc.Node.EventType.MOUSE_LEAVE) {
      clearRect();
      hoverState.lastHoverNode = null;
      return;
    }
    if (flags.hover === HoverMode.PICK_2D || flags.designMode) {
      if (flags.designMode && hoverState.lastDesignNode) return;
      let node = event.target;
      if (flags.designMode) node = nodesById[flags.lockDragNode] || node;
      drawRect(node.uuid);
      hoverState.lastHoverNode = node;
      event.propagationStopped = true;
      event.propagationImmediateStopped = true;
    }
  }
  function onMouseMove(event) {
    if (flags.designMode && hoverState.dragging) {
      const node = hoverState.lastDesignNode;
      if (!(node == null ? void 0 : node.isValid)) return;
      const delta = uiDelta(event);
      const position = node.position;
      if (!position) return;
      position.add3f(delta.x, delta.y, 0);
      node.setPosition(position);
      event.propagationStopped = true;
      event.propagationImmediateStopped = true;
      return;
    }
    if (flags.hover !== HoverMode.PICK_3D) return;
    if (!hoverState.ray) hoverState.ray = new cc.geometry.Ray();
    const camera = cc.director.getScene().getComponentInChildren(cc.CameraComponent);
    const location2 = event.getLocation();
    camera.screenPointToRay(location2.x, location2.y, hoverState.ray);
    const hit = cc.director.getScene().getComponentsInChildren(cc.ModelComponent || "cc.MeshRenderer").filter((model) => model.model && model.node.activeInHierarchy).map((model) => [model, cc.geometry.intersect.rayModel(hoverState.ray, model.model)]).filter((entry) => entry[1] > 0).sort((a, b) => a[1] - b[1])[0];
    if (hit) {
      hoverState.lastHoverNode = hit[0].node;
      drawRect(hoverState.lastHoverNode.uuid);
    }
  }
  function onPickCommit(event) {
    if (!flags.hover && !flags.designMode) return;
    if (flags.hover && hoverState.lastHoverNode) {
      const { uuidPath } = getPath(hoverState.lastHoverNode);
      locateNode(uuidPath);
    }
    if (flags.designMode && hoverState.lastDesignNode) {
      const { uuidPath } = getPath(hoverState.lastDesignNode);
      locateNode(uuidPath);
      drawRect(hoverState.lastDesignNode.uuid);
      hoverState.lastDesignNode = null;
    }
    if (event) {
      event.propagationStopped = true;
      event.propagationImmediateStopped = true;
    }
  }
  function beginDesignDrag() {
    var _a;
    hoverState.lastDesignNode = hoverState.lastHoverNode;
    const node = hoverState.lastDesignNode;
    if (node && node.isValid) {
      const parentLayout = (_a = node.parent) == null ? void 0 : _a.getComponent(cc.LayoutComponent);
      if (parentLayout) parentLayout.enabled = false;
      const widget = node.getComponent(cc.WidgetComponent);
      if (widget) widget.enabled = false;
    }
  }
  function onDesignTouch(event) {
    var _a, _b, _c;
    if (!flags.hover && !flags.designMode) return;
    event.propagationStopped = true;
    event.propagationImmediateStopped = true;
    if (!flags.designMode) return;
    const et = getEventTypes();
    switch (event.type) {
      case et.TOUCH_START:
        beginDesignDrag();
        break;
      case et.TOUCH_MOVE: {
        if (!((_a = hoverState.lastDesignNode) == null ? void 0 : _a.isValid)) return;
        const delta = uiDelta(event);
        const position = (_b = hoverState.lastDesignNode) == null ? void 0 : _b.position;
        if (!position) break;
        position.add3f(delta.x, delta.y, 0);
        (_c = hoverState.lastDesignNode) == null ? void 0 : _c.setPosition(position);
        break;
      }
      case et.TOUCH_CANCEL:
        onPickCommit(void 0);
        break;
    }
  }

  // src/injected/node-detail.ts
  var BUILD_FILTER = {
    _prefab: "",
    _visFlags: "",
    _editorExtras__: "",
    __prefab: "",
    _name: "",
    _objFlags: "",
    _scriptAsset: ""
  };
  function getComponentMethodNames(comp) {
    const keys = Object.keys(comp.__proto__);
    return keys.filter((key) => {
      if (key in cc.RenderableComponent.prototype || key.startsWith("_") || key.startsWith("get")) return false;
      const value = comp[key];
      return typeof value === "function" && value.length === 0 && value.name !== "warn";
    });
  }
  function serializeComponent(comp) {
    const out = {};
    const propNames = comp instanceof cc.Component ? comp.constructor.__props__ : Object.keys(comp);
    for (let propName of propNames) {
      const originalName = propName;
      if (comp instanceof cc.Component) {
        if (CC_PREVIEW && propName.startsWith("_")) continue;
        if (propName.startsWith("_") && comp[propName] === comp[propName.slice(1)]) {
          propName = propName.slice(1);
        }
        out.isCC_COM = true;
      } else {
        out.isCC_COM = false;
      }
      if (CC_BUILD && propName in BUILD_FILTER) continue;
      if (!(propName in { name: "", uuid: "", enabled: "" }) && propName in cc.Component.prototype) continue;
      let value = comp[propName];
      if (value === null) value = "null";
      if (value === void 0) value = "undefined";
      const valueType = typeof value;
      if (valueType !== "function" && valueType !== "object") {
        const attrs = comp.constructor.__attrs__;
        const isEnum = attrs && (attrs[`${propName}$_$type`] === "Enum" || attrs[`${originalName}$_$type`] === "Enum");
        if (isEnum) {
          const enumList = attrs[`${propName}$_$enumList`] || attrs[`${originalName}$_$enumList`];
          out[propName] = [enumList.find((entry) => entry.value === value), "enum", enumList];
        } else {
          out[propName] = [value, valueType];
        }
      } else {
        if (value instanceof cc.Component) {
          if (!value.node) out[propName] = `${cc.js.getClassName(value)}:@${value.uuid}`;
          const { uuidPath } = getPath(value.node);
          out[propName] = `${cc.js.getClassName(value)}:@${value.node ? value.node.name : value.node}|${uuidPath.join("//")}`;
        } else if (value instanceof cc.Asset) {
          out[propName] = `${cc.js.getClassName(value).slice(3)}:@${value.name}||${value._uuid}`;
        } else if (value instanceof cc.Color) {
          out[propName] = `#${value.toHEX("#rrggbb")}`;
        } else if (value instanceof cc.ValueType) {
          out[propName] = `${value.constructor.name}:${value.toString()}`;
        } else if (value.constructor === cc.Node) {
          const { uuidPath } = getPath(value);
          if (propName !== "node") out[propName] = `Node:@${value.name}|${uuidPath.join("//")}`;
        } else if (!(value instanceof Function)) {
          if (window.fgui && value instanceof fgui.GObject) {
            const { uuidPath } = getPath(value.node);
            if (propName !== "node") out[propName] = `Node:@${getGobjName(value)}|${uuidPath.join("//")}`;
          } else {
            out[propName] = `$${value.constructor ? value.constructor.name : "object"}`;
          }
        }
        out[propName] = [out[propName], value instanceof cc.Color ? "color" : "object"];
      }
    }
    pruneIrrelevantProps(comp, out);
    out.name = comp.name;
    out.uuid = comp.uuid;
    out.enabled = comp.enabled;
    try {
      out.__methods___ = getComponentMethodNames(comp);
    } catch {
      out.__methods___ = [];
    }
    return out;
  }
  function pruneIrrelevantProps(comp, out) {
    if (comp instanceof cc.ButtonComponent) {
      if (comp.transition !== cc.ButtonComponent.Transition.SPRITE) {
        delete out.hoverSprite;
        delete out.pressedSprite;
        delete out.disabledSprite;
        delete out.normalSprite;
      }
      if (comp.transition !== cc.Button.Transition.COLOR) {
        delete out.hoverColor;
        delete out.pressedColor;
        delete out.disabledColor;
        delete out.normalColor;
      }
      if (comp.transition !== cc.Button.Transition.SCALE) delete out.zoomScale;
    }
    if (comp instanceof cc.SpriteComponent && comp.type !== cc.SpriteComponent.Type.FILLED) {
      delete out.fillType;
      delete out.fillRange;
      delete out.fillStart;
      delete out.fillCenter;
    }
    if (comp instanceof cc.LayoutComponent) {
      if (comp.type === cc.LayoutComponent.Type.NONE) {
        delete out.verticalDirection;
        delete out.startAxis;
        delete out.spacingX;
        delete out.spacingY;
        delete out.horizontalDirection;
        delete out.cellSize;
        if (comp.resizeMode === cc.LayoutComponent.ResizeMode.NONE) {
          delete out.paddingBottom;
          delete out.paddingTop;
          delete out.paddingLeft;
          delete out.paddingRight;
        }
      }
      if (comp.type === cc.LayoutComponent.Type.HORIZONTAL) {
        delete out.spacingY;
        delete out.verticalDirection;
        delete out.paddingBottom;
        delete out.paddingTop;
      }
      if (comp.type === cc.LayoutComponent.Type.VERTICAL) {
        delete out.spacingX;
        delete out.horizontalDirection;
        delete out.paddingLeft;
        delete out.paddingRight;
      }
      if (comp.resizeMode !== cc.LayoutComponent.ResizeMode.CHILDREN) delete out.cellSize;
      if (comp.type !== cc.LayoutComponent.Type.GRID) delete out.startAxis;
    }
    if (comp instanceof cc.WidgetComponent) {
      delete out.isStretchHeight;
      delete out.isStretchWidth;
      delete out.isAbsoluteHorizontalCenter;
      delete out.isAbsoluteVerticalCenter;
      delete out.isAbsoluteTop;
      delete out.isAbsoluteBottom;
      delete out.isAbsoluteRight;
      delete out.isAbsoluteLeft;
      for (const key of Object.keys(out)) {
        if (key.startsWith("editor")) delete out[key];
      }
    }
  }
  function getNodeDetail(nodeId, includeComps = true) {
    if (!detailState.fcom && window.fgui) detailState.fcom = new fgui.GComponent();
    const node = nodesById[nodeId];
    if (!node) return;
    detailState.lastDetailNode = node;
    const detail = {
      id: nodeId,
      active: node.active,
      name: node.name,
      position: node.position,
      scale: node.scale,
      eulerAngles: node.eulerAngles,
      opacity: node._uiProps.opacity,
      layer: cc.Layers.Enum[node.layer] || node.layer
    };
    if (includeComps) {
      let gobjPseudoComp = null;
      if (node.$gobj) {
        const gobj = node.$gobj;
        const filtered = Object.assign({}, gobj);
        for (const key in detailState.fcom) delete filtered[key];
        filtered.name = gobj.constructor.name;
        gobjPseudoComp = filtered;
      }
      const comps = node._components.concat();
      if (gobjPseudoComp) comps.unshift(gobjPseudoComp);
      detail.coms = comps.map(serializeComponent);
      comps.length = 0;
    }
    detail.includeComps = includeComps;
    showNodeDetail(detail);
  }
  function setComAttr(nodeId, compUuid, propName, value) {
    const node = nodesById[nodeId];
    if (!node) return;
    const comp = node._components.find((entry) => entry.uuid === compUuid);
    if (!comp) return;
    if (comp[propName] instanceof cc.Color) value = cc.Color.BLACK.clone().fromHEX(value);
    comp[propName] = value;
    if (treeState.dcMode) readyUpdateTree();
    if (comp instanceof cc.ButtonComponent && propName === "transition") getNodeDetail(nodeId);
  }
  function execCompMethod(nodeId, compUuid, methodName) {
    const node = nodesById[nodeId];
    if (!node) return;
    const comp = node._components.filter((entry) => entry.uuid === compUuid)[0];
    if (comp && comp[methodName]) comp[methodName]();
  }
  function toggleComp(nodeId, compUuid) {
    const node = nodesById[nodeId];
    if (!node) return;
    const comp = node._components.filter((entry) => entry.uuid === compUuid)[0];
    if (comp) {
      comp.enabled = !comp.enabled;
      getNodeDetail(nodeId);
      if (treeState.dcMode) readyUpdateTree();
    }
  }
  function removeComp(nodeId, compUuid) {
    const node = nodesById[nodeId];
    if (!node) return;
    const comp = node._components.filter((entry) => entry.uuid === compUuid)[0];
    if (comp) {
      node.removeComponent(comp);
      getSchedule().scheduleOnce(() => {
        getNodeDetail(nodeId);
        if (treeState.dcMode) readyUpdateTree();
      });
    }
  }
  function syncNode(nodeId, propPath, value) {
    const node = nodesById[nodeId];
    if (!node) return;
    treeState.stopSyncDetailOneTime = true;
    const parts = propPath.split(".");
    value = Number(value);
    const current = parts.length > 1 ? node[parts[0]][parts[1]] : node[propPath];
    if (current !== value) {
      if (parts.length > 1) {
        node[parts[0]][parts[1]] = value;
        node[parts[0]] = node[parts[0]];
      } else {
        node[propPath] = value;
      }
    }
    treeState.stopSyncDetailOneTime = false;
  }
  function syncNodeColor(nodeId, rgba) {
    const node = nodesById[nodeId];
    rgba = rgba.map((channel) => channel * 255);
    if (node) node.color = cc.color(...rgba);
  }
  function readyGetNodeDetail() {
    if (detailState.pendingDetailFun) return;
    if (treeState.stopSyncDetailOneTime) {
      treeState.stopSyncDetailOneTime = false;
      return;
    }
    if (!flags.syncNodeDetail) return;
    detailState.pendingDetailFun = () => {
      detailState.pendingDetailFun = null;
      if (!flags.syncNodeDetail) return;
      getNodeDetail(detailState.lastDetailNode._id, false);
    };
    getSchedule().scheduleOnce(detailState.pendingDetailFun);
  }

  // src/injected/tree.ts
  var TREE_UPDATE_THROTTLE_MS = 2e3;
  var TREE_UPDATE_DELAY_S = 0.1;
  var MARKER_EVENT = "__haha__";
  var eventTypes = null;
  var watchedEvents = null;
  function ensureEventTypes() {
    if (!eventTypes) eventTypes = cc.Node.EventType;
    if (!watchedEvents) {
      watchedEvents = [eventTypes.TRANSFORM_CHANGED, eventTypes.SIZE_CHANGED, eventTypes.COLOR_CHANGED];
    }
  }
  function getEventTypes() {
    ensureEventTypes();
    return eventTypes;
  }
  function getGobjName(gobj) {
    let name = gobj.name;
    if (!name) {
      if (gobj.packageItem) name = gobj.packageItem.name;
      else if (gobj.constructor) name = gobj.constructor.name;
    }
    return name;
  }
  function toggleDC() {
    treeState.dcMode = !treeState.dcMode;
    readyUpdateTree();
  }
  function isNodeInstrumented(node) {
    return node.__listened && !(node._eventProcessor && !node._eventProcessor.hasEventListener(MARKER_EVENT));
  }
  function hasBreakPoint(nodeId, eventName) {
    var _a;
    return Boolean((_a = breakPoints[nodeId]) == null ? void 0 : _a[eventName]);
  }
  function checkNode(node) {
    ensureEventTypes();
    if (isNodeInstrumented(node)) return;
    node.off(eventTypes.MOUSE_ENTER, onHoverNode);
    node.off(eventTypes.MOUSE_LEAVE, onHoverNode);
    if (node.getComponent(cc.RenderableComponent) && node.getComponent(cc.UITransformComponent)) {
      node.on(eventTypes.MOUSE_ENTER, onHoverNode);
      node.on(eventTypes.MOUSE_LEAVE, onHoverNode);
    }
    const breakIfSet = (eventName) => {
      if (hasBreakPoint(node._id, eventName)) {
        debugger;
      }
    };
    const onTracked = (eventName) => {
      breakIfSet(eventName);
      if (flags.syncNodeDetail && node === detailState.lastDetailNode) readyGetNodeDetail();
    };
    for (const eventType of watchedEvents) {
      node.on(eventType, (arg) => {
        onTracked(eventType === eventTypes.TRANSFORM_CHANGED ? cc.Node.TransformBit[arg] : eventType);
      });
    }
    node.on(eventTypes.CHILD_REMOVED, (child) => {
      deleteFromNodeMap(child);
      readyUpdateTree(false, node);
      breakIfSet(eventTypes.CHILD_REMOVED);
    });
    node.on(eventTypes.CHILD_ADDED, () => {
      readyUpdateTree(false, node);
      breakIfSet(eventTypes.CHILD_ADDED);
    });
    node.on(eventTypes.LAYER_CHANGED, () => breakIfSet(eventTypes.LAYER_CHANGED));
    node.on(eventTypes.SIBLING_ORDER_CHANGED, () => {
      readyUpdateTree(false, node);
      breakIfSet(eventTypes.SIBLING_ORDER_CHANGED);
    });
    node.on(MARKER_EVENT, readyUpdateTree);
    node.on("active-in-hierarchy-changed", (changed) => {
      if (node.parent) readyUpdateTree(false, node);
      onTracked("active-in-hierarchy-changed");
      if (flags.statistic) nodeLogs.push([Date.now(), [changed._id, changed.name]]);
    });
    node.__listened = true;
  }
  function serializeNode(out, node, parentOpacity = 255, parentOpen = true) {
    var _a, _b;
    ensureEventTypes();
    const isScene = node instanceof cc.Scene;
    out.name = node.name;
    out.id = node._id;
    out.isFairyCom = false;
    out.breaks = breakPoints[out.id];
    out.autoUpdate = !donotAutoUpdates[out.id];
    if (node.$gobj && window.fgui) {
      const gobj = node.$gobj;
      out.gobjName = getGobjName(gobj);
      out.isFairyCom = gobj instanceof fgui.GComponent;
    }
    out.active = isScene ? true : node.active;
    if (out.name.length === 0 && isScene) out.name = "CurrentScene";
    out.selected = false;
    let countsTowardDrawCall = true;
    out.activeInHierarchy = isScene ? true : node.activeInHierarchy;
    const opacity = out.opacityInHierarchy = Number(parentOpacity && (((_a = node._uiProps) == null ? void 0 : _a.opacity) || 1));
    if (!isScene) {
      out.isMeshRender = cc.js.getClassName(node.getComponent(cc.RenderableComponent)) === "cc.MeshRenderer";
    }
    if (!isScene && treeState.dcMode && out.activeInHierarchy && node._uiProps.opacity && !(node instanceof cc.Scene)) {
      const renderable = node.getComponent(cc.RenderableComponent);
      if (renderable && renderable.enabled) {
        if (renderable instanceof cc.SpriteComponent) {
          const texture = (_b = renderable.spriteFrame) == null ? void 0 : _b._texture;
          if (texture) out.atlasId = texture._id;
        } else if (renderable instanceof cc.LabelComponent) {
          if (renderable._texture && renderable.string.length > 0) {
            const texture = renderable._texture._texture;
            if (texture) out.atlasId = texture._id;
          }
        } else if (renderable instanceof cc.GraphicsComponent) {
          if (renderable._impl || renderable.impl) {
            out.rtype = "gh";
            out.atlasId = renderable._id;
            countsTowardDrawCall = false;
          }
        } else if (renderable instanceof cc.Mask) {
          out.rtype = "mk";
          out.atlasId = renderable._id;
          countsTowardDrawCall = false;
        } else {
          out.rtype = "ot";
        }
      }
    }
    checkNode(node);
    let drawCalls = 0;
    if (treeState.dcMode && opacity && out.activeInHierarchy) {
      if (out.atlasId && treeState.lastAtlasId !== out.atlasId) {
        if (countsTowardDrawCall) drawCalls++;
        treeState.lastAtlasId = out.atlasId;
      }
    }
    out.childCount = node.children.length;
    if (parentOpen || treeState.dcMode || treeState.checkAllOneTime) {
      const isOpen = isScene || openedNodes[out.id] !== void 0;
      if (!treeState.checkAllOneTime && !treeState.dcMode && !isOpen) {
        out.children = [];
      } else {
        out.children = node.children.map((child) => {
          nodesById[child._id] = child;
          return serializeNode({}, child, opacity, isOpen);
        });
      }
    } else {
      out.children = [];
    }
    if (treeState.dcMode) {
      if (opacity && out.activeInHierarchy) {
        out.children.forEach((child) => {
          drawCalls += child.dc;
        });
        out.dc = drawCalls;
        const childTypes = out.children.map((child) => child.rtype).filter((type) => type);
        if (childTypes.length > 0) {
          out.rtype = Array.from(new Set(childTypes.toString().split(","))).join(",");
        }
      } else {
        out.dc = 0;
      }
    }
    if (!parentOpen) out.children = [];
    return out;
  }
  function deleteFromNodeMap(node) {
    var _a;
    delete nodesById[node._id];
    (_a = node.children) == null ? void 0 : _a.forEach(deleteFromNodeMap);
  }
  function locateNodeByPath(uuidPath) {
    const lastId = uuidPath.slice(-1)[0];
    let parent = null;
    for (const uuid of uuidPath) {
      let node = nodesById[uuid];
      if (!node && parent) {
        node = parent.getChildByUuid(uuid);
        nodesById[uuid] = node;
      }
      if (node) {
        checkNode(node);
        syncOpen(uuid, true, false);
        parent = node;
      }
    }
    if (lastId) {
      readyUpdateTree();
      getNodeDetail(lastId);
    }
  }
  function syncOpen(nodeId, open, update = true) {
    if (open) {
      openedNodes[nodeId] = true;
      if (update) readyUpdateTree();
    } else {
      delete openedNodes[nodeId];
    }
  }
  function syncOpenFcom(nodeId) {
    const node = nodesById[nodeId];
    if (node.children.length === 1 && node.children[0].name === "Container") {
      syncOpen(node.children[0]._id, true, false);
    }
  }
  function readyUpdateTree(force = false, changedNode = null) {
    var _a, _b;
    if (changedNode && !treeState.dcMode) {
      if (donotAutoUpdates[changedNode._id]) return;
      for (const suppressedId in donotAutoUpdates) {
        if (changedNode.isChildOf(nodesById[suppressedId])) return;
      }
    }
    if (!flags.autoUpdateTree && !force) {
      canUpdateTree();
      return;
    }
    (_a = getSchedule()) == null ? void 0 : _a.unschedule(updateTree);
    if (Date.now() - treeState.lastTreeTime > TREE_UPDATE_THROTTLE_MS) {
      updateTree();
      return;
    }
    (_b = getSchedule()) == null ? void 0 : _b.scheduleOnce(updateTree, TREE_UPDATE_DELAY_S);
    if (cc.game.isPaused()) {
      setTimeout(() => {
        cc.game.step();
        setTimeout(() => cc.game.step(), 0);
      });
    }
  }
  function updateTree() {
    const scene = cc.director.getScene();
    if (!scene) return;
    treeState.lastAtlasId = null;
    treeState.lastTreeTime = Date.now();
    sendTree(serializeNode({}, scene));
    treeState.checkAllOneTime = false;
  }

  // src/injected/breakpoints.ts
  function setBreakPoint(nodeId, eventName, transformBit) {
    if (!breakPoints[nodeId]) breakPoints[nodeId] = {};
    breakPoints[nodeId][transformBit || eventName] = true;
    readyUpdateTree();
  }
  function removeBreakPoint(nodeId) {
    delete breakPoints[nodeId];
    readyUpdateTree();
  }
  function removeAllBreakPoints() {
    for (const nodeId in breakPoints) delete breakPoints[nodeId];
    readyUpdateTree();
  }
  function toggleAutoUpdateSuppression(nodeId) {
    if (donotAutoUpdates[nodeId]) delete donotAutoUpdates[nodeId];
    else donotAutoUpdates[nodeId] = true;
    readyUpdateTree();
  }

  // src/injected/console-hooks.ts
  var MAX_STRINGIFY_DEPTH = 3;
  function stringifyArgs(args, depth = 1) {
    const parts = args.map((arg) => {
      if (typeof arg !== "object" && typeof arg !== "function") return String(arg);
      if (arg === null) return "null";
      if (Array.isArray(arg)) {
        return depth === MAX_STRINGIFY_DEPTH ? String(arg) : `[${stringifyArgs(arg, depth + 1)}]`;
      }
      const shallow = {};
      for (const key in arg) {
        const value = arg[key];
        if (typeof value !== "object" && typeof value !== "function") {
          shallow[key] = value === null ? "null" : value;
        }
      }
      return JSON.stringify(shallow, null, "	");
    });
    return parts.length === 1 ? parts[0] : parts.join(",");
  }
  function isAllComplex(args) {
    return args.every((arg) => {
      const type = typeof arg;
      return type !== "function" && type !== "object";
    });
  }
  function wrap(original, forward) {
    return function(...args) {
      original.call(console, ...args);
      if (!isAllComplex(args)) forward(stringifyArgs(args));
      else if (window.cc) forward(cc.js.formatStr(...args));
    };
  }
  function initLogListeners() {
    if (flags.logCount === 0 && flags.showDevToolInTab) return;
    window.addEventListener("error", (event) => {
      var _a;
      console.error(event.message + "\n" + (((_a = event.error) == null ? void 0 : _a.stack) ?? ""));
    }, true);
    window.addEventListener("unhandledrejection", (event) => {
      console.error(`${event.reason}`);
    }, true);
    console.log = wrap(console.log, sendLog);
    console.info = wrap(console.info, sendLog);
    console.error = wrap(console.error, sendError);
    console.warn = wrap(console.warn, sendWarn);
  }

  // src/injected/code-tip.ts
  var MAX_VALUE_PREVIEW = 100;
  function codeTip(input) {
    if (input.startsWith("__")) return [];
    const segments = input.split(".");
    let needle = segments.pop();
    if (needle.includes("(")) needle = needle.split("(")[0];
    needle = needle.toLowerCase();
    let target = window[segments.shift()] || window;
    if (!target) return [];
    while (segments.length > 0) {
      const segment = segments.shift();
      if (!target) return [];
      target = target[segment];
    }
    if (!target) return [];
    const tips = [];
    let names = target === window.cc || target === window ? [] : Object.getOwnPropertyNames(target);
    if (target.constructor && target.constructor.__props__) names.push(...target.constructor.__props__);
    const nameSet = new Set(names);
    for (const key in target) nameSet.add(key);
    names = Array.from(nameSet);
    for (const name of names) {
      if (name.startsWith("__")) continue;
      let value = target[name];
      if (needle !== "" && !name.toLowerCase().includes(needle)) continue;
      if (typeof value === "function") {
        if (value.length === 0) {
          tips.push([name, "function()"]);
          continue;
        }
        const source = value.toString();
        let signature = source.split("\n").shift();
        const isNative = source.includes("[native code]");
        signature = signature.replace(`function ${value.name}`, "function");
        if (!signature.endsWith("{")) {
          const closeBrace = signature.indexOf("){");
          const closeSpaceBrace = signature.indexOf(") {");
          signature = closeBrace > closeSpaceBrace ? signature.slice(0, closeBrace + 1) : signature.slice(0, 3);
        } else {
          signature = signature.replace("{", "");
        }
        if (isNative && signature === "function()") {
          signature = "function(";
          const argNames = [];
          for (let index = 1; index <= value.length; index++) argNames.push(`arg${index}`);
          signature += argNames.join(",") + ")";
        }
        tips.push([name, signature]);
      } else if (typeof value === "object") {
        if (Array.isArray(value)) tips.push([name, `[](length:${value.length})`]);
        else tips.push([name, value === null ? "null" : value.constructor ? value.constructor.name : "object"]);
      } else {
        value = typeof value === "string" ? value : String(value);
        if (value.length > MAX_VALUE_PREVIEW) value = value.slice(0, MAX_VALUE_PREVIEW) + "...";
        tips.push([name, `"${value}"`]);
      }
    }
    tips.sort();
    tips.sort((a, b) => a[0].toLowerCase().indexOf(needle) - b[0].toLowerCase().indexOf(needle));
    return tips;
  }

  // src/injected/misc.ts
  function toggleNodeActive(nodeId) {
    const node = nodesById[nodeId];
    if (node) node.active = !node.active;
    readyUpdateTree();
  }
  function removeNode(nodeId) {
    const node = nodesById[nodeId];
    if (node) node.removeFromParent();
  }
  function lockDragNode(nodeId) {
    flags.lockDragNode = nodeId;
  }
  function swapPos(draggedId, targetId) {
    const dragged = nodesById[draggedId];
    const target = nodesById[targetId];
    if (!target || !dragged) return;
    dragged.parent = target.parent;
    dragged.setSiblingIndex(target.getSiblingIndex());
  }
  function toggleFps() {
    if (!cc.debug) {
      cc.director.setDisplayStats(!cc.director.isDisplayStats());
      return;
    }
    cc.debug.setDisplayStats(!cc.debug.isDisplayStats());
  }
  function startStatistic(enabled) {
    if (enabled) {
      nodeLogs.length = 0;
      flags.statistic = true;
      return;
    }
    flags.statistic = false;
    sendStatistic(nodeLogs.concat());
    nodeLogs.length = 0;
  }
  function updateResize() {
    if (!CC_PREVIEW) return;
    const scene = cc.director.getScene();
    if (!scene) return;
    scene.getComponentsInChildren(cc.WidgetComponent).forEach((widget) => {
      if (!widget.isValid) return;
      if (cc.WidgetComponent.AlignMode) {
        if (widget.alignMode === cc.WidgetComponent.AlignMode.ON_WINDOW_RESIZE) widget.updateAlignment();
      } else if (widget.enabledInHierarchy) {
        widget.updateAlignment();
      }
    });
  }
  function resizeCanvas() {
    if (CC_BUILD) return;
    const canvas = cc.game.canvas;
    if (!canvas) return;
    if (isEngine3_4OrNewer()) {
      cc.screen.windowSize = cc.size(window.innerWidth * window.devicePixelRatio, window.innerHeight * window.devicePixelRatio);
      return;
    }
    if (!cc.ENGINE_VERSION.startsWith("1.") && cc.view.setFrameSize) {
      cc.view.setFrameSize(window.innerWidth, window.innerHeight);
      updateResize();
    } else {
      canvas.style.height = window.innerHeight + "px";
      canvas.style.width = window.innerWidth + "px";
    }
  }
  function removePreviewPageChrome() {
    var _a, _b;
    const content = document.querySelector("#content");
    (_a = content == null ? void 0 : content.querySelector(".footer")) == null ? void 0 : _a.remove();
    (_b = content == null ? void 0 : content.querySelector(".error")) == null ? void 0 : _b.remove();
    if (content && content.parentElement !== document.body) document.body.append(content);
    const wrapper = document.querySelector(".wrapper");
    if (wrapper) wrapper.style.border = "none";
    const contentWrap = document.querySelector(".contentWrap");
    if (contentWrap) {
      contentWrap.style.overflow = "hidden";
      contentWrap.style.height = "100vh";
      contentWrap.style.width = "100vw";
    }
    const hiddenBin = document.createElement("div");
    hiddenBin.style.display = "none";
    document.body.append(hiddenBin);
    for (const element of Array.from(document.body.children)) {
      if (element !== hiddenBin && !element.contains(cc.game.canvas)) hiddenBin.append(element);
    }
    resizeCanvas();
  }
  function reCompile() {
    const url = window.location.href + "update-db";
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.send(null);
  }

  // src/injected/pointer-fix.ts
  var ADD_POINTER_EVENT_PROCESSOR = 0;
  var patched = false;
  function findDispatcher() {
    const nodeEventProcessor = cc.NodeEventProcessor;
    const invoker = nodeEventProcessor == null ? void 0 : nodeEventProcessor.callbacksInvoker;
    const table = invoker == null ? void 0 : invoker._callbackTable;
    const list = table == null ? void 0 : table[ADD_POINTER_EVENT_PROCESSOR];
    const infos = list == null ? void 0 : list.callbackInfos;
    if (!Array.isArray(infos)) return null;
    for (const info of infos) {
      const target = info == null ? void 0 : info.target;
      if (target && Array.isArray(target._pointerEventProcessorList) && typeof target._sortPointerEventProcessorList === "function") {
        return target;
      }
    }
    return null;
  }
  function patchPointerEventDispatcher() {
    if (patched) return;
    try {
      const dispatcher = findDispatcher();
      if (!dispatcher) return;
      dispatcher._sortPointerEventProcessorList = function() {
        if (!this._isListDirty) return;
        const list = this._pointerEventProcessorList;
        for (let i = 0; i < list.length; i++) {
          const processor = list[i];
          const node = processor && processor.node;
          if (node && node._uiProps) {
            const trans = node._getUITransformComp ? node._getUITransformComp() : null;
            if (trans) processor.cachedCameraPriority = trans.cameraPriority;
          }
        }
        list.sort(this._sortByPriority);
        this._isListDirty = false;
      };
      patched = true;
    } catch (error) {
      console.warn("cocos-inspector: pointer dispatcher patch failed", error);
    }
  }

  // src/injected/init.ts
  var CC_DETECT_RETRIES = 30;
  var CC_DETECT_INTERVAL_MS = 100;
  var retryCount = 0;
  function refreshDesignResolution() {
    const designSize = cc.view.getDesignResolutionSize();
    cc.view.setDesignResolutionSize(designSize.width, designSize.height, cc.view.getResolutionPolicy());
    refreshCanvasCameras();
  }
  function refreshCanvasCameras() {
    const scene = cc.director.getScene();
    const CanvasClass = cc.Canvas;
    if (!scene || !CanvasClass) return;
    const targetOrthoHeight = cc.view.getVisibleSize().height / 2;
    scene.getComponentsInChildren(CanvasClass).forEach((canvas) => {
      const camera = canvas.cameraComponent;
      if (camera && camera.orthoHeight !== targetOrthoHeight) camera.orthoHeight = targetOrthoHeight;
    });
  }
  function initEngineHooks(retrying = false) {
    if (!window.cc) {
      if (retryCount < CC_DETECT_RETRIES) {
        setTimeout(() => initEngineHooks(true), CC_DETECT_INTERVAL_MS);
        retryCount++;
        return;
      }
      if (retrying) console.error("maybe this is not a CocosCreator Game");
      return;
    }
    cc.log = console.log;
    cc.warn = console.warn;
    cc.error = console.error;
    applyEngineAliases();
    patchPointerEventDispatcher();
    if (CC_PREVIEW && !cc.ENGINE_VERSION.startsWith("1.")) {
      window.addEventListener("resize", refreshDesignResolution, { capture: true });
    }
    cc.director.on(cc.Director.EVENT_AFTER_SCENE_LAUNCH, () => {
      checkHover();
      removePreviewPageChrome();
      readyUpdateTree(true);
      setTimeout(refreshDesignResolution, 0);
      sendGameState(cc.game.isPaused());
      if (!window.fgui && CC_BUILD) {
        try {
          System.import("chunks:///_virtual/fairygui.mjs").then((fguiModule) => {
            window.fgui = fguiModule;
            if (fguiModule) readyUpdateTree();
          }).catch(() => {
          });
        } catch {
        }
      }
    });
    if (cc.director.getScene()) readyUpdateTree(true);
    const originalPause = cc.game.pause;
    cc.game.pause = function() {
      originalPause.call(cc.game);
      sendGameState(cc.game.isPaused());
    };
    const originalResume = cc.game.resume;
    cc.game.resume = function() {
      originalResume.call(cc.game);
      sendGameState(cc.game.isPaused());
    };
    cc._isContextMenuEnable = true;
  }

  // src/injected/index.ts
  if (!w.__initLogListeners) {
    Object.assign(w, {
      // lifecycle
      __initLogListeners: initLogListeners,
      __initSf: initEngineHooks,
      // tree
      __updateTree: updateTree,
      __readyUpdateTree: readyUpdateTree,
      __locateNode: locateNodeByPath,
      __syncOpen: syncOpen,
      __syncOpenFcom: syncOpenFcom,
      __toggleDC: toggleDC,
      __toggleNode: toggleNodeActive,
      __removeNode: removeNode,
      __swapPos: swapPos,
      __donotAutoUpdate: toggleAutoUpdateSuppression,
      // breakpoints
      __setBreakPoint: setBreakPoint,
      __removeBreakPoint: removeBreakPoint,
      __removeAllBreakPoint: removeAllBreakPoints,
      // hover / design mode
      __setHover: setHover,
      __toggleDesignMode: toggleDesignMode,
      __toggleDrag: lockDragNode,
      __checkHover: checkHover,
      __drawRect: drawRect,
      __clearRect: clearRect,
      // node detail
      __getNodeDetail: getNodeDetail,
      __readyGetNodeDetail: readyGetNodeDetail,
      __setComAttr: setComAttr,
      __execCompMethod: execCompMethod,
      __toggleComp: toggleComp,
      __removeComp: removeComp,
      __syncNode: syncNode,
      __syncNodeColor: syncNodeColor,
      // console helpers / search
      __codeTip: codeTip,
      __searchComs: searchComs,
      __printPath: printPath,
      __getPath: getPath,
      __getPathByid: getPathById,
      __getUuidPathByPath: getUuidPathByPath,
      __storeInGlobal: storeInGlobal,
      __storeCompInGlobal: storeCompInGlobal,
      __getComp: getComp,
      // misc
      __toggleFps: toggleFps,
      __startStatistic: startStatistic,
      __updateResize: updateResize,
      __resizeCvn: resizeCanvas,
      __removeOtherNodes: removePreviewPageChrome,
      __reCompile: reCompile,
      __moreThen3_4_0: isEngine3_4OrNewer
    });
    if (!w.fgui && typeof System !== "undefined") {
      System.import("fairygui-cc", location.origin + "/scripting/x/mods/").then((fguiModule) => {
        w.fgui = fguiModule;
      }).catch(() => {
      });
    }
    initLogListeners();
    initEngineHooks();
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2luamVjdGVkL3N0YXRlLnRzIiwgIi4uL3NyYy9pbmplY3RlZC9lbmdpbmUtY29tcGF0LnRzIiwgIi4uL3NyYy9pbmplY3RlZC9kcmF3LXJlY3QudHMiLCAiLi4vc3JjL2luamVjdGVkL25vZGUtcGF0aC50cyIsICIuLi9zcmMvaW5qZWN0ZWQvaG92ZXIudHMiLCAiLi4vc3JjL2luamVjdGVkL25vZGUtZGV0YWlsLnRzIiwgIi4uL3NyYy9pbmplY3RlZC90cmVlLnRzIiwgIi4uL3NyYy9pbmplY3RlZC9icmVha3BvaW50cy50cyIsICIuLi9zcmMvaW5qZWN0ZWQvY29uc29sZS1ob29rcy50cyIsICIuLi9zcmMvaW5qZWN0ZWQvY29kZS10aXAudHMiLCAiLi4vc3JjL2luamVjdGVkL21pc2MudHMiLCAiLi4vc3JjL2luamVjdGVkL3BvaW50ZXItZml4LnRzIiwgIi4uL3NyYy9pbmplY3RlZC9pbml0LnRzIiwgIi4uL3NyYy9pbmplY3RlZC9pbmRleC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLy8gUHJvYmUgc3RhdGUuIFZhbHVlcyB0aGUgaW5zcGVjdG9yIHJlbmRlcmVyIGFzc2lnbnMgZGlyZWN0bHkgKGV4ZWN1dGVKYXZhU2NyaXB0IHN0cmluZ3MgbGlrZVxuLy8gXCJfX2hvdmVyPTE7X19hdXRvVXBkYXRlVHJlZT10cnVlO1wiKSBNVVNUIGxpdmUgb24gd2luZG93OyBtb2R1bGUtaW50ZXJuYWwgc3RhdGUgc3RheXMgaGVyZS5cblxuZXhwb3J0IGNvbnN0IHcgPSB3aW5kb3cgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCBhbnk+O1xuXG4vKiogbm9kZSB1dWlkIC0+IGxpdmUgY2MuTm9kZTsga2VwdCBvbiB3aW5kb3cgKGFzIGBfX25kYCkgZm9yIGNvbnNvbGUgZGVidWdnaW5nIHBhcml0eS4gKi9cbmV4cG9ydCBjb25zdCBub2Rlc0J5SWQ6IFJlY29yZDxzdHJpbmcsIGFueT4gPSAoIHcuX19uZCA9IHcuX19uZCA/PyB7fSApO1xuXG4vKiogSG9zdC1jb250cm9sbGVkIGZsYWdzOiByZWFkL3dyaXR0ZW4gYnkgdGhlIHJlbmRlcmVyIHRocm91Z2ggZGlyZWN0IHdpbmRvdyBhc3NpZ25tZW50LiAqL1xuZXhwb3J0IGNvbnN0IGZsYWdzID0ge1xuICAgIGdldCBob3ZlcigpOiBudW1iZXIgeyByZXR1cm4gdy5fX2hvdmVyID8/IDA7IH0sXG4gICAgc2V0IGhvdmVyKCB2YWx1ZTogbnVtYmVyICkgeyB3Ll9faG92ZXIgPSB2YWx1ZTsgfSxcbiAgICBnZXQgZGVzaWduTW9kZSgpOiBib29sZWFuIHsgcmV0dXJuIEJvb2xlYW4oIHcuX19kZXNpZ25Nb2RlICk7IH0sXG4gICAgc2V0IGRlc2lnbk1vZGUoIHZhbHVlOiBib29sZWFuICkgeyB3Ll9fZGVzaWduTW9kZSA9IHZhbHVlOyB9LFxuICAgIGdldCBsb2NrRHJhZ05vZGUoKTogc3RyaW5nIHwgbnVsbCB7IHJldHVybiB3Ll9fbG9ja0RyYWdOb2RlID8/IG51bGw7IH0sXG4gICAgc2V0IGxvY2tEcmFnTm9kZSggdmFsdWU6IHN0cmluZyB8IG51bGwgKSB7IHcuX19sb2NrRHJhZ05vZGUgPSB2YWx1ZTsgfSxcbiAgICBnZXQgYXV0b1VwZGF0ZVRyZWUoKTogYm9vbGVhbiB7IHJldHVybiB3Ll9fYXV0b1VwZGF0ZVRyZWUgPz8gdHJ1ZTsgfSxcbiAgICBnZXQgc3luY05vZGVEZXRhaWwoKTogYm9vbGVhbiB7IHJldHVybiBCb29sZWFuKCB3Ll9fc3luY05vZGVEZXRhaWwgKTsgfSxcbiAgICBnZXQgbG9nQ291bnQoKTogbnVtYmVyIHsgcmV0dXJuIE51bWJlciggdy5fX2xvZ0NvdW50ID8/IDAgKTsgfSxcbiAgICBnZXQgc2hvd0RldlRvb2xJblRhYigpOiBib29sZWFuIHsgcmV0dXJuIEJvb2xlYW4oIHcuX19zaG93RGV2VG9vbEluVGFiICk7IH0sXG4gICAgZ2V0IHN0YXRpc3RpYygpOiBib29sZWFuIHsgcmV0dXJuIEJvb2xlYW4oIHcuX19zdGF0aXN0aWMgKTsgfSxcbiAgICBzZXQgc3RhdGlzdGljKCB2YWx1ZTogYm9vbGVhbiApIHsgdy5fX3N0YXRpc3RpYyA9IHZhbHVlOyB9LFxufTtcblxuLyoqIG5vZGUgdXVpZCAtPiB7IFtldmVudE5hbWVdOiB0cnVlIH0gLSBub2RlIGJyZWFrcG9pbnRzIChkZWJ1Z2dlciBvbiBub2RlIGV2ZW50cykuICovXG5leHBvcnQgY29uc3QgYnJlYWtQb2ludHM6IFJlY29yZDxzdHJpbmcsIFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+PiA9IHt9O1xuXG4vKiogbm9kZSB1dWlkIC0+IHRydWUgd2hlbiBpdHMgc3VidHJlZSBpcyBleHBhbmRlZCBpbiB0aGUgaW5zcGVjdG9yIHRyZWUuICovXG5leHBvcnQgY29uc3Qgb3BlbmVkTm9kZXM6IFJlY29yZDxzdHJpbmcsIGJvb2xlYW4+ID0ge307XG5cbi8qKiBub2RlIHV1aWQgLT4gdHJ1ZSB3aGVuIGF1dG8gdHJlZSB1cGRhdGVzIGFyZSBzdXBwcmVzc2VkIGZvciB0aGF0IHN1YnRyZWUuICovXG5leHBvcnQgY29uc3QgZG9ub3RBdXRvVXBkYXRlczogUmVjb3JkPHN0cmluZywgYm9vbGVhbj4gPSB7fTtcblxuLyoqIFt0aW1lc3RhbXAsIFt1dWlkLCBuYW1lXV0gbG9nIG9mIGFjdGl2ZS1pbi1oaWVyYXJjaHkgY2hhbmdlcyB3aGlsZSBzdGF0aXN0aWNzIHJ1bi4gKi9cbmV4cG9ydCBjb25zdCBub2RlTG9nczogQXJyYXk8WyBudW1iZXIsIFsgc3RyaW5nLCBzdHJpbmcgXSBdPiA9IFtdO1xuXG5leHBvcnQgY29uc3QgdHJlZVN0YXRlID0ge1xuICAgIC8qKiBzZXJpYWxpemUgZXZlcnkgbm9kZSBvbmNlIG9uIHRoZSBuZXh0IHRyZWUgcGFzcyAoaWdub3JlcyBvcGVuZWROb2RlcyBnYXRpbmcpICovXG4gICAgY2hlY2tBbGxPbmVUaW1lOiBmYWxzZSxcbiAgICAvKiogRHJhd0NhbGwgYW5hbHlzaXMgbW9kZSAqL1xuICAgIGRjTW9kZTogZmFsc2UsXG4gICAgbGFzdEF0bGFzSWQ6IG51bGwgYXMgc3RyaW5nIHwgbnVsbCxcbiAgICBsYXN0VHJlZVRpbWU6IDAsXG4gICAgLyoqIHN1cHByZXNzIG9uZSBub2RlLWRldGFpbCBzeW5jIGVjaG8gYWZ0ZXIgdGhlIGluc3BlY3RvciBpdHNlbGYgd3JvdGUgYSB2YWx1ZSAqL1xuICAgIHN0b3BTeW5jRGV0YWlsT25lVGltZTogZmFsc2UsXG59O1xuXG5leHBvcnQgY29uc3QgZGV0YWlsU3RhdGUgPSB7XG4gICAgbGFzdERldGFpbE5vZGU6IG51bGwgYXMgYW55LFxuICAgIHBlbmRpbmdEZXRhaWxGdW46IG51bGwgYXMgKCAoKSA9PiB2b2lkICkgfCBudWxsLFxuICAgIC8qKiBmZ3VpIEdDb21wb25lbnQgaW5zdGFuY2UgdXNlZCB0byBmaWx0ZXIgYmFzZS1jbGFzcyBrZXlzIG91dCBvZiAkZ29iaiBzZXJpYWxpemF0aW9uICovXG4gICAgZmNvbTogbnVsbCBhcyBhbnksXG59O1xuXG5leHBvcnQgY29uc3QgaG92ZXJTdGF0ZSA9IHtcbiAgICBsYXN0SG92ZXJOb2RlOiBudWxsIGFzIGFueSxcbiAgICBsYXN0RGVzaWduTm9kZTogbnVsbCBhcyBhbnksXG4gICAgcmF5OiBudWxsIGFzIGFueSxcbiAgICAvKiogdHJ1ZSB3aGlsZSBhIG1vdXNlIGJ1dHRvbiBpcyBoZWxkIGR1cmluZyBhIGRlc2lnbi1tb2RlIGRyYWcgKENDIDMuNCsgbW91c2UgcGF0aCkgKi9cbiAgICBkcmFnZ2luZzogZmFsc2UsXG59O1xuIiwgIi8vIEVuZ2luZS12ZXJzaW9uIGNvbXBhdGliaWxpdHkgaGVscGVycyBmb3IgQ29jb3MgQ3JlYXRvciAxLnggLSAzLjgrLlxuXG4vKiogdHJ1ZSB3aGVuIHRoZSBlbmdpbmUgaXMgQ29jb3MgQ3JlYXRvciA+PSAzLjQgKGlucHV0L3N5c3RlbSBBUEkgZGlmZmVyZW5jZXMpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzRW5naW5lM180T3JOZXdlcigpOiBib29sZWFuIHtcbiAgICBjb25zdCBwYXJ0cyA9IFN0cmluZyggY2MuRU5HSU5FX1ZFUlNJT04gKS5zcGxpdCggJy4nICk7XG4gICAgcmV0dXJuIE51bWJlciggcGFydHNbIDAgXSApID49IDMgJiYgTnVtYmVyKCBwYXJ0c1sgMSBdICkgPj0gNDtcbn1cblxuLyoqIEEgY29tcG9uZW50IHdob3NlIHNjaGVkdWxlciBzdXJ2aXZlcyBzY2VuZSBzd2l0Y2hlczsgdXNlZCBmb3Igc2NoZWR1bGVPbmNlIGRlYm91bmNpbmcuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2NoZWR1bGUoKTogYW55IHtcbiAgICByZXR1cm4gY2MuRU5HSU5FX1ZFUlNJT04uc3RhcnRzV2l0aCggJzMuJyApXG4gICAgICAgID8gY2MuZGlyZWN0b3IuZ2V0U2NlbmUoKT8uZ2V0Q29tcG9uZW50SW5DaGlsZHJlbiggY2MuQ2FtZXJhIClcbiAgICAgICAgOiBjYy5DYW52YXMuaW5zdGFuY2U7XG59XG5cbi8qKlxuICogQXBwbGllcyBsZWdhY3kgYWxpYXMgYWRqdXN0bWVudHMgdGhlIHByb2JlIHJlbGllcyBvbi5cbiAqXG4gKiAtIENyZWF0b3IgMy54IHJlbmFtZWQgY2xhc3NlczsgdGhlIHByb2JlIHVzZXMgdGhlIFwiQ29tcG9uZW50XCItc3VmZml4ZWQgbGVnYWN5IGFsaWFzZXMsIGFuZFxuICogICAzLnggcGFnZXMga2VlcCB0aGVtIC0gYnV0IDMuNisgcmVwb2ludGVkIGNjLlJlbmRlcmFibGVDb21wb25lbnQgdG8gdGhlIDNELW9ubHlcbiAqICAgTW9kZWxSZW5kZXJlciwgc28gMkQgVUkgbm9kZXMgKFNwcml0ZS9MYWJlbCA9IFVJUmVuZGVyZXIpIG5ldmVyIG1hdGNoIGdldENvbXBvbmVudCgpLlxuICogICBUaGUgcGFnZS1nbG9iYWwgY2MgaXMgY2NsZWdhY3kgKG5vIGNjLlJlbmRlcmVyL2NjLlVJUmVuZGVyZXIpLCBzbyB0aGUgcmVhbCBjbGFzc2VzIGFyZVxuICogICByZXNvbHZlZCB0aHJvdWdoIHRoZSBjbGFzcyByZWdpc3RyeSAvIFNwcml0ZSBwcm90b3R5cGUgY2hhaW4sIHRoZW4gdGhlIGFsaWFzIGlzIHJldGFyZ2V0ZWRcbiAqICAgdG8gUmVuZGVyZXIgLSB0aGUgY29tbW9uIGJhc2Ugb2YgVUlSZW5kZXJlciBhbmQgTW9kZWxSZW5kZXJlci5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5RW5naW5lQWxpYXNlcygpOiB2b2lkIHtcbiAgICBpZiAoICFjYy5FTkdJTkVfVkVSU0lPTi5zdGFydHNXaXRoKCAnMy4nICkgKSByZXR1cm47XG4gICAgY2MuU3ByaXRlID0gY2MuU3ByaXRlQ29tcG9uZW50O1xuICAgIGNjLkxhYmVsID0gY2MuTGFiZWxDb21wb25lbnQ7XG4gICAgY2MuV2lkZ2V0ID0gY2MuV2lkZ2V0Q29tcG9uZW50O1xuICAgIGNjLkxheW91dCA9IGNjLkxheW91dENvbXBvbmVudDtcbiAgICB0cnkge1xuICAgICAgICBpZiAoICFjYy5SZW5kZXJhYmxlQ29tcG9uZW50ICkgcmV0dXJuO1xuICAgICAgICBjb25zdCBieU5hbWUgPSAoIG5hbWU6IHN0cmluZyApOiBhbnkgPT4gKCBjYy5qcy5nZXRDbGFzc0J5TmFtZSA/IGNjLmpzLmdldENsYXNzQnlOYW1lKCBuYW1lICkgOiBudWxsICk7XG4gICAgICAgIGNvbnN0IHVpUmVuZGVyZXIgPSBieU5hbWUoICdjYy5VSVJlbmRlcmVyJyApIHx8IGJ5TmFtZSggJ2NjLlJlbmRlcmFibGUyRCcgKVxuICAgICAgICAgICAgfHwgKCBjYy5TcHJpdGUgJiYgT2JqZWN0LmdldFByb3RvdHlwZU9mKCBjYy5TcHJpdGUucHJvdG90eXBlICkuY29uc3RydWN0b3IgKTtcbiAgICAgICAgaWYgKCAhdWlSZW5kZXJlciB8fCB1aVJlbmRlcmVyLnByb3RvdHlwZSBpbnN0YW5jZW9mIGNjLlJlbmRlcmFibGVDb21wb25lbnQgKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGNvbW1vbkJhc2UgPSBieU5hbWUoICdjYy5SZW5kZXJlcicgKSB8fCBPYmplY3QuZ2V0UHJvdG90eXBlT2YoIHVpUmVuZGVyZXIucHJvdG90eXBlICkuY29uc3RydWN0b3I7XG4gICAgICAgIGlmICggY29tbW9uQmFzZSAmJiB1aVJlbmRlcmVyLnByb3RvdHlwZSBpbnN0YW5jZW9mIGNvbW1vbkJhc2UgJiYgY2MuUmVuZGVyYWJsZUNvbXBvbmVudC5wcm90b3R5cGUgaW5zdGFuY2VvZiBjb21tb25CYXNlICkge1xuICAgICAgICAgICAgY2MuUmVuZGVyYWJsZUNvbXBvbmVudCA9IGNvbW1vbkJhc2U7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoICggZXJyb3IgKSB7XG4gICAgICAgIGNvbnNvbGUud2FybiggJ2NvY29zLWluc3BlY3RvciByZW5kZXJhYmxlIHNoaW0gZmFpbGVkJywgZXJyb3IgKTtcbiAgICB9XG59XG4iLCAiLy8gU2VsZWN0aW9uIHJlY3RhbmdsZSBkcmF3biBvdmVyIHRoZSBnYW1lIHdpdGggYSBHcmFwaGljcyBub2RlIChcIklOU1BFQ1RPUi1OT0RFXCIpLlxuaW1wb3J0IHsgbm9kZXNCeUlkIH0gZnJvbSAnLi9zdGF0ZSc7XG5pbXBvcnQgeyBpc0VuZ2luZTNfNE9yTmV3ZXIgfSBmcm9tICcuL2VuZ2luZS1jb21wYXQnO1xuXG5jb25zdCBSRUNUX0NPTE9SID0gJyMzNWIwZmQnO1xuY29uc3QgR1JBUEhJQ1NfTk9ERV9OQU1FID0gJ0lOU1BFQ1RPUi1OT0RFJztcbmNvbnN0IFBIWVNJQ1NfREVCVUdfTk9ERV9OQU1FID0gJ1BIWVNJQ1NfMkRfREVCVUdfRFJBVyc7XG5jb25zdCBUSU5ZX05PREVfU0laRSA9IDQ7XG5cbmxldCBncmFwaGljczogYW55ID0gbnVsbDtcbmxldCBzY3JhdGNoVmVjOiBhbnkgPSBudWxsO1xuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJSZWN0KCk6IHZvaWQge1xuICAgIGlmICggZ3JhcGhpY3MgJiYgZ3JhcGhpY3Mubm9kZSApIGdyYXBoaWNzLmNsZWFyKCk7XG59XG5cbmZ1bmN0aW9uIGVuc3VyZUdyYXBoaWNzKCBjYW52YXNOb2RlOiBhbnkgKTogdm9pZCB7XG4gICAgaWYgKCAhZ3JhcGhpY3MgfHwgIWdyYXBoaWNzLm5vZGUgKSB7XG4gICAgICAgIGNvbnN0IG5vZGUgPSBuZXcgY2MuTm9kZSggR1JBUEhJQ1NfTk9ERV9OQU1FICk7XG4gICAgICAgIG5vZGUubGF5ZXIgPSBjYy5MYXllcnMuRW51bS5VSV8yRDtcbiAgICAgICAgZ3JhcGhpY3MgPSBub2RlLmFkZENvbXBvbmVudCggY2MuR3JhcGhpY3NDb21wb25lbnQgKTtcbiAgICAgICAgY29uc3QgdHJhbnNmb3JtID0gbm9kZS5nZXRDb21wb25lbnQoIGNjLlVJVHJhbnNmb3JtQ29tcG9uZW50ICk7XG4gICAgICAgIHRyYW5zZm9ybS5zZXRDb250ZW50U2l6ZSggY2MuU2l6ZS5aRVJPICk7XG4gICAgICAgIGdyYXBoaWNzLnN0cm9rZUNvbG9yID0gY2MuQ29sb3IuV0hJVEUuY2xvbmUoKS5mcm9tSEVYKCBSRUNUX0NPTE9SICk7XG4gICAgfVxuICAgIGlmICggIWdyYXBoaWNzLm5vZGUucGFyZW50ICkgY2FudmFzTm9kZS5hZGRDaGlsZCggZ3JhcGhpY3Mubm9kZSApO1xuICAgIGdyYXBoaWNzPy5ub2RlPy5zZXRQb3NpdGlvbiggY2MuVmVjMy5aRVJPICk7XG4gICAgLy8gc3RheSB0b3Btb3N0LCBidXQgYmVsb3cgdGhlIHBoeXNpY3MgZGVidWcgb3ZlcmxheSB3aGVuIGl0IGV4aXN0c1xuICAgIGxldCBmcm9tRW5kID0gMTtcbiAgICBpZiAoIGdyYXBoaWNzLm5vZGUucGFyZW50LmNoaWxkcmVuLnNsaWNlKCAtMSApWyAwIF0/Lm5hbWUgPT09IFBIWVNJQ1NfREVCVUdfTk9ERV9OQU1FICkgZnJvbUVuZCA9IDI7XG4gICAgZ3JhcGhpY3Mubm9kZS5zZXRTaWJsaW5nSW5kZXgoICggZ3JhcGhpY3Mubm9kZS5wYXJlbnQuY2hpbGRyZW4ubGVuZ3RoIC0gZnJvbUVuZCApIHx8IDAgKTtcbn1cblxuZnVuY3Rpb24gZmlyc3RDYW1lcmEoKTogYW55IHtcbiAgICByZXR1cm4gY2MuZGlyZWN0b3IuZ2V0U2NlbmUoKS5nZXRDb21wb25lbnRzSW5DaGlsZHJlbiggY2MuQ2FtZXJhICkuZmluZCggKCBjYW1lcmE6IGFueSApID0+IGNhbWVyYSApO1xufVxuXG4vKiogRHJhd3MgdGhlIHdpcmVmcmFtZSBvZiBhIDNEIG1vZGVsJ3MgYm91bmRzIChub2RlcyB3aXRob3V0IFVJVHJhbnNmb3JtKS4gKi9cbmZ1bmN0aW9uIGRyYXdNb2RlbEJvdW5kcyggbm9kZTogYW55LCByZW5kZXJhYmxlOiBhbnkgKTogdm9pZCB7XG4gICAgY29uc3QgYm91bmRzID0gcmVuZGVyYWJsZS5tb2RlbC5tb2RlbEJvdW5kcztcbiAgICBjb25zdCBtaW4gPSBjYy52MygpO1xuICAgIGNvbnN0IG1heCA9IGNjLnYzKCk7XG4gICAgYm91bmRzLmdldEJvdW5kYXJ5KCBtaW4sIG1heCApO1xuICAgIGxldCBib3R0b21SaW5nID0gW1xuICAgICAgICBtaW4sXG4gICAgICAgIG1pbi5jbG9uZSgpLmFkZCggY2MudjMoIDAsIDAsIGJvdW5kcy5oYWxmRXh0ZW50cy56ICogMiApICksXG4gICAgICAgIG1heC5jbG9uZSgpLmFkZCggY2MudjMoIDAsIC1ib3VuZHMuaGFsZkV4dGVudHMueSAqIDIsIDAgKSApLFxuICAgICAgICBtaW4uY2xvbmUoKS5hZGQoIGNjLnYzKCBib3VuZHMuaGFsZkV4dGVudHMueCAqIDIsIDAsIDAgKSApLFxuICAgIF07XG4gICAgbGV0IHRvcFJpbmcgPSBbXG4gICAgICAgIG1pbi5jbG9uZSgpLmFkZCggY2MudjMoIDAsIGJvdW5kcy5oYWxmRXh0ZW50cy55ICogMiwgMCApICksXG4gICAgICAgIG1heC5jbG9uZSgpLmFkZCggY2MudjMoIC1ib3VuZHMuaGFsZkV4dGVudHMueCAqIDIsIDAsIDAgKSApLFxuICAgICAgICBtYXgsXG4gICAgICAgIG1heC5jbG9uZSgpLmFkZCggY2MudjMoIDAsIDAsIC1ib3VuZHMuaGFsZkV4dGVudHMueiAqIDIgKSApLFxuICAgIF07XG4gICAgY29uc3Qgd29ybGRNYXRyaXggPSBub2RlLndvcmxkTWF0cml4O1xuICAgIGNvbnN0IGNhbWVyYSA9IGZpcnN0Q2FtZXJhKCk7XG4gICAgYm90dG9tUmluZyA9IGJvdHRvbVJpbmcubWFwKCAoIHBvaW50ICkgPT4gY2FtZXJhLmNvbnZlcnRUb1VJTm9kZSggcG9pbnQudHJhbnNmb3JtTWF0NCggd29ybGRNYXRyaXggKSwgZ3JhcGhpY3Mubm9kZSApICk7XG4gICAgdG9wUmluZyA9IHRvcFJpbmcubWFwKCAoIHBvaW50ICkgPT4gY2FtZXJhLmNvbnZlcnRUb1VJTm9kZSggcG9pbnQudHJhbnNmb3JtTWF0NCggd29ybGRNYXRyaXggKSwgZ3JhcGhpY3Mubm9kZSApICk7XG4gICAgZ3JhcGhpY3MuY2xlYXIoKTtcbiAgICBncmFwaGljcy5saW5lV2lkdGggPSA0O1xuICAgIGNvbnN0IG9yaWdpbmFsQ29sb3IgPSBncmFwaGljcy5zdHJva2VDb2xvci5jbG9uZSgpO1xuICAgIGdyYXBoaWNzLnN0cm9rZUNvbG9yLl9zZXRfYV91bnNhZmUoIDE4MCApO1xuICAgIGJvdHRvbVJpbmcuZm9yRWFjaCggKCBwb2ludCwgaW5kZXggKSA9PiB7XG4gICAgICAgIGlmICggaW5kZXggPT09IDAgKSBncmFwaGljcy5tb3ZlVG8oIHBvaW50LngsIHBvaW50LnkgKTtcbiAgICAgICAgZWxzZSBncmFwaGljcy5saW5lVG8oIHBvaW50LngsIHBvaW50LnkgKTtcbiAgICB9ICk7XG4gICAgZ3JhcGhpY3MubGluZVRvKCBib3R0b21SaW5nWyAwIF0ueCwgYm90dG9tUmluZ1sgMCBdLnkgKTtcbiAgICB0b3BSaW5nLmZvckVhY2goICggcG9pbnQsIGluZGV4ICkgPT4ge1xuICAgICAgICBpZiAoIGluZGV4ID09PSAwICkgZ3JhcGhpY3MubW92ZVRvKCBwb2ludC54LCBwb2ludC55ICk7XG4gICAgICAgIGVsc2UgZ3JhcGhpY3MubGluZVRvKCBwb2ludC54LCBwb2ludC55ICk7XG4gICAgfSApO1xuICAgIGdyYXBoaWNzLmxpbmVUbyggdG9wUmluZ1sgMCBdLngsIHRvcFJpbmdbIDAgXS55ICk7XG4gICAgdG9wUmluZy5mb3JFYWNoKCAoIHBvaW50LCBpbmRleCApID0+IHtcbiAgICAgICAgY29uc3QgYmVsb3cgPSBib3R0b21SaW5nWyBpbmRleCBdO1xuICAgICAgICBncmFwaGljcy5tb3ZlVG8oIHBvaW50LngsIHBvaW50LnkgKTtcbiAgICAgICAgZ3JhcGhpY3MubGluZVRvKCBiZWxvdy54LCBiZWxvdy55ICk7XG4gICAgfSApO1xuICAgIGdyYXBoaWNzLnN0cm9rZSgpO1xuICAgIGdyYXBoaWNzLnN0cm9rZUNvbG9yID0gb3JpZ2luYWxDb2xvcjtcbn1cblxuLyoqIEZhbGxiYWNrIGZvciBtb2RlbHMgZXhwb3Npbmcgb25seSB3b3JsZEJvdW5kczogZHJhdyBpdHMgZGlhZ29uYWwuICovXG5mdW5jdGlvbiBkcmF3V29ybGRCb3VuZHNEaWFnb25hbCggcmVuZGVyYWJsZTogYW55ICk6IHZvaWQge1xuICAgIGNvbnN0IGJvdW5kcyA9IHJlbmRlcmFibGUubW9kZWwud29ybGRCb3VuZHM7XG4gICAgY29uc3QgbWluID0gY2MudjMoKTtcbiAgICBjb25zdCBtYXggPSBjYy52MygpO1xuICAgIGJvdW5kcy5nZXRCb3VuZGFyeSggbWluLCBtYXggKTtcbiAgICBjb25zdCBjYW1lcmEgPSBmaXJzdENhbWVyYSgpO1xuICAgIGNhbWVyYS5jb252ZXJ0VG9VSU5vZGUoIG1pbiwgZ3JhcGhpY3Mubm9kZSwgbWluICk7XG4gICAgY2FtZXJhLmNvbnZlcnRUb1VJTm9kZSggbWF4LCBncmFwaGljcy5ub2RlLCBtYXggKTtcbiAgICBncmFwaGljcy5jbGVhcigpO1xuICAgIGdyYXBoaWNzLmxpbmVXaWR0aCA9IDQ7XG4gICAgY29uc3Qgb3JpZ2luYWxDb2xvciA9IGdyYXBoaWNzLnN0cm9rZUNvbG9yLmNsb25lKCk7XG4gICAgZ3JhcGhpY3Muc3Ryb2tlQ29sb3IuX3NldF9hX3Vuc2FmZSggMjAwICk7XG4gICAgZ3JhcGhpY3MubW92ZVRvKCBtaW4ueCwgbWluLnkgKTtcbiAgICBncmFwaGljcy5saW5lVG8oIG1heC54LCBtYXgueSApO1xuICAgIGdyYXBoaWNzLnN0cm9rZSgpO1xuICAgIGdyYXBoaWNzLnN0cm9rZUNvbG9yID0gb3JpZ2luYWxDb2xvcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRyYXdSZWN0KCBub2RlSWQ6IHN0cmluZyApOiB2b2lkIHtcbiAgICBpZiAoICEoIHdpbmRvdyBhcyBhbnkgKS5jYyApIHJldHVybjtcbiAgICBpZiAoICFjYy5kaXJlY3Rvci5nZXRTY2VuZSgpICkgcmV0dXJuO1xuICAgIGxldCBjYW52YXNOb2RlID0gY2MuZGlyZWN0b3IuZ2V0U2NlbmUoKS5nZXRDb21wb25lbnRJbkNoaWxkcmVuKCBjYy5DYW52YXNDb21wb25lbnQgKT8ubm9kZTtcbiAgICBpZiAoICFjYW52YXNOb2RlICkge1xuICAgICAgICBjb25zdCBzY2VuZSA9IGNjLmRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgICAgIGNhbnZhc05vZGUgPSBuZXcgY2MuTm9kZSgpO1xuICAgICAgICBjYW52YXNOb2RlLmFkZENvbXBvbmVudCggY2MuQ2FudmFzQ29tcG9uZW50ICk7XG4gICAgICAgIHNjZW5lLmFkZENoaWxkKCBjYW52YXNOb2RlICk7XG4gICAgfVxuICAgIGlmICggIXNjcmF0Y2hWZWMgKSBzY3JhdGNoVmVjID0gY2MudjMoKTtcbiAgICBpZiAoICFjYy5kaXJlY3Rvci5nZXRTY2VuZSgpICkgcmV0dXJuO1xuICAgIGVuc3VyZUdyYXBoaWNzKCBjYW52YXNOb2RlICk7XG5cbiAgICBjb25zdCBub2RlID0gbm9kZXNCeUlkWyBub2RlSWQgXTtcbiAgICBpZiAoICFub2RlIHx8ICFub2RlLmlzVmFsaWQgKSByZXR1cm47XG4gICAgbm9kZS5nZXRXb3JsZFBvc2l0aW9uKCBzY3JhdGNoVmVjICk7XG4gICAgc2NyYXRjaFZlYy5zdWJ0cmFjdCggY2FudmFzTm9kZS5wb3NpdGlvbiApO1xuXG4gICAgY29uc3QgdHJhbnNmb3JtID0gbm9kZS5nZXRDb21wb25lbnQoIGNjLlVJVHJhbnNmb3JtQ29tcG9uZW50ICk7XG4gICAgbGV0IHdpZHRoID0gMDtcbiAgICBsZXQgaGVpZ2h0ID0gMDtcbiAgICBsZXQgYW5jaG9yWCA9IDAuNTtcbiAgICBsZXQgYW5jaG9yWSA9IDAuNTtcbiAgICBpZiAoIHRyYW5zZm9ybSApIHtcbiAgICAgICAgd2lkdGggPSB0cmFuc2Zvcm0ud2lkdGg7XG4gICAgICAgIGhlaWdodCA9IHRyYW5zZm9ybS5oZWlnaHQ7XG4gICAgICAgIGFuY2hvclggPSB0cmFuc2Zvcm0uYW5jaG9yWDtcbiAgICAgICAgYW5jaG9yWSA9IHRyYW5zZm9ybS5hbmNob3JZO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHJlbmRlcmFibGUgPSBub2RlLmdldENvbXBvbmVudCggY2MuUmVuZGVyYWJsZUNvbXBvbmVudCApO1xuICAgICAgICBpZiAoIHJlbmRlcmFibGUgJiYgcmVuZGVyYWJsZS5tb2RlbD8ubW9kZWxCb3VuZHMgKSB7XG4gICAgICAgICAgICBkcmF3TW9kZWxCb3VuZHMoIG5vZGUsIHJlbmRlcmFibGUgKTtcbiAgICAgICAgfSBlbHNlIGlmICggcmVuZGVyYWJsZSAmJiByZW5kZXJhYmxlLm1vZGVsPy53b3JsZEJvdW5kcyApIHtcbiAgICAgICAgICAgIGRyYXdXb3JsZEJvdW5kc0RpYWdvbmFsKCByZW5kZXJhYmxlICk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHNjcmF0Y2hWZWMubXVsdGlwbHlTY2FsYXIoIDAgKTtcbiAgICBpZiAoIGFuY2hvclggIT09IDAuNSApIHNjcmF0Y2hWZWMueCArPSB3aWR0aCAqICggMC41IC0gYW5jaG9yWCApO1xuICAgIGlmICggYW5jaG9yWSAhPT0gMC41ICkgc2NyYXRjaFZlYy55ICs9IGhlaWdodCAqICggMC41IC0gYW5jaG9yWSApO1xuICAgIGNvbnN0IG9yaWdpbmFsQ29sb3IgPSBncmFwaGljcy5zdHJva2VDb2xvci5jbG9uZSgpO1xuICAgIGdyYXBoaWNzLmNsZWFyKCk7XG4gICAgZ3JhcGhpY3MubGluZVdpZHRoID0gaXNFbmdpbmUzXzRPck5ld2VyKCkgPyA0IDogKCBjYy52aWV3LmlzUmV0aW5hRW5hYmxlZCgpID8gMyA6IDUgKTtcbiAgICBjb25zdCBjYW52YXNUcmFuc2Zvcm0gPSBjYW52YXNOb2RlLmdldENvbXBvbmVudCggY2MuVUlUcmFuc2Zvcm1Db21wb25lbnQgKTtcbiAgICBpZiAoIHdpZHRoIDwgVElOWV9OT0RFX1NJWkUgfHwgaGVpZ2h0IDwgVElOWV9OT0RFX1NJWkUgKSB7XG4gICAgICAgIC8vIG5vZGUgaXMgdG9vIHNtYWxsIGZvciBhIHJlY3RhbmdsZSAtIG1hcmsgaXQgd2l0aCBjb25jZW50cmljIGNpcmNsZXMgaW5zdGVhZFxuICAgICAgICB0cmFuc2Zvcm0uY29udmVydFRvV29ybGRTcGFjZUFSKCBzY3JhdGNoVmVjLCBzY3JhdGNoVmVjICk7XG4gICAgICAgIHNjcmF0Y2hWZWMuc3VidHJhY3QoIGNjLnYzKCBjYW52YXNUcmFuc2Zvcm0ud2lkdGggLyAyLCBjYW52YXNUcmFuc2Zvcm0uaGVpZ2h0IC8gMiApICk7XG4gICAgICAgIGdyYXBoaWNzLnN0cm9rZUNvbG9yID0gY2MuQ29sb3IuQkxBQ0s7XG4gICAgICAgIGdyYXBoaWNzLmNpcmNsZSggc2NyYXRjaFZlYy54LCBzY3JhdGNoVmVjLnksIDEzICk7XG4gICAgICAgIGdyYXBoaWNzLnN0cm9rZSgpO1xuICAgICAgICBncmFwaGljcy5zdHJva2VDb2xvciA9IG9yaWdpbmFsQ29sb3I7XG4gICAgICAgIGdyYXBoaWNzLmNpcmNsZSggc2NyYXRjaFZlYy54LCBzY3JhdGNoVmVjLnksIDEwICk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgY29ybmVycyA9IFtcbiAgICAgICAgICAgIGNjLnYzKCBzY3JhdGNoVmVjLnggLSB3aWR0aCAvIDIsIHNjcmF0Y2hWZWMueSAtIGhlaWdodCAvIDIgKSxcbiAgICAgICAgICAgIGNjLnYzKCBzY3JhdGNoVmVjLnggKyB3aWR0aCAvIDIsIHNjcmF0Y2hWZWMueSAtIGhlaWdodCAvIDIgKSxcbiAgICAgICAgICAgIGNjLnYzKCBzY3JhdGNoVmVjLnggKyB3aWR0aCAvIDIsIHNjcmF0Y2hWZWMueSArIGhlaWdodCAvIDIgKSxcbiAgICAgICAgICAgIGNjLnYzKCBzY3JhdGNoVmVjLnggLSB3aWR0aCAvIDIsIHNjcmF0Y2hWZWMueSArIGhlaWdodCAvIDIgKSxcbiAgICAgICAgXTtcbiAgICAgICAgY29ybmVycy5mb3JFYWNoKCAoIGNvcm5lciApID0+IHtcbiAgICAgICAgICAgIHRyYW5zZm9ybS5jb252ZXJ0VG9Xb3JsZFNwYWNlQVIoIGNvcm5lciwgY29ybmVyICk7XG4gICAgICAgICAgICBjb3JuZXIuc3VidHJhY3QoIGNjLnYzKCBjYW52YXNUcmFuc2Zvcm0ud2lkdGggLyAyLCBjYW52YXNUcmFuc2Zvcm0uaGVpZ2h0IC8gMiApICk7XG4gICAgICAgIH0gKTtcbiAgICAgICAgY29uc3QgZmlyc3QgPSBjb3JuZXJzLnNoaWZ0KCk7XG4gICAgICAgIGNvcm5lcnMucHVzaCggZmlyc3QgKTtcbiAgICAgICAgZ3JhcGhpY3MubW92ZVRvKCBmaXJzdC54LCBmaXJzdC55ICk7XG4gICAgICAgIC8vIGJsYWNrIHNoYWRvdyBwYXNzIGZpcnN0LCB0aGVuIHRoZSBoaWdobGlnaHQgY29sb3JcbiAgICAgICAgZ3JhcGhpY3Muc3Ryb2tlQ29sb3IgPSBjYy5Db2xvci5CTEFDSztcbiAgICAgICAgY29ybmVycy5mb3JFYWNoKCAoIGNvcm5lciApID0+IGdyYXBoaWNzLmxpbmVUbyggY29ybmVyLnggKyAxLCBjb3JuZXIueSAtIDEgKSApO1xuICAgICAgICBncmFwaGljcy5zdHJva2UoKTtcbiAgICAgICAgZ3JhcGhpY3Muc3Ryb2tlQ29sb3IgPSBvcmlnaW5hbENvbG9yO1xuICAgICAgICBjb3JuZXJzLmZvckVhY2goICggY29ybmVyICkgPT4gZ3JhcGhpY3MubGluZVRvKCBjb3JuZXIueCwgY29ybmVyLnkgKSApO1xuICAgIH1cbiAgICBncmFwaGljcy5zdHJva2UoKTtcbn1cbiIsICIvLyBOb2RlIHBhdGggaGVscGVycyBhbmQgc2NlbmUtd2lkZSBjb21wb25lbnQgc2VhcmNoLlxuaW1wb3J0IHsgbm9kZXNCeUlkIH0gZnJvbSAnLi9zdGF0ZSc7XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRQYXRoKCBub2RlOiBhbnkgKTogeyBwYXRoOiBzdHJpbmc7IHV1aWRQYXRoOiBzdHJpbmdbXSB9IHtcbiAgICBjb25zdCBuYW1lcyA9IFsgbm9kZS5uYW1lIF07XG4gICAgY29uc3QgdXVpZHMgPSBbIG5vZGUudXVpZCBdO1xuICAgIHdoaWxlICggbm9kZS5wYXJlbnQgJiYgISggbm9kZS5wYXJlbnQgaW5zdGFuY2VvZiBjYy5TY2VuZSApICkge1xuICAgICAgICBuYW1lcy5wdXNoKCBub2RlLnBhcmVudC5uYW1lICk7XG4gICAgICAgIHV1aWRzLnB1c2goIG5vZGUucGFyZW50LnV1aWQgKTtcbiAgICAgICAgbm9kZSA9IG5vZGUucGFyZW50O1xuICAgIH1cbiAgICByZXR1cm4geyBwYXRoOiBuYW1lcy5yZXZlcnNlKCkuam9pbiggJy8nICksIHV1aWRQYXRoOiB1dWlkcy5yZXZlcnNlKCkgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFBhdGhCeUlkKCBub2RlSWQ6IHN0cmluZyApOiBzdHJpbmcge1xuICAgIGNvbnN0IG5vZGUgPSBub2Rlc0J5SWRbIG5vZGVJZCBdO1xuICAgIHJldHVybiBub2RlID8gZ2V0UGF0aCggbm9kZSApLnBhdGggOiAnJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFV1aWRQYXRoQnlQYXRoKCBzY2VuZVBhdGg6IHN0cmluZyApOiBzdHJpbmdbXSB7XG4gICAgY29uc3Qgbm9kZSA9IGNjLmZpbmQoIHNjZW5lUGF0aCApO1xuICAgIHJldHVybiBub2RlID8gZ2V0UGF0aCggbm9kZSApLnV1aWRQYXRoIDogW107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcmludFBhdGgoIG5vZGVJZDogc3RyaW5nICk6IHZvaWQge1xuICAgIGNvbnNvbGUubG9nKCBnZXRQYXRoQnlJZCggbm9kZUlkICkgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN0b3JlSW5HbG9iYWwoIG5vZGVJZDogc3RyaW5nICk6IHZvaWQge1xuICAgIGNvbnN0IG5vZGUgPSBub2Rlc0J5SWRbIG5vZGVJZCBdO1xuICAgIGlmICggbm9kZSApIHtcbiAgICAgICAgKCB3aW5kb3cgYXMgYW55ICkudGVtcDEgPSBub2RlO1xuICAgICAgICBjb25zb2xlLmxvZyggYG5vZGU6ICR7IG5vZGUubmFtZSB9LCBzdG9yZSBpbiB0ZW1wMSBhbHJlYWR5IWAgKTtcbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRDb21wKCBub2RlSWQ6IHN0cmluZywgY29tcFV1aWQ6IHN0cmluZyApOiBhbnkge1xuICAgIGNvbnN0IG5vZGUgPSBub2Rlc0J5SWRbIG5vZGVJZCBdO1xuICAgIGlmICggIW5vZGUgKSByZXR1cm4gbnVsbDtcbiAgICByZXR1cm4gbm9kZS5fY29tcG9uZW50cy5maWx0ZXIoICggY29tcDogYW55ICkgPT4gY29tcC51dWlkID09PSBjb21wVXVpZCApWyAwIF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzdG9yZUNvbXBJbkdsb2JhbCggbm9kZUlkOiBzdHJpbmcsIGNvbXBVdWlkOiBzdHJpbmcgKTogdm9pZCB7XG4gICAgY29uc3QgY29tcCA9IGdldENvbXAoIG5vZGVJZCwgY29tcFV1aWQgKTtcbiAgICBpZiAoIGNvbXAgKSB7XG4gICAgICAgICggd2luZG93IGFzIGFueSApLmNvbXAxID0gY29tcDtcbiAgICAgICAgY29uc29sZS5sb2coIGBjb21wb25lbnQ6ICR7IGNvbXAubmFtZSB9LCBzdG9yZSBpbiBjb21wMSBhbHJlYWR5IWAgKTtcbiAgICB9XG59XG5cbi8qKiBDYXNlLWluc2Vuc2l0aXZlIGNvbXBvbmVudC1jbGFzcyBzZWFyY2ggYWNyb3NzIHRoZSBzY2VuZSAoaW5zcGVjdG9yIHNlYXJjaCBwYW5lbCkuICovXG5leHBvcnQgZnVuY3Rpb24gc2VhcmNoQ29tcygga2V5d29yZDogc3RyaW5nICk6IHVua25vd25bXSB7XG4gICAga2V5d29yZCA9IGtleXdvcmQudG9Mb3dlckNhc2UoKTtcbiAgICBsZXQgY29tcHMgPSBjYy5kaXJlY3Rvci5nZXRTY2VuZSgpLmdldENvbXBvbmVudHNJbkNoaWxkcmVuKCBjYy5Db21wb25lbnQgKTtcbiAgICBjb21wcyA9IGNvbXBzLmZpbHRlciggKCBjb21wOiBhbnkgKSA9PiBjYy5qcy5nZXRDbGFzc05hbWUoIGNvbXAgKS50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKCBrZXl3b3JkICkgKTtcbiAgICByZXR1cm4gY29tcHMubWFwKCAoIGNvbXA6IGFueSApID0+IHtcbiAgICAgICAgY29uc3QgeyB1dWlkIH0gPSBjb21wO1xuICAgICAgICBjb25zdCBuYW1lID0gY2MuanMuZ2V0Q2xhc3NOYW1lKCBjb21wICk7XG4gICAgICAgIGNvbnN0IHZpc2libGUgPSBjb21wLm5vZGUuYWN0aXZlSW5IaWVyYXJjaHlcbiAgICAgICAgICAgICYmICggIWNvbXAuZ2V0Q29tcG9uZW50KCAnY2MuVUlPcGFjaXR5JyApIHx8IGNvbXAuZ2V0Q29tcG9uZW50KCAnY2MuVUlPcGFjaXR5JyApLm9wYWNpdHkgPiAwICk7XG4gICAgICAgIGNvbnN0IHsgcGF0aCwgdXVpZFBhdGggfSA9IGdldFBhdGgoIGNvbXAubm9kZSApO1xuICAgICAgICByZXR1cm4geyBuYW1lLCB1dWlkLCB2aXNpYmxlLCBwYXRoLCB1dWlkUGF0aCB9O1xuICAgIH0gKTtcbn1cbiIsICIvLyBIb3ZlciBjcm9zc2hhaXIgKDJELzNEIG5vZGUgcGlja2luZykgYW5kIGRlc2lnbiBtb2RlIChkcmFnIG5vZGVzIGluIHRoZSBydW5uaW5nIGdhbWUpLlxuaW1wb3J0IHsgbm9kZXNCeUlkLCBmbGFncywgaG92ZXJTdGF0ZSwgdHJlZVN0YXRlIH0gZnJvbSAnLi9zdGF0ZSc7XG5pbXBvcnQgeyBpc0VuZ2luZTNfNE9yTmV3ZXIgfSBmcm9tICcuL2VuZ2luZS1jb21wYXQnO1xuaW1wb3J0IHsgZ2V0RXZlbnRUeXBlcywgcmVhZHlVcGRhdGVUcmVlIH0gZnJvbSAnLi90cmVlJztcbmltcG9ydCB7IGRyYXdSZWN0LCBjbGVhclJlY3QgfSBmcm9tICcuL2RyYXctcmVjdCc7XG5pbXBvcnQgeyBnZXRQYXRoIH0gZnJvbSAnLi9ub2RlLXBhdGgnO1xuXG5leHBvcnQgY29uc3QgSG92ZXJNb2RlID0geyBPRkY6IDAsIFBJQ0tfMkQ6IDEsIFBJQ0tfM0Q6IDIgfSBhcyBjb25zdDtcblxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZURlc2lnbk1vZGUoIGVuYWJsZWQ6IGJvb2xlYW4gKTogdm9pZCB7XG4gICAgZmxhZ3MuZGVzaWduTW9kZSA9IGVuYWJsZWQ7XG4gICAgY2hlY2tIb3ZlcigpO1xuICAgIGlmICggIWVuYWJsZWQgKSBjbGVhclJlY3QoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNldEhvdmVyKCBtb2RlOiBudW1iZXIgKTogdm9pZCB7XG4gICAgZmxhZ3MuaG92ZXIgPSBtb2RlO1xuICAgIGNoZWNrSG92ZXIoKTtcbiAgICBpZiAoICFtb2RlICkgY2xlYXJSZWN0KCk7XG59XG5cbi8qKlxuICogKFJlKXJlZ2lzdGVycyB0aGUgcGljayBsaXN0ZW5lcnMuIFJlZ2lzdGVyZWQgb24gZXZlcnkgQ2FudmFzIGluIHRoZSBzY2VuZSAtIGdhbWVzIGNvbW1vbmx5XG4gKiBrZWVwIGEgc2Vjb25kIENhbnZhcyB1bmRlciBEb250RGVzdHJveU9uTG9hZCBhbmQgY2xpY2tzIHRoZXJlIHdvdWxkIG90aGVyd2lzZSBiZSBtaXNzZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaGVja0hvdmVyKCk6IHZvaWQge1xuICAgIGNvbnN0IHNjZW5lID0gY2MuZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICBjb25zdCBjYW52YXNlcyA9ICggc2NlbmU/LmdldENvbXBvbmVudHNJbkNoaWxkcmVuKCBjYy5DYW52YXNDb21wb25lbnQgKSA/PyBbXSApLm1hcCggKCBjYW52YXM6IGFueSApID0+IGNhbnZhcy5ub2RlICk7XG4gICAgaWYgKCAhaXNFbmdpbmUzXzRPck5ld2VyKCkgKSB1bnJlZ2lzdGVySG92ZXIoIHNjZW5lICk7XG4gICAgY2FudmFzZXMuZm9yRWFjaCggdW5yZWdpc3RlckhvdmVyICk7XG4gICAgaWYgKCBmbGFncy5ob3ZlciB8fCBmbGFncy5kZXNpZ25Nb2RlICkge1xuICAgICAgICBpZiAoICFpc0VuZ2luZTNfNE9yTmV3ZXIoKSApIHJlZ2lzdGVySG92ZXIoIHNjZW5lICk7XG4gICAgICAgIGNhbnZhc2VzLmZvckVhY2goIHJlZ2lzdGVySG92ZXIgKTtcbiAgICB9XG4gICAgdHJlZVN0YXRlLmNoZWNrQWxsT25lVGltZSA9IHRydWU7XG4gICAgcmVhZHlVcGRhdGVUcmVlKCk7XG59XG5cbmZ1bmN0aW9uIHJlZ2lzdGVySG92ZXIoIHRhcmdldDogYW55ICk6IHZvaWQge1xuICAgIGlmICggIXRhcmdldCApIHJldHVybjtcbiAgICBjb25zdCBldCA9IGdldEV2ZW50VHlwZXMoKTtcbiAgICAvLyBUb3VjaCBwYXRoICh0b3VjaCBkZXZpY2VzIC8gdG91Y2ggc2ltdWxhdG9ycylcbiAgICB0YXJnZXQub24oIGV0LlRPVUNIX0NBTkNFTCwgb25EZXNpZ25Ub3VjaCwgbnVsbCwgdHJ1ZSApO1xuICAgIHRhcmdldC5vbiggZXQuVE9VQ0hfTU9WRSwgb25EZXNpZ25Ub3VjaCwgbnVsbCwgdHJ1ZSApO1xuICAgIHRhcmdldC5vbiggZXQuVE9VQ0hfU1RBUlQsIG9uRGVzaWduVG91Y2gsIG51bGwsIHRydWUgKTtcbiAgICB0YXJnZXQub24oIGV0LlRPVUNIX0VORCwgb25QaWNrQ29tbWl0LCBudWxsLCB0cnVlICk7XG4gICAgLy8gTW91c2UgcGF0aC4gQ0MgMy40KyBubyBsb25nZXIgc3ludGhlc2l6ZXMgbm9kZSBUT1VDSCBldmVudHMgZnJvbSBtb3VzZSBpbnB1dCwgc28gYm90aCB0aGVcbiAgICAvLyBjcm9zc2hhaXIgY2xpY2sgKE1PVVNFX1VQKSBhbmQgZGVzaWduLW1vZGUgZHJhZyAoTU9VU0VfRE9XTi9NT1ZFL1VQKSBtdXN0IHVzZSBtb3VzZSBldmVudHMuXG4gICAgdGFyZ2V0Lm9uKCBldC5NT1VTRV9ET1dOLCBvbk1vdXNlRG93biwgbnVsbCwgdHJ1ZSApO1xuICAgIHRhcmdldC5vbiggZXQuTU9VU0VfTU9WRSwgb25Nb3VzZU1vdmUsIG51bGwsIHRydWUgKTtcbiAgICB0YXJnZXQub24oIGV0Lk1PVVNFX1VQLCBvbk1vdXNlVXAsIG51bGwsIHRydWUgKTtcbn1cblxuZnVuY3Rpb24gdW5yZWdpc3RlckhvdmVyKCB0YXJnZXQ6IGFueSApOiB2b2lkIHtcbiAgICBpZiAoICF0YXJnZXQgKSByZXR1cm47XG4gICAgY29uc3QgZXQgPSBnZXRFdmVudFR5cGVzKCk7XG4gICAgdGFyZ2V0Lm9mZiggZXQuVE9VQ0hfQ0FOQ0VMLCBvbkRlc2lnblRvdWNoLCBudWxsLCB0cnVlICk7XG4gICAgdGFyZ2V0Lm9mZiggZXQuVE9VQ0hfTU9WRSwgb25EZXNpZ25Ub3VjaCwgbnVsbCwgdHJ1ZSApO1xuICAgIHRhcmdldC5vZmYoIGV0LlRPVUNIX1NUQVJULCBvbkRlc2lnblRvdWNoLCBudWxsLCB0cnVlICk7XG4gICAgdGFyZ2V0Lm9mZiggZXQuVE9VQ0hfRU5ELCBvblBpY2tDb21taXQsIG51bGwsIHRydWUgKTtcbiAgICB0YXJnZXQub2ZmKCBldC5NT1VTRV9ET1dOLCBvbk1vdXNlRG93biwgbnVsbCwgdHJ1ZSApO1xuICAgIHRhcmdldC5vZmYoIGV0Lk1PVVNFX01PVkUsIG9uTW91c2VNb3ZlLCBudWxsLCB0cnVlICk7XG4gICAgdGFyZ2V0Lm9mZiggZXQuTU9VU0VfVVAsIG9uTW91c2VVcCwgbnVsbCwgdHJ1ZSApO1xufVxuXG4vKiogUmVhZHMgYSBwb2ludGVyIGV2ZW50J3MgVUktc3BhY2UgZGVsdGEsIHRvbGVyYXRpbmcgZW5naW5lLXZlcnNpb24gZGlmZmVyZW5jZXMuICovXG5mdW5jdGlvbiB1aURlbHRhKCBldmVudDogYW55ICk6IHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfSB7XG4gICAgaWYgKCB0eXBlb2YgZXZlbnQuZ2V0VUlEZWx0YSA9PT0gJ2Z1bmN0aW9uJyApIHJldHVybiBldmVudC5nZXRVSURlbHRhKCk7XG4gICAgaWYgKCB0eXBlb2YgZXZlbnQuZ2V0RGVsdGEgPT09ICdmdW5jdGlvbicgKSByZXR1cm4gZXZlbnQuZ2V0RGVsdGEoKTtcbiAgICByZXR1cm4geyB4OiAwLCB5OiAwIH07XG59XG5cbi8qKiBQaWNrcyB1cCB0aGUgaG92ZXJlZCBub2RlIHdoZW4gYSBtb3VzZSBkcmFnIHN0YXJ0cyBpbiBkZXNpZ24gbW9kZSAobWlycm9ycyBUT1VDSF9TVEFSVCkuICovXG5mdW5jdGlvbiBvbk1vdXNlRG93biggZXZlbnQ6IGFueSApOiB2b2lkIHtcbiAgICBpZiAoICFmbGFncy5kZXNpZ25Nb2RlICkgcmV0dXJuO1xuICAgIGJlZ2luRGVzaWduRHJhZygpO1xuICAgIGhvdmVyU3RhdGUuZHJhZ2dpbmcgPSB0cnVlO1xuICAgIGV2ZW50LnByb3BhZ2F0aW9uU3RvcHBlZCA9IHRydWU7XG4gICAgZXZlbnQucHJvcGFnYXRpb25JbW1lZGlhdGVTdG9wcGVkID0gdHJ1ZTtcbn1cblxuLyoqIEVuZHMgYSBtb3VzZSBkcmFnIC8gY2xpY2s6IGNvbW1pdCBzZWxlY3Rpb24sIHRoZW4gc3RvcCBkcmFnZ2luZyAobWlycm9ycyBUT1VDSF9FTkQpLiAqL1xuZnVuY3Rpb24gb25Nb3VzZVVwKCBldmVudDogYW55ICk6IHZvaWQge1xuICAgIGhvdmVyU3RhdGUuZHJhZ2dpbmcgPSBmYWxzZTtcbiAgICBvblBpY2tDb21taXQoIGV2ZW50ICk7XG59XG5cbi8qKiBNT1VTRV9FTlRFUi9MRUFWRSBoYW5kbGVyIHJlZ2lzdGVyZWQgcGVyIHJlbmRlcmFibGUgbm9kZSAoc2VlIHRyZWUuY2hlY2tOb2RlKS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBvbkhvdmVyTm9kZSggZXZlbnQ6IGFueSApOiB2b2lkIHtcbiAgICBpZiAoIGV2ZW50LnR5cGUgPT09IGNjLk5vZGUuRXZlbnRUeXBlLk1PVVNFX0xFQVZFICkge1xuICAgICAgICBjbGVhclJlY3QoKTtcbiAgICAgICAgaG92ZXJTdGF0ZS5sYXN0SG92ZXJOb2RlID0gbnVsbDtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIGZsYWdzLmhvdmVyID09PSBIb3Zlck1vZGUuUElDS18yRCB8fCBmbGFncy5kZXNpZ25Nb2RlICkge1xuICAgICAgICBpZiAoIGZsYWdzLmRlc2lnbk1vZGUgJiYgaG92ZXJTdGF0ZS5sYXN0RGVzaWduTm9kZSApIHJldHVybjtcbiAgICAgICAgbGV0IG5vZGUgPSBldmVudC50YXJnZXQ7XG4gICAgICAgIGlmICggZmxhZ3MuZGVzaWduTW9kZSApIG5vZGUgPSBub2Rlc0J5SWRbIGZsYWdzLmxvY2tEcmFnTm9kZSBhcyBzdHJpbmcgXSB8fCBub2RlO1xuICAgICAgICBkcmF3UmVjdCggbm9kZS51dWlkICk7XG4gICAgICAgIGhvdmVyU3RhdGUubGFzdEhvdmVyTm9kZSA9IG5vZGU7XG4gICAgICAgIGV2ZW50LnByb3BhZ2F0aW9uU3RvcHBlZCA9IHRydWU7XG4gICAgICAgIGV2ZW50LnByb3BhZ2F0aW9uSW1tZWRpYXRlU3RvcHBlZCA9IHRydWU7XG4gICAgfVxufVxuXG4vKiogTW91c2UgbW92ZTogZGVzaWduLW1vZGUgZHJhZyB3aGVuIGEgZHJhZyBpcyBpbiBwcm9ncmVzcywgb3RoZXJ3aXNlIDNEIGhvdmVyIHBpY2tpbmcuICovXG5mdW5jdGlvbiBvbk1vdXNlTW92ZSggZXZlbnQ6IGFueSApOiB2b2lkIHtcbiAgICBpZiAoIGZsYWdzLmRlc2lnbk1vZGUgJiYgaG92ZXJTdGF0ZS5kcmFnZ2luZyApIHtcbiAgICAgICAgY29uc3Qgbm9kZSA9IGhvdmVyU3RhdGUubGFzdERlc2lnbk5vZGU7XG4gICAgICAgIGlmICggIW5vZGU/LmlzVmFsaWQgKSByZXR1cm47XG4gICAgICAgIGNvbnN0IGRlbHRhID0gdWlEZWx0YSggZXZlbnQgKTtcbiAgICAgICAgY29uc3QgcG9zaXRpb24gPSBub2RlLnBvc2l0aW9uO1xuICAgICAgICBpZiAoICFwb3NpdGlvbiApIHJldHVybjtcbiAgICAgICAgcG9zaXRpb24uYWRkM2YoIGRlbHRhLngsIGRlbHRhLnksIDAgKTtcbiAgICAgICAgbm9kZS5zZXRQb3NpdGlvbiggcG9zaXRpb24gKTtcbiAgICAgICAgZXZlbnQucHJvcGFnYXRpb25TdG9wcGVkID0gdHJ1ZTtcbiAgICAgICAgZXZlbnQucHJvcGFnYXRpb25JbW1lZGlhdGVTdG9wcGVkID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoIGZsYWdzLmhvdmVyICE9PSBIb3Zlck1vZGUuUElDS18zRCApIHJldHVybjtcbiAgICBpZiAoICFob3ZlclN0YXRlLnJheSApIGhvdmVyU3RhdGUucmF5ID0gbmV3IGNjLmdlb21ldHJ5LlJheSgpO1xuICAgIGNvbnN0IGNhbWVyYSA9IGNjLmRpcmVjdG9yLmdldFNjZW5lKCkuZ2V0Q29tcG9uZW50SW5DaGlsZHJlbiggY2MuQ2FtZXJhQ29tcG9uZW50ICk7XG4gICAgY29uc3QgbG9jYXRpb24gPSBldmVudC5nZXRMb2NhdGlvbigpO1xuICAgIGNhbWVyYS5zY3JlZW5Qb2ludFRvUmF5KCBsb2NhdGlvbi54LCBsb2NhdGlvbi55LCBob3ZlclN0YXRlLnJheSApO1xuICAgIGNvbnN0IGhpdCA9IGNjLmRpcmVjdG9yLmdldFNjZW5lKClcbiAgICAgICAgLmdldENvbXBvbmVudHNJbkNoaWxkcmVuKCBjYy5Nb2RlbENvbXBvbmVudCB8fCAnY2MuTWVzaFJlbmRlcmVyJyApXG4gICAgICAgIC5maWx0ZXIoICggbW9kZWw6IGFueSApID0+IG1vZGVsLm1vZGVsICYmIG1vZGVsLm5vZGUuYWN0aXZlSW5IaWVyYXJjaHkgKVxuICAgICAgICAubWFwKCAoIG1vZGVsOiBhbnkgKSA9PiBbIG1vZGVsLCBjYy5nZW9tZXRyeS5pbnRlcnNlY3QucmF5TW9kZWwoIGhvdmVyU3RhdGUucmF5LCBtb2RlbC5tb2RlbCApIF0gKVxuICAgICAgICAuZmlsdGVyKCAoIGVudHJ5OiBhbnlbXSApID0+IGVudHJ5WyAxIF0gPiAwIClcbiAgICAgICAgLnNvcnQoICggYTogYW55W10sIGI6IGFueVtdICkgPT4gYVsgMSBdIC0gYlsgMSBdIClbIDAgXTtcbiAgICBpZiAoIGhpdCApIHtcbiAgICAgICAgaG92ZXJTdGF0ZS5sYXN0SG92ZXJOb2RlID0gaGl0WyAwIF0ubm9kZTtcbiAgICAgICAgZHJhd1JlY3QoIGhvdmVyU3RhdGUubGFzdEhvdmVyTm9kZS51dWlkICk7XG4gICAgfVxufVxuXG4vKiogQ2xpY2svdGFwIGNvbW1pdDogbG9jYXRlIHRoZSBob3ZlcmVkIG5vZGUgaW4gdGhlIGluc3BlY3RvciB0cmVlLiAqL1xuZnVuY3Rpb24gb25QaWNrQ29tbWl0KCBldmVudDogYW55ICk6IHZvaWQge1xuICAgIGlmICggIWZsYWdzLmhvdmVyICYmICFmbGFncy5kZXNpZ25Nb2RlICkgcmV0dXJuO1xuICAgIGlmICggZmxhZ3MuaG92ZXIgJiYgaG92ZXJTdGF0ZS5sYXN0SG92ZXJOb2RlICkge1xuICAgICAgICBjb25zdCB7IHV1aWRQYXRoIH0gPSBnZXRQYXRoKCBob3ZlclN0YXRlLmxhc3RIb3Zlck5vZGUgKTtcbiAgICAgICAgbG9jYXRlTm9kZSggdXVpZFBhdGggKTtcbiAgICB9XG4gICAgaWYgKCBmbGFncy5kZXNpZ25Nb2RlICYmIGhvdmVyU3RhdGUubGFzdERlc2lnbk5vZGUgKSB7XG4gICAgICAgIGNvbnN0IHsgdXVpZFBhdGggfSA9IGdldFBhdGgoIGhvdmVyU3RhdGUubGFzdERlc2lnbk5vZGUgKTtcbiAgICAgICAgbG9jYXRlTm9kZSggdXVpZFBhdGggKTtcbiAgICAgICAgZHJhd1JlY3QoIGhvdmVyU3RhdGUubGFzdERlc2lnbk5vZGUudXVpZCApO1xuICAgICAgICBob3ZlclN0YXRlLmxhc3REZXNpZ25Ob2RlID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKCBldmVudCApIHtcbiAgICAgICAgZXZlbnQucHJvcGFnYXRpb25TdG9wcGVkID0gdHJ1ZTtcbiAgICAgICAgZXZlbnQucHJvcGFnYXRpb25JbW1lZGlhdGVTdG9wcGVkID0gdHJ1ZTtcbiAgICB9XG59XG5cbi8qKiBQaWNrcyB1cCB0aGUgY3VycmVudGx5IGhvdmVyZWQgbm9kZSBmb3IgZHJhZ2dpbmcsIGRpc2FibGluZyBsYXlvdXQvd2lkZ2V0IHRoYXQgd291bGQgZmlnaHQgaXQuICovXG5mdW5jdGlvbiBiZWdpbkRlc2lnbkRyYWcoKTogdm9pZCB7XG4gICAgaG92ZXJTdGF0ZS5sYXN0RGVzaWduTm9kZSA9IGhvdmVyU3RhdGUubGFzdEhvdmVyTm9kZTtcbiAgICBjb25zdCBub2RlID0gaG92ZXJTdGF0ZS5sYXN0RGVzaWduTm9kZTtcbiAgICBpZiAoIG5vZGUgJiYgbm9kZS5pc1ZhbGlkICkge1xuICAgICAgICBjb25zdCBwYXJlbnRMYXlvdXQgPSBub2RlLnBhcmVudD8uZ2V0Q29tcG9uZW50KCBjYy5MYXlvdXRDb21wb25lbnQgKTtcbiAgICAgICAgaWYgKCBwYXJlbnRMYXlvdXQgKSBwYXJlbnRMYXlvdXQuZW5hYmxlZCA9IGZhbHNlO1xuICAgICAgICBjb25zdCB3aWRnZXQgPSBub2RlLmdldENvbXBvbmVudCggY2MuV2lkZ2V0Q29tcG9uZW50ICk7XG4gICAgICAgIGlmICggd2lkZ2V0ICkgd2lkZ2V0LmVuYWJsZWQgPSBmYWxzZTtcbiAgICB9XG59XG5cbi8qKiBEZXNpZ24tbW9kZSBkcmFnIG9uIHRvdWNoIGRldmljZXM6IFRPVUNIX1NUQVJUIHBpY2tzIHVwLCBUT1VDSF9NT1ZFIGRyYWdzLCBUT1VDSF9DQU5DRUwgY29tbWl0cy4gKi9cbmZ1bmN0aW9uIG9uRGVzaWduVG91Y2goIGV2ZW50OiBhbnkgKTogdm9pZCB7XG4gICAgaWYgKCAhZmxhZ3MuaG92ZXIgJiYgIWZsYWdzLmRlc2lnbk1vZGUgKSByZXR1cm47XG4gICAgZXZlbnQucHJvcGFnYXRpb25TdG9wcGVkID0gdHJ1ZTtcbiAgICBldmVudC5wcm9wYWdhdGlvbkltbWVkaWF0ZVN0b3BwZWQgPSB0cnVlO1xuICAgIGlmICggIWZsYWdzLmRlc2lnbk1vZGUgKSByZXR1cm47XG4gICAgY29uc3QgZXQgPSBnZXRFdmVudFR5cGVzKCk7XG4gICAgc3dpdGNoICggZXZlbnQudHlwZSApIHtcbiAgICAgICAgY2FzZSBldC5UT1VDSF9TVEFSVDpcbiAgICAgICAgICAgIGJlZ2luRGVzaWduRHJhZygpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgZXQuVE9VQ0hfTU9WRToge1xuICAgICAgICAgICAgaWYgKCAhaG92ZXJTdGF0ZS5sYXN0RGVzaWduTm9kZT8uaXNWYWxpZCApIHJldHVybjtcbiAgICAgICAgICAgIGNvbnN0IGRlbHRhID0gdWlEZWx0YSggZXZlbnQgKTtcbiAgICAgICAgICAgIGNvbnN0IHBvc2l0aW9uID0gaG92ZXJTdGF0ZS5sYXN0RGVzaWduTm9kZT8ucG9zaXRpb247XG4gICAgICAgICAgICBpZiAoICFwb3NpdGlvbiApIGJyZWFrO1xuICAgICAgICAgICAgcG9zaXRpb24uYWRkM2YoIGRlbHRhLngsIGRlbHRhLnksIDAgKTtcbiAgICAgICAgICAgIGhvdmVyU3RhdGUubGFzdERlc2lnbk5vZGU/LnNldFBvc2l0aW9uKCBwb3NpdGlvbiApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgY2FzZSBldC5UT1VDSF9DQU5DRUw6XG4gICAgICAgICAgICBvblBpY2tDb21taXQoIHVuZGVmaW5lZCApO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgfVxufVxuIiwgIi8vIE5vZGUgZGV0YWlsIHNlcmlhbGl6YXRpb24gKGluc3BlY3RvciByaWdodCBwYW5lbCkgYW5kIGNvbXBvbmVudCBwcm9wZXJ0eSBlZGl0aW5nLlxuaW1wb3J0IHsgbm9kZXNCeUlkLCBmbGFncywgdHJlZVN0YXRlLCBkZXRhaWxTdGF0ZSB9IGZyb20gJy4vc3RhdGUnO1xuaW1wb3J0IHsgZ2V0U2NoZWR1bGUgfSBmcm9tICcuL2VuZ2luZS1jb21wYXQnO1xuaW1wb3J0IHsgZ2V0UGF0aCB9IGZyb20gJy4vbm9kZS1wYXRoJztcbmltcG9ydCB7IGdldEdvYmpOYW1lLCByZWFkeVVwZGF0ZVRyZWUgfSBmcm9tICcuL3RyZWUnO1xuXG4vKiogbm9kZSBpbnRlcm5hbHMgaGlkZGVuIGZyb20gdGhlIGRldGFpbCBwYW5lbCBpbiBidWlsdCBnYW1lcyAqL1xuY29uc3QgQlVJTERfRklMVEVSOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuICAgIF9wcmVmYWI6ICcnLFxuICAgIF92aXNGbGFnczogJycsXG4gICAgX2VkaXRvckV4dHJhc19fOiAnJyxcbiAgICBfX3ByZWZhYjogJycsXG4gICAgX25hbWU6ICcnLFxuICAgIF9vYmpGbGFnczogJycsXG4gICAgX3NjcmlwdEFzc2V0OiAnJyxcbn07XG5cbi8qKiBaZXJvLWFyZyBwdWJsaWMgbWV0aG9kcyBvZiBhIGNvbXBvbmVudCwgb2ZmZXJlZCBhcyBjbGlja2FibGUgYWN0aW9ucyBpbiB0aGUgcGFuZWwuICovXG5mdW5jdGlvbiBnZXRDb21wb25lbnRNZXRob2ROYW1lcyggY29tcDogYW55ICk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBrZXlzID0gT2JqZWN0LmtleXMoIGNvbXAuX19wcm90b19fICk7XG4gICAgcmV0dXJuIGtleXMuZmlsdGVyKCAoIGtleSApID0+IHtcbiAgICAgICAgaWYgKCBrZXkgaW4gY2MuUmVuZGVyYWJsZUNvbXBvbmVudC5wcm90b3R5cGUgfHwga2V5LnN0YXJ0c1dpdGgoICdfJyApIHx8IGtleS5zdGFydHNXaXRoKCAnZ2V0JyApICkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBjb25zdCB2YWx1ZSA9IGNvbXBbIGtleSBdO1xuICAgICAgICByZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICYmIHZhbHVlLmxlbmd0aCA9PT0gMCAmJiB2YWx1ZS5uYW1lICE9PSAnd2Fybic7XG4gICAgfSApO1xufVxuXG50eXBlIFNlcmlhbGl6ZWRQcm9wID0gWyB1bmtub3duLCBzdHJpbmcgXSB8IFsgdW5rbm93biwgc3RyaW5nLCB1bmtub3duIF07XG5cbi8qKiBTZXJpYWxpemVzIG9uZSBjb21wb25lbnQgKG9yIHRoZSBmZ3VpICRnb2JqIHBzZXVkby1jb21wb25lbnQpIHRvIFt2YWx1ZSwgdHlwZV0gcGFpcnMuICovXG5mdW5jdGlvbiBzZXJpYWxpemVDb21wb25lbnQoIGNvbXA6IGFueSApOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG4gICAgY29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCBhbnk+ID0ge307XG4gICAgY29uc3QgcHJvcE5hbWVzOiBzdHJpbmdbXSA9IGNvbXAgaW5zdGFuY2VvZiBjYy5Db21wb25lbnQgPyBjb21wLmNvbnN0cnVjdG9yLl9fcHJvcHNfXyA6IE9iamVjdC5rZXlzKCBjb21wICk7XG4gICAgZm9yICggbGV0IHByb3BOYW1lIG9mIHByb3BOYW1lcyApIHtcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxOYW1lID0gcHJvcE5hbWU7XG4gICAgICAgIGlmICggY29tcCBpbnN0YW5jZW9mIGNjLkNvbXBvbmVudCApIHtcbiAgICAgICAgICAgIGlmICggQ0NfUFJFVklFVyAmJiBwcm9wTmFtZS5zdGFydHNXaXRoKCAnXycgKSApIGNvbnRpbnVlO1xuICAgICAgICAgICAgaWYgKCBwcm9wTmFtZS5zdGFydHNXaXRoKCAnXycgKSAmJiBjb21wWyBwcm9wTmFtZSBdID09PSBjb21wWyBwcm9wTmFtZS5zbGljZSggMSApIF0gKSB7XG4gICAgICAgICAgICAgICAgcHJvcE5hbWUgPSBwcm9wTmFtZS5zbGljZSggMSApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3V0LmlzQ0NfQ09NID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG91dC5pc0NDX0NPTSA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIGlmICggQ0NfQlVJTEQgJiYgcHJvcE5hbWUgaW4gQlVJTERfRklMVEVSICkgY29udGludWU7XG4gICAgICAgIGlmICggISggcHJvcE5hbWUgaW4geyBuYW1lOiAnJywgdXVpZDogJycsIGVuYWJsZWQ6ICcnIH0gKSAmJiBwcm9wTmFtZSBpbiBjYy5Db21wb25lbnQucHJvdG90eXBlICkgY29udGludWU7XG5cbiAgICAgICAgbGV0IHZhbHVlID0gY29tcFsgcHJvcE5hbWUgXTtcbiAgICAgICAgaWYgKCB2YWx1ZSA9PT0gbnVsbCApIHZhbHVlID0gJ251bGwnO1xuICAgICAgICBpZiAoIHZhbHVlID09PSB1bmRlZmluZWQgKSB2YWx1ZSA9ICd1bmRlZmluZWQnO1xuICAgICAgICBjb25zdCB2YWx1ZVR5cGUgPSB0eXBlb2YgdmFsdWU7XG4gICAgICAgIGlmICggdmFsdWVUeXBlICE9PSAnZnVuY3Rpb24nICYmIHZhbHVlVHlwZSAhPT0gJ29iamVjdCcgKSB7XG4gICAgICAgICAgICBjb25zdCBhdHRycyA9IGNvbXAuY29uc3RydWN0b3IuX19hdHRyc19fO1xuICAgICAgICAgICAgY29uc3QgaXNFbnVtID0gYXR0cnMgJiYgKCBhdHRyc1sgYCR7IHByb3BOYW1lIH0kXyR0eXBlYCBdID09PSAnRW51bScgfHwgYXR0cnNbIGAkeyBvcmlnaW5hbE5hbWUgfSRfJHR5cGVgIF0gPT09ICdFbnVtJyApO1xuICAgICAgICAgICAgaWYgKCBpc0VudW0gKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZW51bUxpc3QgPSBhdHRyc1sgYCR7IHByb3BOYW1lIH0kXyRlbnVtTGlzdGAgXSB8fCBhdHRyc1sgYCR7IG9yaWdpbmFsTmFtZSB9JF8kZW51bUxpc3RgIF07XG4gICAgICAgICAgICAgICAgb3V0WyBwcm9wTmFtZSBdID0gWyBlbnVtTGlzdC5maW5kKCAoIGVudHJ5OiBhbnkgKSA9PiBlbnRyeS52YWx1ZSA9PT0gdmFsdWUgKSwgJ2VudW0nLCBlbnVtTGlzdCBdIGFzIFNlcmlhbGl6ZWRQcm9wO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBvdXRbIHByb3BOYW1lIF0gPSBbIHZhbHVlLCB2YWx1ZVR5cGUgXSBhcyBTZXJpYWxpemVkUHJvcDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmICggdmFsdWUgaW5zdGFuY2VvZiBjYy5Db21wb25lbnQgKSB7XG4gICAgICAgICAgICAgICAgaWYgKCAhdmFsdWUubm9kZSApIG91dFsgcHJvcE5hbWUgXSA9IGAkeyBjYy5qcy5nZXRDbGFzc05hbWUoIHZhbHVlICkgfTpAJHsgdmFsdWUudXVpZCB9YDtcbiAgICAgICAgICAgICAgICBjb25zdCB7IHV1aWRQYXRoIH0gPSBnZXRQYXRoKCB2YWx1ZS5ub2RlICk7XG4gICAgICAgICAgICAgICAgb3V0WyBwcm9wTmFtZSBdID0gYCR7IGNjLmpzLmdldENsYXNzTmFtZSggdmFsdWUgKSB9OkAkeyB2YWx1ZS5ub2RlID8gdmFsdWUubm9kZS5uYW1lIDogdmFsdWUubm9kZSB9fCR7IHV1aWRQYXRoLmpvaW4oICcvLycgKSB9YDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIHZhbHVlIGluc3RhbmNlb2YgY2MuQXNzZXQgKSB7XG4gICAgICAgICAgICAgICAgb3V0WyBwcm9wTmFtZSBdID0gYCR7IGNjLmpzLmdldENsYXNzTmFtZSggdmFsdWUgKS5zbGljZSggMyApIH06QCR7IHZhbHVlLm5hbWUgfXx8JHsgdmFsdWUuX3V1aWQgfWA7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCB2YWx1ZSBpbnN0YW5jZW9mIGNjLkNvbG9yICkge1xuICAgICAgICAgICAgICAgIG91dFsgcHJvcE5hbWUgXSA9IGAjJHsgdmFsdWUudG9IRVgoICcjcnJnZ2JiJyApIH1gO1xuICAgICAgICAgICAgfSBlbHNlIGlmICggdmFsdWUgaW5zdGFuY2VvZiBjYy5WYWx1ZVR5cGUgKSB7XG4gICAgICAgICAgICAgICAgb3V0WyBwcm9wTmFtZSBdID0gYCR7IHZhbHVlLmNvbnN0cnVjdG9yLm5hbWUgfTokeyB2YWx1ZS50b1N0cmluZygpIH1gO1xuICAgICAgICAgICAgfSBlbHNlIGlmICggdmFsdWUuY29uc3RydWN0b3IgPT09IGNjLk5vZGUgKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgeyB1dWlkUGF0aCB9ID0gZ2V0UGF0aCggdmFsdWUgKTtcbiAgICAgICAgICAgICAgICBpZiAoIHByb3BOYW1lICE9PSAnbm9kZScgKSBvdXRbIHByb3BOYW1lIF0gPSBgTm9kZTpAJHsgdmFsdWUubmFtZSB9fCR7IHV1aWRQYXRoLmpvaW4oICcvLycgKSB9YDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoICEoIHZhbHVlIGluc3RhbmNlb2YgRnVuY3Rpb24gKSApIHtcbiAgICAgICAgICAgICAgICBpZiAoICggd2luZG93IGFzIGFueSApLmZndWkgJiYgdmFsdWUgaW5zdGFuY2VvZiBmZ3VpLkdPYmplY3QgKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHsgdXVpZFBhdGggfSA9IGdldFBhdGgoIHZhbHVlLm5vZGUgKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCBwcm9wTmFtZSAhPT0gJ25vZGUnICkgb3V0WyBwcm9wTmFtZSBdID0gYE5vZGU6QCR7IGdldEdvYmpOYW1lKCB2YWx1ZSApIH18JHsgdXVpZFBhdGguam9pbiggJy8vJyApIH1gO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG91dFsgcHJvcE5hbWUgXSA9IGAkJHsgdmFsdWUuY29uc3RydWN0b3IgPyB2YWx1ZS5jb25zdHJ1Y3Rvci5uYW1lIDogJ29iamVjdCcgfWA7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3V0WyBwcm9wTmFtZSBdID0gWyBvdXRbIHByb3BOYW1lIF0sIHZhbHVlIGluc3RhbmNlb2YgY2MuQ29sb3IgPyAnY29sb3InIDogJ29iamVjdCcgXSBhcyBTZXJpYWxpemVkUHJvcDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBwcnVuZUlycmVsZXZhbnRQcm9wcyggY29tcCwgb3V0ICk7XG4gICAgb3V0Lm5hbWUgPSBjb21wLm5hbWU7XG4gICAgb3V0LnV1aWQgPSBjb21wLnV1aWQ7XG4gICAgb3V0LmVuYWJsZWQgPSBjb21wLmVuYWJsZWQ7XG4gICAgdHJ5IHtcbiAgICAgICAgb3V0Ll9fbWV0aG9kc19fXyA9IGdldENvbXBvbmVudE1ldGhvZE5hbWVzKCBjb21wICk7XG4gICAgfSBjYXRjaCB7XG4gICAgICAgIG91dC5fX21ldGhvZHNfX18gPSBbXTtcbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbn1cblxuLyoqIEhpZGVzIHByb3BlcnRpZXMgdGhhdCBhcmUgbWVhbmluZ2xlc3MgZm9yIHRoZSBjb21wb25lbnQncyBjdXJyZW50IG1vZGUuICovXG5mdW5jdGlvbiBwcnVuZUlycmVsZXZhbnRQcm9wcyggY29tcDogYW55LCBvdXQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ICk6IHZvaWQge1xuICAgIGlmICggY29tcCBpbnN0YW5jZW9mIGNjLkJ1dHRvbkNvbXBvbmVudCApIHtcbiAgICAgICAgaWYgKCBjb21wLnRyYW5zaXRpb24gIT09IGNjLkJ1dHRvbkNvbXBvbmVudC5UcmFuc2l0aW9uLlNQUklURSApIHtcbiAgICAgICAgICAgIGRlbGV0ZSBvdXQuaG92ZXJTcHJpdGU7IGRlbGV0ZSBvdXQucHJlc3NlZFNwcml0ZTsgZGVsZXRlIG91dC5kaXNhYmxlZFNwcml0ZTsgZGVsZXRlIG91dC5ub3JtYWxTcHJpdGU7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCBjb21wLnRyYW5zaXRpb24gIT09IGNjLkJ1dHRvbi5UcmFuc2l0aW9uLkNPTE9SICkge1xuICAgICAgICAgICAgZGVsZXRlIG91dC5ob3ZlckNvbG9yOyBkZWxldGUgb3V0LnByZXNzZWRDb2xvcjsgZGVsZXRlIG91dC5kaXNhYmxlZENvbG9yOyBkZWxldGUgb3V0Lm5vcm1hbENvbG9yO1xuICAgICAgICB9XG4gICAgICAgIGlmICggY29tcC50cmFuc2l0aW9uICE9PSBjYy5CdXR0b24uVHJhbnNpdGlvbi5TQ0FMRSApIGRlbGV0ZSBvdXQuem9vbVNjYWxlO1xuICAgIH1cbiAgICBpZiAoIGNvbXAgaW5zdGFuY2VvZiBjYy5TcHJpdGVDb21wb25lbnQgJiYgY29tcC50eXBlICE9PSBjYy5TcHJpdGVDb21wb25lbnQuVHlwZS5GSUxMRUQgKSB7XG4gICAgICAgIGRlbGV0ZSBvdXQuZmlsbFR5cGU7IGRlbGV0ZSBvdXQuZmlsbFJhbmdlOyBkZWxldGUgb3V0LmZpbGxTdGFydDsgZGVsZXRlIG91dC5maWxsQ2VudGVyO1xuICAgIH1cbiAgICBpZiAoIGNvbXAgaW5zdGFuY2VvZiBjYy5MYXlvdXRDb21wb25lbnQgKSB7XG4gICAgICAgIGlmICggY29tcC50eXBlID09PSBjYy5MYXlvdXRDb21wb25lbnQuVHlwZS5OT05FICkge1xuICAgICAgICAgICAgZGVsZXRlIG91dC52ZXJ0aWNhbERpcmVjdGlvbjsgZGVsZXRlIG91dC5zdGFydEF4aXM7IGRlbGV0ZSBvdXQuc3BhY2luZ1g7IGRlbGV0ZSBvdXQuc3BhY2luZ1k7XG4gICAgICAgICAgICBkZWxldGUgb3V0Lmhvcml6b250YWxEaXJlY3Rpb247IGRlbGV0ZSBvdXQuY2VsbFNpemU7XG4gICAgICAgICAgICBpZiAoIGNvbXAucmVzaXplTW9kZSA9PT0gY2MuTGF5b3V0Q29tcG9uZW50LlJlc2l6ZU1vZGUuTk9ORSApIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgb3V0LnBhZGRpbmdCb3R0b207IGRlbGV0ZSBvdXQucGFkZGluZ1RvcDsgZGVsZXRlIG91dC5wYWRkaW5nTGVmdDsgZGVsZXRlIG91dC5wYWRkaW5nUmlnaHQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCBjb21wLnR5cGUgPT09IGNjLkxheW91dENvbXBvbmVudC5UeXBlLkhPUklaT05UQUwgKSB7XG4gICAgICAgICAgICBkZWxldGUgb3V0LnNwYWNpbmdZOyBkZWxldGUgb3V0LnZlcnRpY2FsRGlyZWN0aW9uOyBkZWxldGUgb3V0LnBhZGRpbmdCb3R0b207IGRlbGV0ZSBvdXQucGFkZGluZ1RvcDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIGNvbXAudHlwZSA9PT0gY2MuTGF5b3V0Q29tcG9uZW50LlR5cGUuVkVSVElDQUwgKSB7XG4gICAgICAgICAgICBkZWxldGUgb3V0LnNwYWNpbmdYOyBkZWxldGUgb3V0Lmhvcml6b250YWxEaXJlY3Rpb247IGRlbGV0ZSBvdXQucGFkZGluZ0xlZnQ7IGRlbGV0ZSBvdXQucGFkZGluZ1JpZ2h0O1xuICAgICAgICB9XG4gICAgICAgIGlmICggY29tcC5yZXNpemVNb2RlICE9PSBjYy5MYXlvdXRDb21wb25lbnQuUmVzaXplTW9kZS5DSElMRFJFTiApIGRlbGV0ZSBvdXQuY2VsbFNpemU7XG4gICAgICAgIGlmICggY29tcC50eXBlICE9PSBjYy5MYXlvdXRDb21wb25lbnQuVHlwZS5HUklEICkgZGVsZXRlIG91dC5zdGFydEF4aXM7XG4gICAgfVxuICAgIGlmICggY29tcCBpbnN0YW5jZW9mIGNjLldpZGdldENvbXBvbmVudCApIHtcbiAgICAgICAgZGVsZXRlIG91dC5pc1N0cmV0Y2hIZWlnaHQ7IGRlbGV0ZSBvdXQuaXNTdHJldGNoV2lkdGg7XG4gICAgICAgIGRlbGV0ZSBvdXQuaXNBYnNvbHV0ZUhvcml6b250YWxDZW50ZXI7IGRlbGV0ZSBvdXQuaXNBYnNvbHV0ZVZlcnRpY2FsQ2VudGVyO1xuICAgICAgICBkZWxldGUgb3V0LmlzQWJzb2x1dGVUb3A7IGRlbGV0ZSBvdXQuaXNBYnNvbHV0ZUJvdHRvbTsgZGVsZXRlIG91dC5pc0Fic29sdXRlUmlnaHQ7IGRlbGV0ZSBvdXQuaXNBYnNvbHV0ZUxlZnQ7XG4gICAgICAgIGZvciAoIGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyggb3V0ICkgKSB7XG4gICAgICAgICAgICBpZiAoIGtleS5zdGFydHNXaXRoKCAnZWRpdG9yJyApICkgZGVsZXRlIG91dFsga2V5IF07XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXROb2RlRGV0YWlsKCBub2RlSWQ6IHN0cmluZywgaW5jbHVkZUNvbXBzID0gdHJ1ZSApOiB2b2lkIHtcbiAgICBpZiAoICFkZXRhaWxTdGF0ZS5mY29tICYmICggd2luZG93IGFzIGFueSApLmZndWkgKSBkZXRhaWxTdGF0ZS5mY29tID0gbmV3IGZndWkuR0NvbXBvbmVudCgpO1xuICAgIGNvbnN0IG5vZGUgPSBub2Rlc0J5SWRbIG5vZGVJZCBdO1xuICAgIGlmICggIW5vZGUgKSByZXR1cm47XG4gICAgZGV0YWlsU3RhdGUubGFzdERldGFpbE5vZGUgPSBub2RlO1xuICAgIGNvbnN0IGRldGFpbDogUmVjb3JkPHN0cmluZywgYW55PiA9IHtcbiAgICAgICAgaWQ6IG5vZGVJZCxcbiAgICAgICAgYWN0aXZlOiBub2RlLmFjdGl2ZSxcbiAgICAgICAgbmFtZTogbm9kZS5uYW1lLFxuICAgICAgICBwb3NpdGlvbjogbm9kZS5wb3NpdGlvbixcbiAgICAgICAgc2NhbGU6IG5vZGUuc2NhbGUsXG4gICAgICAgIGV1bGVyQW5nbGVzOiBub2RlLmV1bGVyQW5nbGVzLFxuICAgICAgICBvcGFjaXR5OiBub2RlLl91aVByb3BzLm9wYWNpdHksXG4gICAgICAgIGxheWVyOiBjYy5MYXllcnMuRW51bVsgbm9kZS5sYXllciBdIHx8IG5vZGUubGF5ZXIsXG4gICAgfTtcbiAgICBpZiAoIGluY2x1ZGVDb21wcyApIHtcbiAgICAgICAgLy8gZmd1aSBub2RlcyBleHBvc2UgdGhlaXIgR09iamVjdCBhcyBhIHBzZXVkby1jb21wb25lbnQgYWhlYWQgb2YgdGhlIGNjIGNvbXBvbmVudHNcbiAgICAgICAgbGV0IGdvYmpQc2V1ZG9Db21wOiBhbnkgPSBudWxsO1xuICAgICAgICBpZiAoIG5vZGUuJGdvYmogKSB7XG4gICAgICAgICAgICBjb25zdCBnb2JqID0gbm9kZS4kZ29iajtcbiAgICAgICAgICAgIGNvbnN0IGZpbHRlcmVkOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IE9iamVjdC5hc3NpZ24oIHt9LCBnb2JqICk7XG4gICAgICAgICAgICBmb3IgKCBjb25zdCBrZXkgaW4gZGV0YWlsU3RhdGUuZmNvbSApIGRlbGV0ZSBmaWx0ZXJlZFsga2V5IF07XG4gICAgICAgICAgICBmaWx0ZXJlZC5uYW1lID0gZ29iai5jb25zdHJ1Y3Rvci5uYW1lO1xuICAgICAgICAgICAgZ29ialBzZXVkb0NvbXAgPSBmaWx0ZXJlZDtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjb21wcyA9IG5vZGUuX2NvbXBvbmVudHMuY29uY2F0KCk7XG4gICAgICAgIGlmICggZ29ialBzZXVkb0NvbXAgKSBjb21wcy51bnNoaWZ0KCBnb2JqUHNldWRvQ29tcCApO1xuICAgICAgICBkZXRhaWwuY29tcyA9IGNvbXBzLm1hcCggc2VyaWFsaXplQ29tcG9uZW50ICk7XG4gICAgICAgIGNvbXBzLmxlbmd0aCA9IDA7XG4gICAgfVxuICAgIGRldGFpbC5pbmNsdWRlQ29tcHMgPSBpbmNsdWRlQ29tcHM7XG4gICAgc2hvd05vZGVEZXRhaWwoIGRldGFpbCApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2V0Q29tQXR0ciggbm9kZUlkOiBzdHJpbmcsIGNvbXBVdWlkOiBzdHJpbmcsIHByb3BOYW1lOiBzdHJpbmcsIHZhbHVlOiBhbnkgKTogdm9pZCB7XG4gICAgY29uc3Qgbm9kZSA9IG5vZGVzQnlJZFsgbm9kZUlkIF07XG4gICAgaWYgKCAhbm9kZSApIHJldHVybjtcbiAgICBjb25zdCBjb21wID0gbm9kZS5fY29tcG9uZW50cy5maW5kKCAoIGVudHJ5OiBhbnkgKSA9PiBlbnRyeS51dWlkID09PSBjb21wVXVpZCApO1xuICAgIGlmICggIWNvbXAgKSByZXR1cm47XG4gICAgaWYgKCBjb21wWyBwcm9wTmFtZSBdIGluc3RhbmNlb2YgY2MuQ29sb3IgKSB2YWx1ZSA9IGNjLkNvbG9yLkJMQUNLLmNsb25lKCkuZnJvbUhFWCggdmFsdWUgKTtcbiAgICBjb21wWyBwcm9wTmFtZSBdID0gdmFsdWU7XG4gICAgaWYgKCB0cmVlU3RhdGUuZGNNb2RlICkgcmVhZHlVcGRhdGVUcmVlKCk7XG4gICAgLy8gY2hhbmdpbmcgYSBidXR0b24ncyB0cmFuc2l0aW9uIGNoYW5nZXMgd2hpY2ggcHJvcGVydGllcyBhcmUgcmVsZXZhbnQgLSByZWZyZXNoIHRoZSBwYW5lbFxuICAgIGlmICggY29tcCBpbnN0YW5jZW9mIGNjLkJ1dHRvbkNvbXBvbmVudCAmJiBwcm9wTmFtZSA9PT0gJ3RyYW5zaXRpb24nICkgZ2V0Tm9kZURldGFpbCggbm9kZUlkICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleGVjQ29tcE1ldGhvZCggbm9kZUlkOiBzdHJpbmcsIGNvbXBVdWlkOiBzdHJpbmcsIG1ldGhvZE5hbWU6IHN0cmluZyApOiB2b2lkIHtcbiAgICBjb25zdCBub2RlID0gbm9kZXNCeUlkWyBub2RlSWQgXTtcbiAgICBpZiAoICFub2RlICkgcmV0dXJuO1xuICAgIGNvbnN0IGNvbXAgPSBub2RlLl9jb21wb25lbnRzLmZpbHRlciggKCBlbnRyeTogYW55ICkgPT4gZW50cnkudXVpZCA9PT0gY29tcFV1aWQgKVsgMCBdO1xuICAgIGlmICggY29tcCAmJiBjb21wWyBtZXRob2ROYW1lIF0gKSBjb21wWyBtZXRob2ROYW1lIF0oKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZUNvbXAoIG5vZGVJZDogc3RyaW5nLCBjb21wVXVpZDogc3RyaW5nICk6IHZvaWQge1xuICAgIGNvbnN0IG5vZGUgPSBub2Rlc0J5SWRbIG5vZGVJZCBdO1xuICAgIGlmICggIW5vZGUgKSByZXR1cm47XG4gICAgY29uc3QgY29tcCA9IG5vZGUuX2NvbXBvbmVudHMuZmlsdGVyKCAoIGVudHJ5OiBhbnkgKSA9PiBlbnRyeS51dWlkID09PSBjb21wVXVpZCApWyAwIF07XG4gICAgaWYgKCBjb21wICkge1xuICAgICAgICBjb21wLmVuYWJsZWQgPSAhY29tcC5lbmFibGVkO1xuICAgICAgICBnZXROb2RlRGV0YWlsKCBub2RlSWQgKTtcbiAgICAgICAgaWYgKCB0cmVlU3RhdGUuZGNNb2RlICkgcmVhZHlVcGRhdGVUcmVlKCk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlQ29tcCggbm9kZUlkOiBzdHJpbmcsIGNvbXBVdWlkOiBzdHJpbmcgKTogdm9pZCB7XG4gICAgY29uc3Qgbm9kZSA9IG5vZGVzQnlJZFsgbm9kZUlkIF07XG4gICAgaWYgKCAhbm9kZSApIHJldHVybjtcbiAgICBjb25zdCBjb21wID0gbm9kZS5fY29tcG9uZW50cy5maWx0ZXIoICggZW50cnk6IGFueSApID0+IGVudHJ5LnV1aWQgPT09IGNvbXBVdWlkIClbIDAgXTtcbiAgICBpZiAoIGNvbXAgKSB7XG4gICAgICAgIG5vZGUucmVtb3ZlQ29tcG9uZW50KCBjb21wICk7XG4gICAgICAgIGdldFNjaGVkdWxlKCkuc2NoZWR1bGVPbmNlKCAoKSA9PiB7XG4gICAgICAgICAgICBnZXROb2RlRGV0YWlsKCBub2RlSWQgKTtcbiAgICAgICAgICAgIGlmICggdHJlZVN0YXRlLmRjTW9kZSApIHJlYWR5VXBkYXRlVHJlZSgpO1xuICAgICAgICB9ICk7XG4gICAgfVxufVxuXG4vKiogV3JpdGVzIGEgKHBvc3NpYmx5IGRvdHRlZCwgZS5nLiBcInBvc2l0aW9uLnhcIikgbm9kZSBwcm9wZXJ0eSBmcm9tIHRoZSBkZXRhaWwgcGFuZWwuICovXG5leHBvcnQgZnVuY3Rpb24gc3luY05vZGUoIG5vZGVJZDogc3RyaW5nLCBwcm9wUGF0aDogc3RyaW5nLCB2YWx1ZTogYW55ICk6IHZvaWQge1xuICAgIGNvbnN0IG5vZGUgPSBub2Rlc0J5SWRbIG5vZGVJZCBdO1xuICAgIGlmICggIW5vZGUgKSByZXR1cm47XG4gICAgdHJlZVN0YXRlLnN0b3BTeW5jRGV0YWlsT25lVGltZSA9IHRydWU7XG4gICAgY29uc3QgcGFydHMgPSBwcm9wUGF0aC5zcGxpdCggJy4nICk7XG4gICAgdmFsdWUgPSBOdW1iZXIoIHZhbHVlICk7XG4gICAgY29uc3QgY3VycmVudCA9IHBhcnRzLmxlbmd0aCA+IDEgPyBub2RlWyBwYXJ0c1sgMCBdIF1bIHBhcnRzWyAxIF0gXSA6IG5vZGVbIHByb3BQYXRoIF07XG4gICAgaWYgKCBjdXJyZW50ICE9PSB2YWx1ZSApIHtcbiAgICAgICAgaWYgKCBwYXJ0cy5sZW5ndGggPiAxICkge1xuICAgICAgICAgICAgbm9kZVsgcGFydHNbIDAgXSBdWyBwYXJ0c1sgMSBdIF0gPSB2YWx1ZTtcbiAgICAgICAgICAgIG5vZGVbIHBhcnRzWyAwIF0gXSA9IG5vZGVbIHBhcnRzWyAwIF0gXTsgLy8gcmVhc3NpZ24gdG8gdHJpZ2dlciB0aGUgZW5naW5lIHNldHRlclxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbm9kZVsgcHJvcFBhdGggXSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHRyZWVTdGF0ZS5zdG9wU3luY0RldGFpbE9uZVRpbWUgPSBmYWxzZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHN5bmNOb2RlQ29sb3IoIG5vZGVJZDogc3RyaW5nLCByZ2JhOiBudW1iZXJbXSApOiB2b2lkIHtcbiAgICBjb25zdCBub2RlID0gbm9kZXNCeUlkWyBub2RlSWQgXTtcbiAgICByZ2JhID0gcmdiYS5tYXAoICggY2hhbm5lbCApID0+IGNoYW5uZWwgKiAyNTUgKTtcbiAgICBpZiAoIG5vZGUgKSBub2RlLmNvbG9yID0gY2MuY29sb3IoIC4uLnJnYmEgKTtcbn1cblxuLyoqIERlYm91bmNlZCByZS1zZW5kIG9mIHRoZSBkZXRhaWwgcGFuZWwgd2hpbGUgXCJTeW5jIE5vZGUgRGV0YWlsXCIgaXMgZW5hYmxlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkeUdldE5vZGVEZXRhaWwoKTogdm9pZCB7XG4gICAgaWYgKCBkZXRhaWxTdGF0ZS5wZW5kaW5nRGV0YWlsRnVuICkgcmV0dXJuO1xuICAgIGlmICggdHJlZVN0YXRlLnN0b3BTeW5jRGV0YWlsT25lVGltZSApIHtcbiAgICAgICAgdHJlZVN0YXRlLnN0b3BTeW5jRGV0YWlsT25lVGltZSA9IGZhbHNlO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICggIWZsYWdzLnN5bmNOb2RlRGV0YWlsICkgcmV0dXJuO1xuICAgIGRldGFpbFN0YXRlLnBlbmRpbmdEZXRhaWxGdW4gPSAoKSA9PiB7XG4gICAgICAgIGRldGFpbFN0YXRlLnBlbmRpbmdEZXRhaWxGdW4gPSBudWxsO1xuICAgICAgICBpZiAoICFmbGFncy5zeW5jTm9kZURldGFpbCApIHJldHVybjtcbiAgICAgICAgZ2V0Tm9kZURldGFpbCggZGV0YWlsU3RhdGUubGFzdERldGFpbE5vZGUuX2lkLCBmYWxzZSApO1xuICAgIH07XG4gICAgZ2V0U2NoZWR1bGUoKS5zY2hlZHVsZU9uY2UoIGRldGFpbFN0YXRlLnBlbmRpbmdEZXRhaWxGdW4gKTtcbn1cbiIsICIvLyBTY2VuZS10cmVlIHNlcmlhbGl6YXRpb24gYW5kIGNoYW5nZSB0cmFja2luZy5cbmltcG9ydCB7IG5vZGVzQnlJZCwgZmxhZ3MsIGJyZWFrUG9pbnRzLCBvcGVuZWROb2RlcywgZG9ub3RBdXRvVXBkYXRlcywgbm9kZUxvZ3MsIHRyZWVTdGF0ZSwgZGV0YWlsU3RhdGUgfSBmcm9tICcuL3N0YXRlJztcbmltcG9ydCB7IGdldFNjaGVkdWxlIH0gZnJvbSAnLi9lbmdpbmUtY29tcGF0JztcbmltcG9ydCB7IG9uSG92ZXJOb2RlIH0gZnJvbSAnLi9ob3Zlcic7XG5pbXBvcnQgeyBnZXROb2RlRGV0YWlsLCByZWFkeUdldE5vZGVEZXRhaWwgfSBmcm9tICcuL25vZGUtZGV0YWlsJztcblxuY29uc3QgVFJFRV9VUERBVEVfVEhST1RUTEVfTVMgPSAyMDAwO1xuY29uc3QgVFJFRV9VUERBVEVfREVMQVlfUyA9IDAuMTtcbi8qKiBtYXJrZXIgZXZlbnQgdXNlZCBib3RoIGFzIGFuIHVwZGF0ZSB0cmlnZ2VyIGFuZCBhcyB0aGUgXCJhbHJlYWR5IGluc3RydW1lbnRlZFwiIHByb2JlICovXG5jb25zdCBNQVJLRVJfRVZFTlQgPSAnX19oYWhhX18nO1xuXG5sZXQgZXZlbnRUeXBlczogYW55ID0gbnVsbDtcbmxldCB3YXRjaGVkRXZlbnRzOiBhbnlbXSB8IG51bGwgPSBudWxsO1xuXG5mdW5jdGlvbiBlbnN1cmVFdmVudFR5cGVzKCk6IHZvaWQge1xuICAgIGlmICggIWV2ZW50VHlwZXMgKSBldmVudFR5cGVzID0gY2MuTm9kZS5FdmVudFR5cGU7XG4gICAgaWYgKCAhd2F0Y2hlZEV2ZW50cyApIHtcbiAgICAgICAgd2F0Y2hlZEV2ZW50cyA9IFsgZXZlbnRUeXBlcy5UUkFOU0ZPUk1fQ0hBTkdFRCwgZXZlbnRUeXBlcy5TSVpFX0NIQU5HRUQsIGV2ZW50VHlwZXMuQ09MT1JfQ0hBTkdFRCBdO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEV2ZW50VHlwZXMoKTogYW55IHtcbiAgICBlbnN1cmVFdmVudFR5cGVzKCk7XG4gICAgcmV0dXJuIGV2ZW50VHlwZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRHb2JqTmFtZSggZ29iajogYW55ICk6IHN0cmluZyB7XG4gICAgbGV0IG5hbWUgPSBnb2JqLm5hbWU7XG4gICAgaWYgKCAhbmFtZSApIHtcbiAgICAgICAgaWYgKCBnb2JqLnBhY2thZ2VJdGVtICkgbmFtZSA9IGdvYmoucGFja2FnZUl0ZW0ubmFtZTtcbiAgICAgICAgZWxzZSBpZiAoIGdvYmouY29uc3RydWN0b3IgKSBuYW1lID0gZ29iai5jb25zdHJ1Y3Rvci5uYW1lO1xuICAgIH1cbiAgICByZXR1cm4gbmFtZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZURDKCk6IHZvaWQge1xuICAgIHRyZWVTdGF0ZS5kY01vZGUgPSAhdHJlZVN0YXRlLmRjTW9kZTtcbiAgICByZWFkeVVwZGF0ZVRyZWUoKTtcbn1cblxuZnVuY3Rpb24gaXNOb2RlSW5zdHJ1bWVudGVkKCBub2RlOiBhbnkgKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIG5vZGUuX19saXN0ZW5lZCAmJiAhKCBub2RlLl9ldmVudFByb2Nlc3NvciAmJiAhbm9kZS5fZXZlbnRQcm9jZXNzb3IuaGFzRXZlbnRMaXN0ZW5lciggTUFSS0VSX0VWRU5UICkgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc0JyZWFrUG9pbnQoIG5vZGVJZDogc3RyaW5nLCBldmVudE5hbWU6IHN0cmluZyApOiBib29sZWFuIHtcbiAgICByZXR1cm4gQm9vbGVhbiggYnJlYWtQb2ludHNbIG5vZGVJZCBdPy5bIGV2ZW50TmFtZSBdICk7XG59XG5cbi8qKiBBdHRhY2hlcyBpbnNwZWN0b3IgbGlzdGVuZXJzIHRvIGEgbm9kZSBvbmNlOiBob3ZlciwgY2hhbmdlIHRyYWNraW5nLCBub2RlIGJyZWFrcG9pbnRzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNoZWNrTm9kZSggbm9kZTogYW55ICk6IHZvaWQge1xuICAgIGVuc3VyZUV2ZW50VHlwZXMoKTtcbiAgICBpZiAoIGlzTm9kZUluc3RydW1lbnRlZCggbm9kZSApICkgcmV0dXJuO1xuXG4gICAgbm9kZS5vZmYoIGV2ZW50VHlwZXMuTU9VU0VfRU5URVIsIG9uSG92ZXJOb2RlICk7XG4gICAgbm9kZS5vZmYoIGV2ZW50VHlwZXMuTU9VU0VfTEVBVkUsIG9uSG92ZXJOb2RlICk7XG4gICAgaWYgKCBub2RlLmdldENvbXBvbmVudCggY2MuUmVuZGVyYWJsZUNvbXBvbmVudCApICYmIG5vZGUuZ2V0Q29tcG9uZW50KCBjYy5VSVRyYW5zZm9ybUNvbXBvbmVudCApICkge1xuICAgICAgICBub2RlLm9uKCBldmVudFR5cGVzLk1PVVNFX0VOVEVSLCBvbkhvdmVyTm9kZSApO1xuICAgICAgICBub2RlLm9uKCBldmVudFR5cGVzLk1PVVNFX0xFQVZFLCBvbkhvdmVyTm9kZSApO1xuICAgIH1cblxuICAgIGNvbnN0IGJyZWFrSWZTZXQgPSAoIGV2ZW50TmFtZTogc3RyaW5nICk6IHZvaWQgPT4ge1xuICAgICAgICBpZiAoIGhhc0JyZWFrUG9pbnQoIG5vZGUuX2lkLCBldmVudE5hbWUgKSApIHtcbiAgICAgICAgICAgIGRlYnVnZ2VyOyAvLyBub2RlIGJyZWFrcG9pbnQgc2V0IGZyb20gdGhlIGluc3BlY3RvciB0cmVlIGNvbnRleHQgbWVudVxuICAgICAgICB9XG4gICAgfTtcbiAgICBjb25zdCBvblRyYWNrZWQgPSAoIGV2ZW50TmFtZTogc3RyaW5nICk6IHZvaWQgPT4ge1xuICAgICAgICBicmVha0lmU2V0KCBldmVudE5hbWUgKTtcbiAgICAgICAgaWYgKCBmbGFncy5zeW5jTm9kZURldGFpbCAmJiBub2RlID09PSBkZXRhaWxTdGF0ZS5sYXN0RGV0YWlsTm9kZSApIHJlYWR5R2V0Tm9kZURldGFpbCgpO1xuICAgIH07XG5cbiAgICBmb3IgKCBjb25zdCBldmVudFR5cGUgb2Ygd2F0Y2hlZEV2ZW50cyEgKSB7XG4gICAgICAgIG5vZGUub24oIGV2ZW50VHlwZSwgKCBhcmc6IGFueSApID0+IHtcbiAgICAgICAgICAgIG9uVHJhY2tlZCggZXZlbnRUeXBlID09PSBldmVudFR5cGVzLlRSQU5TRk9STV9DSEFOR0VEID8gY2MuTm9kZS5UcmFuc2Zvcm1CaXRbIGFyZyBdIDogZXZlbnRUeXBlICk7XG4gICAgICAgIH0gKTtcbiAgICB9XG4gICAgbm9kZS5vbiggZXZlbnRUeXBlcy5DSElMRF9SRU1PVkVELCAoIGNoaWxkOiBhbnkgKSA9PiB7XG4gICAgICAgIGRlbGV0ZUZyb21Ob2RlTWFwKCBjaGlsZCApO1xuICAgICAgICByZWFkeVVwZGF0ZVRyZWUoIGZhbHNlLCBub2RlICk7XG4gICAgICAgIGJyZWFrSWZTZXQoIGV2ZW50VHlwZXMuQ0hJTERfUkVNT1ZFRCApO1xuICAgIH0gKTtcbiAgICBub2RlLm9uKCBldmVudFR5cGVzLkNISUxEX0FEREVELCAoKSA9PiB7XG4gICAgICAgIHJlYWR5VXBkYXRlVHJlZSggZmFsc2UsIG5vZGUgKTtcbiAgICAgICAgYnJlYWtJZlNldCggZXZlbnRUeXBlcy5DSElMRF9BRERFRCApO1xuICAgIH0gKTtcbiAgICBub2RlLm9uKCBldmVudFR5cGVzLkxBWUVSX0NIQU5HRUQsICgpID0+IGJyZWFrSWZTZXQoIGV2ZW50VHlwZXMuTEFZRVJfQ0hBTkdFRCApICk7XG4gICAgbm9kZS5vbiggZXZlbnRUeXBlcy5TSUJMSU5HX09SREVSX0NIQU5HRUQsICgpID0+IHtcbiAgICAgICAgcmVhZHlVcGRhdGVUcmVlKCBmYWxzZSwgbm9kZSApO1xuICAgICAgICBicmVha0lmU2V0KCBldmVudFR5cGVzLlNJQkxJTkdfT1JERVJfQ0hBTkdFRCApO1xuICAgIH0gKTtcbiAgICBub2RlLm9uKCBNQVJLRVJfRVZFTlQsIHJlYWR5VXBkYXRlVHJlZSApO1xuICAgIG5vZGUub24oICdhY3RpdmUtaW4taGllcmFyY2h5LWNoYW5nZWQnLCAoIGNoYW5nZWQ6IGFueSApID0+IHtcbiAgICAgICAgaWYgKCBub2RlLnBhcmVudCApIHJlYWR5VXBkYXRlVHJlZSggZmFsc2UsIG5vZGUgKTtcbiAgICAgICAgb25UcmFja2VkKCAnYWN0aXZlLWluLWhpZXJhcmNoeS1jaGFuZ2VkJyApO1xuICAgICAgICBpZiAoIGZsYWdzLnN0YXRpc3RpYyApIG5vZGVMb2dzLnB1c2goIFsgRGF0ZS5ub3coKSwgWyBjaGFuZ2VkLl9pZCwgY2hhbmdlZC5uYW1lIF0gXSApO1xuICAgIH0gKTtcbiAgICBub2RlLl9fbGlzdGVuZWQgPSB0cnVlO1xufVxuXG4vKiogU2VyaWFsaXplcyBvbmUgbm9kZSAoYW5kLCB3aGVuIGV4cGFuZGVkLCBpdHMgY2hpbGRyZW4pIGZvciB0aGUgaW5zcGVjdG9yIHRyZWUgdmlldy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemVOb2RlKCBvdXQ6IGFueSwgbm9kZTogYW55LCBwYXJlbnRPcGFjaXR5ID0gMjU1LCBwYXJlbnRPcGVuID0gdHJ1ZSApOiBhbnkge1xuICAgIGVuc3VyZUV2ZW50VHlwZXMoKTtcbiAgICBjb25zdCBpc1NjZW5lID0gbm9kZSBpbnN0YW5jZW9mIGNjLlNjZW5lO1xuICAgIG91dC5uYW1lID0gbm9kZS5uYW1lO1xuICAgIG91dC5pZCA9IG5vZGUuX2lkO1xuICAgIG91dC5pc0ZhaXJ5Q29tID0gZmFsc2U7XG4gICAgb3V0LmJyZWFrcyA9IGJyZWFrUG9pbnRzWyBvdXQuaWQgXTtcbiAgICBvdXQuYXV0b1VwZGF0ZSA9ICFkb25vdEF1dG9VcGRhdGVzWyBvdXQuaWQgXTtcbiAgICBpZiAoIG5vZGUuJGdvYmogJiYgKCB3aW5kb3cgYXMgYW55ICkuZmd1aSApIHtcbiAgICAgICAgY29uc3QgZ29iaiA9IG5vZGUuJGdvYmo7XG4gICAgICAgIG91dC5nb2JqTmFtZSA9IGdldEdvYmpOYW1lKCBnb2JqICk7XG4gICAgICAgIG91dC5pc0ZhaXJ5Q29tID0gZ29iaiBpbnN0YW5jZW9mIGZndWkuR0NvbXBvbmVudDtcbiAgICB9XG4gICAgb3V0LmFjdGl2ZSA9IGlzU2NlbmUgPyB0cnVlIDogbm9kZS5hY3RpdmU7XG4gICAgaWYgKCBvdXQubmFtZS5sZW5ndGggPT09IDAgJiYgaXNTY2VuZSApIG91dC5uYW1lID0gJ0N1cnJlbnRTY2VuZSc7XG4gICAgb3V0LnNlbGVjdGVkID0gZmFsc2U7XG4gICAgbGV0IGNvdW50c1Rvd2FyZERyYXdDYWxsID0gdHJ1ZTtcbiAgICBvdXQuYWN0aXZlSW5IaWVyYXJjaHkgPSBpc1NjZW5lID8gdHJ1ZSA6IG5vZGUuYWN0aXZlSW5IaWVyYXJjaHk7XG4gICAgY29uc3Qgb3BhY2l0eSA9IG91dC5vcGFjaXR5SW5IaWVyYXJjaHkgPSBOdW1iZXIoIHBhcmVudE9wYWNpdHkgJiYgKCBub2RlLl91aVByb3BzPy5vcGFjaXR5IHx8IDEgKSApO1xuICAgIGlmICggIWlzU2NlbmUgKSB7XG4gICAgICAgIG91dC5pc01lc2hSZW5kZXIgPSBjYy5qcy5nZXRDbGFzc05hbWUoIG5vZGUuZ2V0Q29tcG9uZW50KCBjYy5SZW5kZXJhYmxlQ29tcG9uZW50ICkgKSA9PT0gJ2NjLk1lc2hSZW5kZXJlcic7XG4gICAgfVxuICAgIGlmICggIWlzU2NlbmUgJiYgdHJlZVN0YXRlLmRjTW9kZSAmJiBvdXQuYWN0aXZlSW5IaWVyYXJjaHkgJiYgbm9kZS5fdWlQcm9wcy5vcGFjaXR5ICYmICEoIG5vZGUgaW5zdGFuY2VvZiBjYy5TY2VuZSApICkge1xuICAgICAgICBjb25zdCByZW5kZXJhYmxlID0gbm9kZS5nZXRDb21wb25lbnQoIGNjLlJlbmRlcmFibGVDb21wb25lbnQgKTtcbiAgICAgICAgaWYgKCByZW5kZXJhYmxlICYmIHJlbmRlcmFibGUuZW5hYmxlZCApIHtcbiAgICAgICAgICAgIGlmICggcmVuZGVyYWJsZSBpbnN0YW5jZW9mIGNjLlNwcml0ZUNvbXBvbmVudCApIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0dXJlID0gcmVuZGVyYWJsZS5zcHJpdGVGcmFtZT8uX3RleHR1cmU7XG4gICAgICAgICAgICAgICAgaWYgKCB0ZXh0dXJlICkgb3V0LmF0bGFzSWQgPSB0ZXh0dXJlLl9pZDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIHJlbmRlcmFibGUgaW5zdGFuY2VvZiBjYy5MYWJlbENvbXBvbmVudCApIHtcbiAgICAgICAgICAgICAgICBpZiAoIHJlbmRlcmFibGUuX3RleHR1cmUgJiYgcmVuZGVyYWJsZS5zdHJpbmcubGVuZ3RoID4gMCApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgdGV4dHVyZSA9IHJlbmRlcmFibGUuX3RleHR1cmUuX3RleHR1cmU7XG4gICAgICAgICAgICAgICAgICAgIGlmICggdGV4dHVyZSApIG91dC5hdGxhc0lkID0gdGV4dHVyZS5faWQ7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICggcmVuZGVyYWJsZSBpbnN0YW5jZW9mIGNjLkdyYXBoaWNzQ29tcG9uZW50ICkge1xuICAgICAgICAgICAgICAgIGlmICggcmVuZGVyYWJsZS5faW1wbCB8fCByZW5kZXJhYmxlLmltcGwgKSB7XG4gICAgICAgICAgICAgICAgICAgIG91dC5ydHlwZSA9ICdnaCc7XG4gICAgICAgICAgICAgICAgICAgIG91dC5hdGxhc0lkID0gcmVuZGVyYWJsZS5faWQ7XG4gICAgICAgICAgICAgICAgICAgIGNvdW50c1Rvd2FyZERyYXdDYWxsID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICggcmVuZGVyYWJsZSBpbnN0YW5jZW9mIGNjLk1hc2sgKSB7XG4gICAgICAgICAgICAgICAgb3V0LnJ0eXBlID0gJ21rJztcbiAgICAgICAgICAgICAgICBvdXQuYXRsYXNJZCA9IHJlbmRlcmFibGUuX2lkO1xuICAgICAgICAgICAgICAgIGNvdW50c1Rvd2FyZERyYXdDYWxsID0gZmFsc2U7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG91dC5ydHlwZSA9ICdvdCc7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgY2hlY2tOb2RlKCBub2RlICk7XG4gICAgbGV0IGRyYXdDYWxscyA9IDA7XG4gICAgaWYgKCB0cmVlU3RhdGUuZGNNb2RlICYmIG9wYWNpdHkgJiYgb3V0LmFjdGl2ZUluSGllcmFyY2h5ICkge1xuICAgICAgICBpZiAoIG91dC5hdGxhc0lkICYmIHRyZWVTdGF0ZS5sYXN0QXRsYXNJZCAhPT0gb3V0LmF0bGFzSWQgKSB7XG4gICAgICAgICAgICBpZiAoIGNvdW50c1Rvd2FyZERyYXdDYWxsICkgZHJhd0NhbGxzKys7XG4gICAgICAgICAgICB0cmVlU3RhdGUubGFzdEF0bGFzSWQgPSBvdXQuYXRsYXNJZDtcbiAgICAgICAgfVxuICAgIH1cbiAgICBvdXQuY2hpbGRDb3VudCA9IG5vZGUuY2hpbGRyZW4ubGVuZ3RoO1xuICAgIGlmICggcGFyZW50T3BlbiB8fCB0cmVlU3RhdGUuZGNNb2RlIHx8IHRyZWVTdGF0ZS5jaGVja0FsbE9uZVRpbWUgKSB7XG4gICAgICAgIGNvbnN0IGlzT3BlbiA9IGlzU2NlbmUgfHwgb3BlbmVkTm9kZXNbIG91dC5pZCBdICE9PSB1bmRlZmluZWQ7XG4gICAgICAgIGlmICggIXRyZWVTdGF0ZS5jaGVja0FsbE9uZVRpbWUgJiYgIXRyZWVTdGF0ZS5kY01vZGUgJiYgIWlzT3BlbiApIHtcbiAgICAgICAgICAgIG91dC5jaGlsZHJlbiA9IFtdO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb3V0LmNoaWxkcmVuID0gbm9kZS5jaGlsZHJlbi5tYXAoICggY2hpbGQ6IGFueSApID0+IHtcbiAgICAgICAgICAgICAgICBub2Rlc0J5SWRbIGNoaWxkLl9pZCBdID0gY2hpbGQ7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHNlcmlhbGl6ZU5vZGUoIHt9LCBjaGlsZCwgb3BhY2l0eSwgaXNPcGVuICk7XG4gICAgICAgICAgICB9ICk7XG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBvdXQuY2hpbGRyZW4gPSBbXTtcbiAgICB9XG4gICAgaWYgKCB0cmVlU3RhdGUuZGNNb2RlICkge1xuICAgICAgICBpZiAoIG9wYWNpdHkgJiYgb3V0LmFjdGl2ZUluSGllcmFyY2h5ICkge1xuICAgICAgICAgICAgb3V0LmNoaWxkcmVuLmZvckVhY2goICggY2hpbGQ6IGFueSApID0+IHsgZHJhd0NhbGxzICs9IGNoaWxkLmRjOyB9ICk7XG4gICAgICAgICAgICBvdXQuZGMgPSBkcmF3Q2FsbHM7XG4gICAgICAgICAgICBjb25zdCBjaGlsZFR5cGVzID0gb3V0LmNoaWxkcmVuLm1hcCggKCBjaGlsZDogYW55ICkgPT4gY2hpbGQucnR5cGUgKS5maWx0ZXIoICggdHlwZTogc3RyaW5nICkgPT4gdHlwZSApO1xuICAgICAgICAgICAgaWYgKCBjaGlsZFR5cGVzLmxlbmd0aCA+IDAgKSB7XG4gICAgICAgICAgICAgICAgb3V0LnJ0eXBlID0gQXJyYXkuZnJvbSggbmV3IFNldCggY2hpbGRUeXBlcy50b1N0cmluZygpLnNwbGl0KCAnLCcgKSApICkuam9pbiggJywnICk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBvdXQuZGMgPSAwO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmICggIXBhcmVudE9wZW4gKSBvdXQuY2hpbGRyZW4gPSBbXTtcbiAgICByZXR1cm4gb3V0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVsZXRlRnJvbU5vZGVNYXAoIG5vZGU6IGFueSApOiB2b2lkIHtcbiAgICBkZWxldGUgbm9kZXNCeUlkWyBub2RlLl9pZCBdO1xuICAgIG5vZGUuY2hpbGRyZW4/LmZvckVhY2goIGRlbGV0ZUZyb21Ob2RlTWFwICk7XG59XG5cbi8qKiBFeHBhbmRzIGEgcGF0aCBvZiB1dWlkcyBpbiB0aGUgdHJlZSwgdGhlbiBzZWxlY3RzIGFuZCBkZXRhaWxzIHRoZSBsYXN0IG9uZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsb2NhdGVOb2RlQnlQYXRoKCB1dWlkUGF0aDogc3RyaW5nW10gKTogdm9pZCB7XG4gICAgY29uc3QgbGFzdElkID0gdXVpZFBhdGguc2xpY2UoIC0xIClbIDAgXTtcbiAgICBsZXQgcGFyZW50OiBhbnkgPSBudWxsO1xuICAgIGZvciAoIGNvbnN0IHV1aWQgb2YgdXVpZFBhdGggKSB7XG4gICAgICAgIGxldCBub2RlID0gbm9kZXNCeUlkWyB1dWlkIF07XG4gICAgICAgIGlmICggIW5vZGUgJiYgcGFyZW50ICkge1xuICAgICAgICAgICAgbm9kZSA9IHBhcmVudC5nZXRDaGlsZEJ5VXVpZCggdXVpZCApO1xuICAgICAgICAgICAgbm9kZXNCeUlkWyB1dWlkIF0gPSBub2RlO1xuICAgICAgICB9XG4gICAgICAgIGlmICggbm9kZSApIHtcbiAgICAgICAgICAgIGNoZWNrTm9kZSggbm9kZSApO1xuICAgICAgICAgICAgc3luY09wZW4oIHV1aWQsIHRydWUsIGZhbHNlICk7XG4gICAgICAgICAgICBwYXJlbnQgPSBub2RlO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmICggbGFzdElkICkge1xuICAgICAgICByZWFkeVVwZGF0ZVRyZWUoKTtcbiAgICAgICAgZ2V0Tm9kZURldGFpbCggbGFzdElkICk7XG4gICAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gc3luY09wZW4oIG5vZGVJZDogc3RyaW5nLCBvcGVuOiBib29sZWFuLCB1cGRhdGUgPSB0cnVlICk6IHZvaWQge1xuICAgIGlmICggb3BlbiApIHtcbiAgICAgICAgb3BlbmVkTm9kZXNbIG5vZGVJZCBdID0gdHJ1ZTtcbiAgICAgICAgaWYgKCB1cGRhdGUgKSByZWFkeVVwZGF0ZVRyZWUoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBkZWxldGUgb3BlbmVkTm9kZXNbIG5vZGVJZCBdO1xuICAgIH1cbn1cblxuLyoqIEZHVUkgY29udGFpbmVycyB3cmFwIHRoZWlyIGNvbnRlbnQgaW4gYSBzaW5nbGUgXCJDb250YWluZXJcIiBjaGlsZDsgYXV0by1leHBhbmQgaXQuICovXG5leHBvcnQgZnVuY3Rpb24gc3luY09wZW5GY29tKCBub2RlSWQ6IHN0cmluZyApOiB2b2lkIHtcbiAgICBjb25zdCBub2RlID0gbm9kZXNCeUlkWyBub2RlSWQgXTtcbiAgICBpZiAoIG5vZGUuY2hpbGRyZW4ubGVuZ3RoID09PSAxICYmIG5vZGUuY2hpbGRyZW5bIDAgXS5uYW1lID09PSAnQ29udGFpbmVyJyApIHtcbiAgICAgICAgc3luY09wZW4oIG5vZGUuY2hpbGRyZW5bIDAgXS5faWQsIHRydWUsIGZhbHNlICk7XG4gICAgfVxufVxuXG4vKiogRGVib3VuY2VkIHRyZWUgdXBkYXRlOyByZXNwZWN0cyBhdXRvLXVwZGF0ZSBzZXR0aW5ncyBhbmQgcGVyLXN1YnRyZWUgc3VwcHJlc3Npb24uICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZHlVcGRhdGVUcmVlKCBmb3JjZSA9IGZhbHNlLCBjaGFuZ2VkTm9kZTogYW55ID0gbnVsbCApOiB2b2lkIHtcbiAgICBpZiAoIGNoYW5nZWROb2RlICYmICF0cmVlU3RhdGUuZGNNb2RlICkge1xuICAgICAgICBpZiAoIGRvbm90QXV0b1VwZGF0ZXNbIGNoYW5nZWROb2RlLl9pZCBdICkgcmV0dXJuO1xuICAgICAgICBmb3IgKCBjb25zdCBzdXBwcmVzc2VkSWQgaW4gZG9ub3RBdXRvVXBkYXRlcyApIHtcbiAgICAgICAgICAgIGlmICggY2hhbmdlZE5vZGUuaXNDaGlsZE9mKCBub2Rlc0J5SWRbIHN1cHByZXNzZWRJZCBdICkgKSByZXR1cm47XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKCAhZmxhZ3MuYXV0b1VwZGF0ZVRyZWUgJiYgIWZvcmNlICkge1xuICAgICAgICBjYW5VcGRhdGVUcmVlKCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZ2V0U2NoZWR1bGUoKT8udW5zY2hlZHVsZSggdXBkYXRlVHJlZSApO1xuICAgIGlmICggRGF0ZS5ub3coKSAtIHRyZWVTdGF0ZS5sYXN0VHJlZVRpbWUgPiBUUkVFX1VQREFURV9USFJPVFRMRV9NUyApIHtcbiAgICAgICAgdXBkYXRlVHJlZSgpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGdldFNjaGVkdWxlKCk/LnNjaGVkdWxlT25jZSggdXBkYXRlVHJlZSwgVFJFRV9VUERBVEVfREVMQVlfUyApO1xuICAgIC8vIGEgcGF1c2VkIGdhbWUgbmV2ZXIgdGlja3MgaXRzIHNjaGVkdWxlcjsgc3RlcCB0d2ljZSBzbyB0aGUgc2NoZWR1bGVkIHVwZGF0ZSBydW5zXG4gICAgaWYgKCBjYy5nYW1lLmlzUGF1c2VkKCkgKSB7XG4gICAgICAgIHNldFRpbWVvdXQoICgpID0+IHtcbiAgICAgICAgICAgIGNjLmdhbWUuc3RlcCgpO1xuICAgICAgICAgICAgc2V0VGltZW91dCggKCkgPT4gY2MuZ2FtZS5zdGVwKCksIDAgKTtcbiAgICAgICAgfSApO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHVwZGF0ZVRyZWUoKTogdm9pZCB7XG4gICAgY29uc3Qgc2NlbmUgPSBjYy5kaXJlY3Rvci5nZXRTY2VuZSgpO1xuICAgIGlmICggIXNjZW5lICkgcmV0dXJuO1xuICAgIHRyZWVTdGF0ZS5sYXN0QXRsYXNJZCA9IG51bGw7XG4gICAgdHJlZVN0YXRlLmxhc3RUcmVlVGltZSA9IERhdGUubm93KCk7XG4gICAgc2VuZFRyZWUoIHNlcmlhbGl6ZU5vZGUoIHt9LCBzY2VuZSApICk7XG4gICAgdHJlZVN0YXRlLmNoZWNrQWxsT25lVGltZSA9IGZhbHNlO1xufVxuIiwgIi8vIE5vZGUgYnJlYWtwb2ludHMgKHBhdXNlIGluIERldlRvb2xzIHdoZW4gYSB3YXRjaGVkIG5vZGUgZXZlbnQgZmlyZXMpIGFuZFxuLy8gcGVyLXN1YnRyZWUgYXV0by11cGRhdGUgc3VwcHJlc3Npb24uXG5pbXBvcnQgeyBicmVha1BvaW50cywgZG9ub3RBdXRvVXBkYXRlcyB9IGZyb20gJy4vc3RhdGUnO1xuaW1wb3J0IHsgcmVhZHlVcGRhdGVUcmVlIH0gZnJvbSAnLi90cmVlJztcblxuZXhwb3J0IGZ1bmN0aW9uIHNldEJyZWFrUG9pbnQoIG5vZGVJZDogc3RyaW5nLCBldmVudE5hbWU6IHN0cmluZywgdHJhbnNmb3JtQml0Pzogc3RyaW5nICk6IHZvaWQge1xuICAgIGlmICggIWJyZWFrUG9pbnRzWyBub2RlSWQgXSApIGJyZWFrUG9pbnRzWyBub2RlSWQgXSA9IHt9O1xuICAgIGJyZWFrUG9pbnRzWyBub2RlSWQgXVsgdHJhbnNmb3JtQml0IHx8IGV2ZW50TmFtZSBdID0gdHJ1ZTtcbiAgICByZWFkeVVwZGF0ZVRyZWUoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUJyZWFrUG9pbnQoIG5vZGVJZDogc3RyaW5nICk6IHZvaWQge1xuICAgIGRlbGV0ZSBicmVha1BvaW50c1sgbm9kZUlkIF07XG4gICAgcmVhZHlVcGRhdGVUcmVlKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVBbGxCcmVha1BvaW50cygpOiB2b2lkIHtcbiAgICBmb3IgKCBjb25zdCBub2RlSWQgaW4gYnJlYWtQb2ludHMgKSBkZWxldGUgYnJlYWtQb2ludHNbIG5vZGVJZCBdO1xuICAgIHJlYWR5VXBkYXRlVHJlZSgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9nZ2xlQXV0b1VwZGF0ZVN1cHByZXNzaW9uKCBub2RlSWQ6IHN0cmluZyApOiB2b2lkIHtcbiAgICBpZiAoIGRvbm90QXV0b1VwZGF0ZXNbIG5vZGVJZCBdICkgZGVsZXRlIGRvbm90QXV0b1VwZGF0ZXNbIG5vZGVJZCBdO1xuICAgIGVsc2UgZG9ub3RBdXRvVXBkYXRlc1sgbm9kZUlkIF0gPSB0cnVlO1xuICAgIHJlYWR5VXBkYXRlVHJlZSgpO1xufVxuIiwgIi8vIE1pcnJvcnMgY29uc29sZSBvdXRwdXQgYW5kIHVuY2F1Z2h0IGVycm9ycyB0byB0aGUgaW5zcGVjdG9yJ3MgbG9nIHBhbmVsLlxuaW1wb3J0IHsgZmxhZ3MgfSBmcm9tICcuL3N0YXRlJztcblxuY29uc3QgTUFYX1NUUklOR0lGWV9ERVBUSCA9IDM7XG5cbi8qKiBIdW1hbi1yZWFkYWJsZSBvbmUtbGluZSByZW5kZXJpbmcgb2YgY29uc29sZSBhcmd1bWVudHMgKG9iamVjdHMgb25lIGxldmVsIGRlZXApLiAqL1xuZnVuY3Rpb24gc3RyaW5naWZ5QXJncyggYXJnczogdW5rbm93bltdLCBkZXB0aCA9IDEgKTogc3RyaW5nIHtcbiAgICBjb25zdCBwYXJ0cyA9IGFyZ3MubWFwKCAoIGFyZyApID0+IHtcbiAgICAgICAgaWYgKCB0eXBlb2YgYXJnICE9PSAnb2JqZWN0JyAmJiB0eXBlb2YgYXJnICE9PSAnZnVuY3Rpb24nICkgcmV0dXJuIFN0cmluZyggYXJnICk7XG4gICAgICAgIGlmICggYXJnID09PSBudWxsICkgcmV0dXJuICdudWxsJztcbiAgICAgICAgaWYgKCBBcnJheS5pc0FycmF5KCBhcmcgKSApIHtcbiAgICAgICAgICAgIHJldHVybiBkZXB0aCA9PT0gTUFYX1NUUklOR0lGWV9ERVBUSCA/IFN0cmluZyggYXJnICkgOiBgWyR7IHN0cmluZ2lmeUFyZ3MoIGFyZywgZGVwdGggKyAxICkgfV1gO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHNoYWxsb3c6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG4gICAgICAgIGZvciAoIGNvbnN0IGtleSBpbiBhcmcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gKSB7XG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9ICggYXJnIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IClbIGtleSBdO1xuICAgICAgICAgICAgaWYgKCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnICYmIHR5cGVvZiB2YWx1ZSAhPT0gJ2Z1bmN0aW9uJyApIHtcbiAgICAgICAgICAgICAgICBzaGFsbG93WyBrZXkgXSA9IHZhbHVlID09PSBudWxsID8gJ251bGwnIDogdmFsdWU7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KCBzaGFsbG93LCBudWxsLCAnXFx0JyApO1xuICAgIH0gKTtcbiAgICByZXR1cm4gcGFydHMubGVuZ3RoID09PSAxID8gcGFydHNbIDAgXSA6IHBhcnRzLmpvaW4oICcsJyApO1xufVxuXG5mdW5jdGlvbiBpc0FsbENvbXBsZXgoIGFyZ3M6IHVua25vd25bXSApOiBib29sZWFuIHtcbiAgICByZXR1cm4gYXJncy5ldmVyeSggKCBhcmcgKSA9PiB7XG4gICAgICAgIGNvbnN0IHR5cGUgPSB0eXBlb2YgYXJnO1xuICAgICAgICByZXR1cm4gdHlwZSAhPT0gJ2Z1bmN0aW9uJyAmJiB0eXBlICE9PSAnb2JqZWN0JztcbiAgICB9ICk7XG59XG5cbmZ1bmN0aW9uIHdyYXAoIG9yaWdpbmFsOiAoIC4uLmFyZ3M6IHVua25vd25bXSApID0+IHZvaWQsIGZvcndhcmQ6ICggdGV4dDogc3RyaW5nICkgPT4gdm9pZCApIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCB0aGlzOiB1bmtub3duLCAuLi5hcmdzOiB1bmtub3duW10gKTogdm9pZCB7XG4gICAgICAgIG9yaWdpbmFsLmNhbGwoIGNvbnNvbGUsIC4uLmFyZ3MgKTtcbiAgICAgICAgaWYgKCAhaXNBbGxDb21wbGV4KCBhcmdzICkgKSBmb3J3YXJkKCBzdHJpbmdpZnlBcmdzKCBhcmdzICkgKTtcbiAgICAgICAgZWxzZSBpZiAoICggd2luZG93IGFzIGFueSApLmNjICkgZm9yd2FyZCggY2MuanMuZm9ybWF0U3RyKCAuLi5hcmdzICkgKTtcbiAgICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdExvZ0xpc3RlbmVycygpOiB2b2lkIHtcbiAgICBpZiAoIGZsYWdzLmxvZ0NvdW50ID09PSAwICYmIGZsYWdzLnNob3dEZXZUb29sSW5UYWIgKSByZXR1cm47XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoICdlcnJvcicsICggZXZlbnQgKSA9PiB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoIGV2ZW50Lm1lc3NhZ2UgKyAnXFxuJyArICggZXZlbnQuZXJyb3I/LnN0YWNrID8/ICcnICkgKTtcbiAgICB9LCB0cnVlICk7XG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoICd1bmhhbmRsZWRyZWplY3Rpb24nLCAoIGV2ZW50ICkgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKCBgJHsgZXZlbnQucmVhc29uIH1gICk7XG4gICAgfSwgdHJ1ZSApO1xuICAgIGNvbnNvbGUubG9nID0gd3JhcCggY29uc29sZS5sb2csIHNlbmRMb2cgKTtcbiAgICBjb25zb2xlLmluZm8gPSB3cmFwKCBjb25zb2xlLmluZm8sIHNlbmRMb2cgKTtcbiAgICBjb25zb2xlLmVycm9yID0gd3JhcCggY29uc29sZS5lcnJvciwgc2VuZEVycm9yICk7XG4gICAgY29uc29sZS53YXJuID0gd3JhcCggY29uc29sZS53YXJuLCBzZW5kV2FybiApO1xufVxuIiwgIi8vIEF1dG9jb21wbGV0ZSBzdWdnZXN0aW9ucyBmb3IgdGhlIGluc3BlY3RvcidzIGNvbnNvbGUgaW5wdXQuXG5cbmNvbnN0IE1BWF9WQUxVRV9QUkVWSUVXID0gMTAwO1xuXG4vKiogW25hbWUsIGhpbnRdIHBhaXJzIGZvciB0aGUgcHJvcGVydHkgcGF0aCB0eXBlZCBzbyBmYXIgKGUuZy4gXCJjYy5kaXJlY3Rvci5nZXRcIikuICovXG5leHBvcnQgZnVuY3Rpb24gY29kZVRpcCggaW5wdXQ6IHN0cmluZyApOiBBcnJheTxbIHN0cmluZywgc3RyaW5nIF0+IHtcbiAgICBpZiAoIGlucHV0LnN0YXJ0c1dpdGgoICdfXycgKSApIHJldHVybiBbXTtcbiAgICBjb25zdCBzZWdtZW50cyA9IGlucHV0LnNwbGl0KCAnLicgKTtcbiAgICBsZXQgbmVlZGxlID0gc2VnbWVudHMucG9wKCkgYXMgc3RyaW5nO1xuICAgIGlmICggbmVlZGxlLmluY2x1ZGVzKCAnKCcgKSApIG5lZWRsZSA9IG5lZWRsZS5zcGxpdCggJygnIClbIDAgXTtcbiAgICBuZWVkbGUgPSBuZWVkbGUudG9Mb3dlckNhc2UoKTtcbiAgICBsZXQgdGFyZ2V0OiBhbnkgPSAoIHdpbmRvdyBhcyBhbnkgKVsgc2VnbWVudHMuc2hpZnQoKSBhcyBzdHJpbmcgXSB8fCB3aW5kb3c7XG4gICAgaWYgKCAhdGFyZ2V0ICkgcmV0dXJuIFtdO1xuICAgIHdoaWxlICggc2VnbWVudHMubGVuZ3RoID4gMCApIHtcbiAgICAgICAgY29uc3Qgc2VnbWVudCA9IHNlZ21lbnRzLnNoaWZ0KCkgYXMgc3RyaW5nO1xuICAgICAgICBpZiAoICF0YXJnZXQgKSByZXR1cm4gW107XG4gICAgICAgIHRhcmdldCA9IHRhcmdldFsgc2VnbWVudCBdO1xuICAgIH1cbiAgICBpZiAoICF0YXJnZXQgKSByZXR1cm4gW107XG5cbiAgICBjb25zdCB0aXBzOiBBcnJheTxbIHN0cmluZywgc3RyaW5nIF0+ID0gW107XG4gICAgLy8gd2luZG93L2NjIG93biB0b28gbWFueSBwcm9wZXJ0aWVzIHRvIGVudW1lcmF0ZSB2aWEgZ2V0T3duUHJvcGVydHlOYW1lc1xuICAgIGxldCBuYW1lczogc3RyaW5nW10gPSB0YXJnZXQgPT09ICggd2luZG93IGFzIGFueSApLmNjIHx8IHRhcmdldCA9PT0gd2luZG93ID8gW10gOiBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyggdGFyZ2V0ICk7XG4gICAgaWYgKCB0YXJnZXQuY29uc3RydWN0b3IgJiYgdGFyZ2V0LmNvbnN0cnVjdG9yLl9fcHJvcHNfXyApIG5hbWVzLnB1c2goIC4uLnRhcmdldC5jb25zdHJ1Y3Rvci5fX3Byb3BzX18gKTtcbiAgICBjb25zdCBuYW1lU2V0ID0gbmV3IFNldCggbmFtZXMgKTtcbiAgICBmb3IgKCBjb25zdCBrZXkgaW4gdGFyZ2V0ICkgbmFtZVNldC5hZGQoIGtleSApO1xuICAgIG5hbWVzID0gQXJyYXkuZnJvbSggbmFtZVNldCApO1xuXG4gICAgZm9yICggY29uc3QgbmFtZSBvZiBuYW1lcyApIHtcbiAgICAgICAgaWYgKCBuYW1lLnN0YXJ0c1dpdGgoICdfXycgKSApIGNvbnRpbnVlO1xuICAgICAgICBsZXQgdmFsdWUgPSB0YXJnZXRbIG5hbWUgXTtcbiAgICAgICAgaWYgKCBuZWVkbGUgIT09ICcnICYmICFuYW1lLnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoIG5lZWRsZSApICkgY29udGludWU7XG4gICAgICAgIGlmICggdHlwZW9mIHZhbHVlID09PSAnZnVuY3Rpb24nICkge1xuICAgICAgICAgICAgaWYgKCB2YWx1ZS5sZW5ndGggPT09IDAgKSB7XG4gICAgICAgICAgICAgICAgdGlwcy5wdXNoKCBbIG5hbWUsICdmdW5jdGlvbigpJyBdICk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBzb3VyY2U6IHN0cmluZyA9IHZhbHVlLnRvU3RyaW5nKCk7XG4gICAgICAgICAgICBsZXQgc2lnbmF0dXJlID0gc291cmNlLnNwbGl0KCAnXFxuJyApLnNoaWZ0KCkgYXMgc3RyaW5nO1xuICAgICAgICAgICAgY29uc3QgaXNOYXRpdmUgPSBzb3VyY2UuaW5jbHVkZXMoICdbbmF0aXZlIGNvZGVdJyApO1xuICAgICAgICAgICAgc2lnbmF0dXJlID0gc2lnbmF0dXJlLnJlcGxhY2UoIGBmdW5jdGlvbiAkeyB2YWx1ZS5uYW1lIH1gLCAnZnVuY3Rpb24nICk7XG4gICAgICAgICAgICBpZiAoICFzaWduYXR1cmUuZW5kc1dpdGgoICd7JyApICkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNsb3NlQnJhY2UgPSBzaWduYXR1cmUuaW5kZXhPZiggJyl7JyApO1xuICAgICAgICAgICAgICAgIGNvbnN0IGNsb3NlU3BhY2VCcmFjZSA9IHNpZ25hdHVyZS5pbmRleE9mKCAnKSB7JyApO1xuICAgICAgICAgICAgICAgIHNpZ25hdHVyZSA9IGNsb3NlQnJhY2UgPiBjbG9zZVNwYWNlQnJhY2VcbiAgICAgICAgICAgICAgICAgICAgPyBzaWduYXR1cmUuc2xpY2UoIDAsIGNsb3NlQnJhY2UgKyAxIClcbiAgICAgICAgICAgICAgICAgICAgOiBzaWduYXR1cmUuc2xpY2UoIDAsIDMgKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2lnbmF0dXJlID0gc2lnbmF0dXJlLnJlcGxhY2UoICd7JywgJycgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICggaXNOYXRpdmUgJiYgc2lnbmF0dXJlID09PSAnZnVuY3Rpb24oKScgKSB7XG4gICAgICAgICAgICAgICAgc2lnbmF0dXJlID0gJ2Z1bmN0aW9uKCc7XG4gICAgICAgICAgICAgICAgY29uc3QgYXJnTmFtZXM6IHN0cmluZ1tdID0gW107XG4gICAgICAgICAgICAgICAgZm9yICggbGV0IGluZGV4ID0gMTsgaW5kZXggPD0gdmFsdWUubGVuZ3RoOyBpbmRleCsrICkgYXJnTmFtZXMucHVzaCggYGFyZyR7IGluZGV4IH1gICk7XG4gICAgICAgICAgICAgICAgc2lnbmF0dXJlICs9IGFyZ05hbWVzLmpvaW4oICcsJyApICsgJyknO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGlwcy5wdXNoKCBbIG5hbWUsIHNpZ25hdHVyZSBdICk7XG4gICAgICAgIH0gZWxzZSBpZiAoIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgKSB7XG4gICAgICAgICAgICBpZiAoIEFycmF5LmlzQXJyYXkoIHZhbHVlICkgKSB0aXBzLnB1c2goIFsgbmFtZSwgYFtdKGxlbmd0aDokeyB2YWx1ZS5sZW5ndGggfSlgIF0gKTtcbiAgICAgICAgICAgIGVsc2UgdGlwcy5wdXNoKCBbIG5hbWUsIHZhbHVlID09PSBudWxsID8gJ251bGwnIDogKCB2YWx1ZS5jb25zdHJ1Y3RvciA/IHZhbHVlLmNvbnN0cnVjdG9yLm5hbWUgOiAnb2JqZWN0JyApIF0gKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhbHVlID0gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogU3RyaW5nKCB2YWx1ZSApO1xuICAgICAgICAgICAgaWYgKCB2YWx1ZS5sZW5ndGggPiBNQVhfVkFMVUVfUFJFVklFVyApIHZhbHVlID0gdmFsdWUuc2xpY2UoIDAsIE1BWF9WQUxVRV9QUkVWSUVXICkgKyAnLi4uJztcbiAgICAgICAgICAgIHRpcHMucHVzaCggWyBuYW1lLCBgXCIkeyB2YWx1ZSB9XCJgIF0gKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB0aXBzLnNvcnQoKTtcbiAgICB0aXBzLnNvcnQoICggYSwgYiApID0+IGFbIDAgXS50b0xvd2VyQ2FzZSgpLmluZGV4T2YoIG5lZWRsZSApIC0gYlsgMCBdLnRvTG93ZXJDYXNlKCkuaW5kZXhPZiggbmVlZGxlICkgKTtcbiAgICByZXR1cm4gdGlwcztcbn1cbiIsICIvLyBOb2RlIG9wZXJhdGlvbnMgYW5kIHByZXZpZXctcGFnZSB1dGlsaXRpZXMuXG5pbXBvcnQgeyBub2Rlc0J5SWQsIGZsYWdzLCBub2RlTG9ncyB9IGZyb20gJy4vc3RhdGUnO1xuaW1wb3J0IHsgaXNFbmdpbmUzXzRPck5ld2VyIH0gZnJvbSAnLi9lbmdpbmUtY29tcGF0JztcbmltcG9ydCB7IGRlbGV0ZUZyb21Ob2RlTWFwLCByZWFkeVVwZGF0ZVRyZWUgfSBmcm9tICcuL3RyZWUnO1xuXG5leHBvcnQgZnVuY3Rpb24gdG9nZ2xlTm9kZUFjdGl2ZSggbm9kZUlkOiBzdHJpbmcgKTogdm9pZCB7XG4gICAgY29uc3Qgbm9kZSA9IG5vZGVzQnlJZFsgbm9kZUlkIF07XG4gICAgaWYgKCBub2RlICkgbm9kZS5hY3RpdmUgPSAhbm9kZS5hY3RpdmU7XG4gICAgcmVhZHlVcGRhdGVUcmVlKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVOb2RlKCBub2RlSWQ6IHN0cmluZyApOiB2b2lkIHtcbiAgICBjb25zdCBub2RlID0gbm9kZXNCeUlkWyBub2RlSWQgXTtcbiAgICBpZiAoIG5vZGUgKSBub2RlLnJlbW92ZUZyb21QYXJlbnQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGxvY2tEcmFnTm9kZSggbm9kZUlkOiBzdHJpbmcgfCBudWxsICk6IHZvaWQge1xuICAgIGZsYWdzLmxvY2tEcmFnTm9kZSA9IG5vZGVJZDtcbn1cblxuLyoqIE1vdmVzIG9uZSBub2RlIG5leHQgdG8gYW5vdGhlciAoZHJhZyAmIGRyb3AgcmVvcmRlciBpbiB0aGUgaW5zcGVjdG9yIHRyZWUpLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN3YXBQb3MoIGRyYWdnZWRJZDogc3RyaW5nLCB0YXJnZXRJZDogc3RyaW5nICk6IHZvaWQge1xuICAgIGNvbnN0IGRyYWdnZWQgPSBub2Rlc0J5SWRbIGRyYWdnZWRJZCBdO1xuICAgIGNvbnN0IHRhcmdldCA9IG5vZGVzQnlJZFsgdGFyZ2V0SWQgXTtcbiAgICBpZiAoICF0YXJnZXQgfHwgIWRyYWdnZWQgKSByZXR1cm47XG4gICAgZHJhZ2dlZC5wYXJlbnQgPSB0YXJnZXQucGFyZW50O1xuICAgIGRyYWdnZWQuc2V0U2libGluZ0luZGV4KCB0YXJnZXQuZ2V0U2libGluZ0luZGV4KCkgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvZ2dsZUZwcygpOiB2b2lkIHtcbiAgICBpZiAoICFjYy5kZWJ1ZyApIHtcbiAgICAgICAgY2MuZGlyZWN0b3Iuc2V0RGlzcGxheVN0YXRzKCAhY2MuZGlyZWN0b3IuaXNEaXNwbGF5U3RhdHMoKSApO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGNjLmRlYnVnLnNldERpc3BsYXlTdGF0cyggIWNjLmRlYnVnLmlzRGlzcGxheVN0YXRzKCkgKTtcbn1cblxuLyoqIENvbGxlY3RzIGFjdGl2ZS1pbi1oaWVyYXJjaHkgY2hhbmdlIGxvZ3Mgd2hpbGUgZW5hYmxlZDsgc2VuZHMgdGhlbSB3aGVuIGRpc2FibGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHN0YXJ0U3RhdGlzdGljKCBlbmFibGVkOiBib29sZWFuICk6IHZvaWQge1xuICAgIGlmICggZW5hYmxlZCApIHtcbiAgICAgICAgbm9kZUxvZ3MubGVuZ3RoID0gMDtcbiAgICAgICAgZmxhZ3Muc3RhdGlzdGljID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBmbGFncy5zdGF0aXN0aWMgPSBmYWxzZTtcbiAgICBzZW5kU3RhdGlzdGljKCBub2RlTG9ncy5jb25jYXQoKSApO1xuICAgIG5vZGVMb2dzLmxlbmd0aCA9IDA7XG59XG5cbi8qKiBSZS1maXJlcyB3aWRnZXQgYWxpZ25tZW50IGFmdGVyIGEgbWFudWFsIHJlc2l6ZSBvZiB0aGUgcHJldmlldyBmcmFtZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVSZXNpemUoKTogdm9pZCB7XG4gICAgaWYgKCAhQ0NfUFJFVklFVyApIHJldHVybjtcbiAgICBjb25zdCBzY2VuZSA9IGNjLmRpcmVjdG9yLmdldFNjZW5lKCk7XG4gICAgaWYgKCAhc2NlbmUgKSByZXR1cm47XG4gICAgc2NlbmUuZ2V0Q29tcG9uZW50c0luQ2hpbGRyZW4oIGNjLldpZGdldENvbXBvbmVudCApLmZvckVhY2goICggd2lkZ2V0OiBhbnkgKSA9PiB7XG4gICAgICAgIGlmICggIXdpZGdldC5pc1ZhbGlkICkgcmV0dXJuO1xuICAgICAgICBpZiAoIGNjLldpZGdldENvbXBvbmVudC5BbGlnbk1vZGUgKSB7XG4gICAgICAgICAgICBpZiAoIHdpZGdldC5hbGlnbk1vZGUgPT09IGNjLldpZGdldENvbXBvbmVudC5BbGlnbk1vZGUuT05fV0lORE9XX1JFU0laRSApIHdpZGdldC51cGRhdGVBbGlnbm1lbnQoKTtcbiAgICAgICAgfSBlbHNlIGlmICggd2lkZ2V0LmVuYWJsZWRJbkhpZXJhcmNoeSApIHtcbiAgICAgICAgICAgIHdpZGdldC51cGRhdGVBbGlnbm1lbnQoKTtcbiAgICAgICAgfVxuICAgIH0gKTtcbn1cblxuLyoqIEZpdHMgdGhlIGdhbWUgY2FudmFzIHRvIHRoZSB3ZWJ2aWV3IGFmdGVyIHRoZSBwcmV2aWV3IHBhZ2UgY2hyb21lIHdhcyBzdHJpcHBlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNpemVDYW52YXMoKTogdm9pZCB7XG4gICAgaWYgKCBDQ19CVUlMRCApIHJldHVybjtcbiAgICBjb25zdCBjYW52YXMgPSBjYy5nYW1lLmNhbnZhcztcbiAgICBpZiAoICFjYW52YXMgKSByZXR1cm47XG4gICAgaWYgKCBpc0VuZ2luZTNfNE9yTmV3ZXIoKSApIHtcbiAgICAgICAgY2Muc2NyZWVuLndpbmRvd1NpemUgPSBjYy5zaXplKCB3aW5kb3cuaW5uZXJXaWR0aCAqIHdpbmRvdy5kZXZpY2VQaXhlbFJhdGlvLCB3aW5kb3cuaW5uZXJIZWlnaHQgKiB3aW5kb3cuZGV2aWNlUGl4ZWxSYXRpbyApO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmICggIWNjLkVOR0lORV9WRVJTSU9OLnN0YXJ0c1dpdGgoICcxLicgKSAmJiBjYy52aWV3LnNldEZyYW1lU2l6ZSApIHtcbiAgICAgICAgY2Mudmlldy5zZXRGcmFtZVNpemUoIHdpbmRvdy5pbm5lcldpZHRoLCB3aW5kb3cuaW5uZXJIZWlnaHQgKTtcbiAgICAgICAgdXBkYXRlUmVzaXplKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY2FudmFzLnN0eWxlLmhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodCArICdweCc7XG4gICAgICAgIGNhbnZhcy5zdHlsZS53aWR0aCA9IHdpbmRvdy5pbm5lcldpZHRoICsgJ3B4JztcbiAgICB9XG59XG5cbi8qKiBTdHJpcHMgdGhlIENvY29zIHByZXZpZXcgcGFnZSBjaHJvbWUgKHRvb2xiYXIvZm9vdGVyKSBzbyBvbmx5IHRoZSBnYW1lIGNhbnZhcyByZW1haW5zLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZVByZXZpZXdQYWdlQ2hyb21lKCk6IHZvaWQge1xuICAgIGNvbnN0IGNvbnRlbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCAnI2NvbnRlbnQnICk7XG4gICAgY29udGVudD8ucXVlcnlTZWxlY3RvciggJy5mb290ZXInICk/LnJlbW92ZSgpO1xuICAgIGNvbnRlbnQ/LnF1ZXJ5U2VsZWN0b3IoICcuZXJyb3InICk/LnJlbW92ZSgpO1xuICAgIGlmICggY29udGVudCAmJiBjb250ZW50LnBhcmVudEVsZW1lbnQgIT09IGRvY3VtZW50LmJvZHkgKSBkb2N1bWVudC5ib2R5LmFwcGVuZCggY29udGVudCApO1xuICAgIGNvbnN0IHdyYXBwZXIgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCAnLndyYXBwZXInICkgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuICAgIGlmICggd3JhcHBlciApIHdyYXBwZXIuc3R5bGUuYm9yZGVyID0gJ25vbmUnO1xuICAgIGNvbnN0IGNvbnRlbnRXcmFwID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvciggJy5jb250ZW50V3JhcCcgKSBhcyBIVE1MRWxlbWVudCB8IG51bGw7XG4gICAgaWYgKCBjb250ZW50V3JhcCApIHtcbiAgICAgICAgY29udGVudFdyYXAuc3R5bGUub3ZlcmZsb3cgPSAnaGlkZGVuJztcbiAgICAgICAgY29udGVudFdyYXAuc3R5bGUuaGVpZ2h0ID0gJzEwMHZoJztcbiAgICAgICAgY29udGVudFdyYXAuc3R5bGUud2lkdGggPSAnMTAwdncnO1xuICAgIH1cbiAgICBjb25zdCBoaWRkZW5CaW4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCAnZGl2JyApO1xuICAgIGhpZGRlbkJpbi5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kKCBoaWRkZW5CaW4gKTtcbiAgICBmb3IgKCBjb25zdCBlbGVtZW50IG9mIEFycmF5LmZyb20oIGRvY3VtZW50LmJvZHkuY2hpbGRyZW4gKSApIHtcbiAgICAgICAgaWYgKCBlbGVtZW50ICE9PSBoaWRkZW5CaW4gJiYgIWVsZW1lbnQuY29udGFpbnMoIGNjLmdhbWUuY2FudmFzICkgKSBoaWRkZW5CaW4uYXBwZW5kKCBlbGVtZW50ICk7XG4gICAgfVxuICAgIHJlc2l6ZUNhbnZhcygpO1xufVxuXG4vKiogQXNrcyB0aGUgcHJldmlldyBzZXJ2ZXIgdG8gcmUtaW1wb3J0IHRoZSBhc3NldCBkYXRhYmFzZSAoYmVzdCBlZmZvcnQsIGZpcmUgYW5kIGZvcmdldCkuICovXG5leHBvcnQgZnVuY3Rpb24gcmVDb21waWxlKCk6IHZvaWQge1xuICAgIGNvbnN0IHVybCA9IHdpbmRvdy5sb2NhdGlvbi5ocmVmICsgJ3VwZGF0ZS1kYic7XG4gICAgY29uc3QgcmVxdWVzdCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICAgIHJlcXVlc3Qub3BlbiggJ0dFVCcsIHVybCwgdHJ1ZSApO1xuICAgIHJlcXVlc3Quc2VuZCggbnVsbCApO1xufVxuIiwgIi8vIERlZmVuc2l2ZSBwYXRjaCBmb3IgYSBDb2NvcyBDcmVhdG9yIDMuOCBlbmdpbmUgYnVnLlxuLy9cbi8vIFBvaW50ZXJFdmVudERpc3BhdGNoZXIuX3NvcnRQb2ludGVyRXZlbnRQcm9jZXNzb3JMaXN0IHJlYWRzXG4vLyBgbm9kZS5fZ2V0VUlUcmFuc2Zvcm1Db21wKCkuY2FtZXJhUHJpb3JpdHlgIFdJVEhPVVQgbnVsbC1jaGVja2luZyB0aGUgVUlUcmFuc2Zvcm0sIGV2ZW4gdGhvdWdoXG4vLyBpdHMgc2libGluZyBjb21wYXJhdG9yIGBfc29ydEJ5UHJpb3JpdHlgIGd1YXJkcyB0aGUgc2FtZSBjYXNlLiBBbnkgcmVnaXN0ZXJlZCBwb2ludGVyLWV2ZW50XG4vLyBwcm9jZXNzb3Igd2hvc2Ugbm9kZSBsYWNrcyBhIFVJVHJhbnNmb3JtIGNyYXNoZXMgdGhlIHdob2xlIG1vdXNlL3RvdWNoIGRpc3BhdGNoIHdpdGhcbi8vIFwiQ2Fubm90IHJlYWQgcHJvcGVydGllcyBvZiBudWxsIChyZWFkaW5nICdjYW1lcmFQcmlvcml0eScpXCIuXG4vL1xuLy8gRW5hYmxpbmcgdGhlIGhvdmVyIGNyb3NzaGFpciByZWdpc3RlcnMgcG9pbnRlciBoYW5kbGVycyBvbiBtYW55IG5vZGVzIGFuZCBmb3JjZXMgdGhlIGxpc3QgdG9cbi8vIHJlLXNvcnQgb24gdGhlIG5leHQgbW91c2UgZXZlbnQsIHdoaWNoIHN1cmZhY2VzIHRoaXMgbGF0ZW50IGVuZ2luZSBjcmFzaCBpbiBzb21lIHByb2plY3RzLlxuLy8gV2UgcGF0Y2ggdGhlIGRpc3BhdGNoZXIgc2luZ2xldG9uIG9uY2Ugd2l0aCBhIGZhaXRoZnVsLCBudWxsLXNhZmUgcmVpbXBsZW1lbnRhdGlvbi5cblxuY29uc3QgQUREX1BPSU5URVJfRVZFTlRfUFJPQ0VTU09SID0gMDsgLy8gRGlzcGF0Y2hlckV2ZW50VHlwZSBlbnVtIHZhbHVlIGluIENDIDMuOFxuXG5sZXQgcGF0Y2hlZCA9IGZhbHNlO1xuXG4vKiogTG9jYXRlcyB0aGUgUG9pbnRlckV2ZW50RGlzcGF0Y2hlciBzaW5nbGV0b24gdmlhIHRoZSBzdGF0aWMgY2FsbGJhY2tzIGludm9rZXIgaXQgc3Vic2NyaWJlcyB0by4gKi9cbmZ1bmN0aW9uIGZpbmREaXNwYXRjaGVyKCk6IGFueSB7XG4gICAgY29uc3Qgbm9kZUV2ZW50UHJvY2Vzc29yID0gY2MuTm9kZUV2ZW50UHJvY2Vzc29yO1xuICAgIGNvbnN0IGludm9rZXIgPSBub2RlRXZlbnRQcm9jZXNzb3I/LmNhbGxiYWNrc0ludm9rZXI7XG4gICAgY29uc3QgdGFibGUgPSBpbnZva2VyPy5fY2FsbGJhY2tUYWJsZTtcbiAgICBjb25zdCBsaXN0ID0gdGFibGU/LlsgQUREX1BPSU5URVJfRVZFTlRfUFJPQ0VTU09SIF07XG4gICAgY29uc3QgaW5mb3MgPSBsaXN0Py5jYWxsYmFja0luZm9zO1xuICAgIGlmICggIUFycmF5LmlzQXJyYXkoIGluZm9zICkgKSByZXR1cm4gbnVsbDtcbiAgICBmb3IgKCBjb25zdCBpbmZvIG9mIGluZm9zICkge1xuICAgICAgICBjb25zdCB0YXJnZXQgPSBpbmZvPy50YXJnZXQ7XG4gICAgICAgIGlmICggdGFyZ2V0ICYmIEFycmF5LmlzQXJyYXkoIHRhcmdldC5fcG9pbnRlckV2ZW50UHJvY2Vzc29yTGlzdCApXG4gICAgICAgICAgICAmJiB0eXBlb2YgdGFyZ2V0Ll9zb3J0UG9pbnRlckV2ZW50UHJvY2Vzc29yTGlzdCA9PT0gJ2Z1bmN0aW9uJyApIHtcbiAgICAgICAgICAgIHJldHVybiB0YXJnZXQ7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXRjaFBvaW50ZXJFdmVudERpc3BhdGNoZXIoKTogdm9pZCB7XG4gICAgaWYgKCBwYXRjaGVkICkgcmV0dXJuO1xuICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGRpc3BhdGNoZXIgPSBmaW5kRGlzcGF0Y2hlcigpO1xuICAgICAgICBpZiAoICFkaXNwYXRjaGVyICkgcmV0dXJuO1xuICAgICAgICAvLyBpbnN0YW5jZS1sZXZlbCBvdmVycmlkZSAobWlycm9ycyB0aGUgZW5naW5lLCBhZGRzIHRoZSBtaXNzaW5nIFVJVHJhbnNmb3JtIG51bGwgZ3VhcmQpXG4gICAgICAgIGRpc3BhdGNoZXIuX3NvcnRQb2ludGVyRXZlbnRQcm9jZXNzb3JMaXN0ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKCAhdGhpcy5faXNMaXN0RGlydHkgKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBsaXN0ID0gdGhpcy5fcG9pbnRlckV2ZW50UHJvY2Vzc29yTGlzdDtcbiAgICAgICAgICAgIGZvciAoIGxldCBpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKysgKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcHJvY2Vzc29yID0gbGlzdFsgaSBdO1xuICAgICAgICAgICAgICAgIGNvbnN0IG5vZGUgPSBwcm9jZXNzb3IgJiYgcHJvY2Vzc29yLm5vZGU7XG4gICAgICAgICAgICAgICAgaWYgKCBub2RlICYmIG5vZGUuX3VpUHJvcHMgKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRyYW5zID0gbm9kZS5fZ2V0VUlUcmFuc2Zvcm1Db21wID8gbm9kZS5fZ2V0VUlUcmFuc2Zvcm1Db21wKCkgOiBudWxsO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIHRyYW5zICkgcHJvY2Vzc29yLmNhY2hlZENhbWVyYVByaW9yaXR5ID0gdHJhbnMuY2FtZXJhUHJpb3JpdHk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbGlzdC5zb3J0KCB0aGlzLl9zb3J0QnlQcmlvcml0eSApO1xuICAgICAgICAgICAgdGhpcy5faXNMaXN0RGlydHkgPSBmYWxzZTtcbiAgICAgICAgfTtcbiAgICAgICAgcGF0Y2hlZCA9IHRydWU7XG4gICAgfSBjYXRjaCAoIGVycm9yICkge1xuICAgICAgICBjb25zb2xlLndhcm4oICdjb2Nvcy1pbnNwZWN0b3I6IHBvaW50ZXIgZGlzcGF0Y2hlciBwYXRjaCBmYWlsZWQnLCBlcnJvciApO1xuICAgIH1cbn1cbiIsICIvLyBFbmdpbmUgYm9vdHN0cmFwOiB3YWl0cyBmb3IgY2MsIGhvb2tzIHNjZW5lIGxpZmVjeWNsZSwgYXBwbGllcyBjb21wYXRpYmlsaXR5IHNoaW1zLlxuaW1wb3J0IHsgYXBwbHlFbmdpbmVBbGlhc2VzIH0gZnJvbSAnLi9lbmdpbmUtY29tcGF0JztcbmltcG9ydCB7IHBhdGNoUG9pbnRlckV2ZW50RGlzcGF0Y2hlciB9IGZyb20gJy4vcG9pbnRlci1maXgnO1xuaW1wb3J0IHsgY2hlY2tIb3ZlciB9IGZyb20gJy4vaG92ZXInO1xuaW1wb3J0IHsgcmVhZHlVcGRhdGVUcmVlIH0gZnJvbSAnLi90cmVlJztcbmltcG9ydCB7IHJlbW92ZVByZXZpZXdQYWdlQ2hyb21lIH0gZnJvbSAnLi9taXNjJztcblxuY29uc3QgQ0NfREVURUNUX1JFVFJJRVMgPSAzMDtcbmNvbnN0IENDX0RFVEVDVF9JTlRFUlZBTF9NUyA9IDEwMDtcblxubGV0IHJldHJ5Q291bnQgPSAwO1xuXG5mdW5jdGlvbiByZWZyZXNoRGVzaWduUmVzb2x1dGlvbigpOiB2b2lkIHtcbiAgICBjb25zdCBkZXNpZ25TaXplID0gY2Mudmlldy5nZXREZXNpZ25SZXNvbHV0aW9uU2l6ZSgpO1xuICAgIGNjLnZpZXcuc2V0RGVzaWduUmVzb2x1dGlvblNpemUoIGRlc2lnblNpemUud2lkdGgsIGRlc2lnblNpemUuaGVpZ2h0LCBjYy52aWV3LmdldFJlc29sdXRpb25Qb2xpY3koKSApO1xuICAgIHJlZnJlc2hDYW52YXNDYW1lcmFzKCk7XG59XG5cbi8qKlxuICogUmUtZml0cyBldmVyeSBVSSBjYW1lcmEgdG8gdGhlIHZpc2libGUgYXJlYS4gSW4gQ3JlYXRvciAzLnggdGhlIENhbnZhcyByZWFsaWducyBpdHMgbm9kZSBvbiBhXG4gKiB2aWV3IHJlc2l6ZSwgYnV0IHRoZSBvcnRobyBoZWlnaHQgb2YgaXRzIGNhbWVyYSBjYW4gc3RheSBhdCB0aGUgcHJlLXJlc2l6ZSB2YWx1ZSwgd2hpY2ggc2hvd3NcbiAqIHRoZSBzY2VuZSB6b29tZWQgaW4gYW5kIGNyb3BzIHRoZSB0b3AvYm90dG9tIGVkZ2VzIG9mIHRoZSBnYW1lIHZpZXcuXG4gKi9cbmZ1bmN0aW9uIHJlZnJlc2hDYW52YXNDYW1lcmFzKCk6IHZvaWQge1xuICAgIGNvbnN0IHNjZW5lID0gY2MuZGlyZWN0b3IuZ2V0U2NlbmUoKTtcbiAgICBjb25zdCBDYW52YXNDbGFzcyA9IGNjLkNhbnZhcztcbiAgICBpZiAoICFzY2VuZSB8fCAhQ2FudmFzQ2xhc3MgKSByZXR1cm47XG4gICAgY29uc3QgdGFyZ2V0T3J0aG9IZWlnaHQgPSBjYy52aWV3LmdldFZpc2libGVTaXplKCkuaGVpZ2h0IC8gMjtcbiAgICBzY2VuZS5nZXRDb21wb25lbnRzSW5DaGlsZHJlbiggQ2FudmFzQ2xhc3MgKS5mb3JFYWNoKCAoIGNhbnZhczogYW55ICkgPT4ge1xuICAgICAgICBjb25zdCBjYW1lcmEgPSBjYW52YXMuY2FtZXJhQ29tcG9uZW50O1xuICAgICAgICBpZiAoIGNhbWVyYSAmJiBjYW1lcmEub3J0aG9IZWlnaHQgIT09IHRhcmdldE9ydGhvSGVpZ2h0ICkgY2FtZXJhLm9ydGhvSGVpZ2h0ID0gdGFyZ2V0T3J0aG9IZWlnaHQ7XG4gICAgfSApO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaW5pdEVuZ2luZUhvb2tzKCByZXRyeWluZyA9IGZhbHNlICk6IHZvaWQge1xuICAgIGlmICggISggd2luZG93IGFzIGFueSApLmNjICkge1xuICAgICAgICBpZiAoIHJldHJ5Q291bnQgPCBDQ19ERVRFQ1RfUkVUUklFUyApIHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoICgpID0+IGluaXRFbmdpbmVIb29rcyggdHJ1ZSApLCBDQ19ERVRFQ1RfSU5URVJWQUxfTVMgKTtcbiAgICAgICAgICAgIHJldHJ5Q291bnQrKztcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIHJldHJ5aW5nICkgY29uc29sZS5lcnJvciggJ21heWJlIHRoaXMgaXMgbm90IGEgQ29jb3NDcmVhdG9yIEdhbWUnICk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gZW5naW5lIGxvZ2dpbmcgc2hvdWxkIHJlYWNoIHRoZSAod3JhcHBlZCkgY29uc29sZSBzbyB0aGUgaW5zcGVjdG9yIHNlZXMgaXRcbiAgICBjYy5sb2cgPSBjb25zb2xlLmxvZztcbiAgICBjYy53YXJuID0gY29uc29sZS53YXJuO1xuICAgIGNjLmVycm9yID0gY29uc29sZS5lcnJvcjtcbiAgICBhcHBseUVuZ2luZUFsaWFzZXMoKTtcbiAgICBwYXRjaFBvaW50ZXJFdmVudERpc3BhdGNoZXIoKTtcblxuICAgIGlmICggQ0NfUFJFVklFVyAmJiAhY2MuRU5HSU5FX1ZFUlNJT04uc3RhcnRzV2l0aCggJzEuJyApICkge1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lciggJ3Jlc2l6ZScsIHJlZnJlc2hEZXNpZ25SZXNvbHV0aW9uLCB7IGNhcHR1cmU6IHRydWUgfSApO1xuICAgIH1cblxuICAgIGNjLmRpcmVjdG9yLm9uKCBjYy5EaXJlY3Rvci5FVkVOVF9BRlRFUl9TQ0VORV9MQVVOQ0gsICgpID0+IHtcbiAgICAgICAgY2hlY2tIb3ZlcigpO1xuICAgICAgICByZW1vdmVQcmV2aWV3UGFnZUNocm9tZSgpO1xuICAgICAgICByZWFkeVVwZGF0ZVRyZWUoIHRydWUgKTtcbiAgICAgICAgc2V0VGltZW91dCggcmVmcmVzaERlc2lnblJlc29sdXRpb24sIDAgKTtcbiAgICAgICAgc2VuZEdhbWVTdGF0ZSggY2MuZ2FtZS5pc1BhdXNlZCgpICk7XG4gICAgICAgIGlmICggISggd2luZG93IGFzIGFueSApLmZndWkgJiYgQ0NfQlVJTEQgKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIFN5c3RlbS5pbXBvcnQoICdjaHVua3M6Ly8vX3ZpcnR1YWwvZmFpcnlndWkubWpzJyApLnRoZW4oICggZmd1aU1vZHVsZSApID0+IHtcbiAgICAgICAgICAgICAgICAgICAgKCB3aW5kb3cgYXMgYW55ICkuZmd1aSA9IGZndWlNb2R1bGU7XG4gICAgICAgICAgICAgICAgICAgIGlmICggZmd1aU1vZHVsZSApIHJlYWR5VXBkYXRlVHJlZSgpO1xuICAgICAgICAgICAgICAgIH0gKS5jYXRjaCggKCkgPT4geyAvKiBnYW1lIGhhcyBubyBmZ3VpIGJ1bmRsZSAqLyB9ICk7XG4gICAgICAgICAgICB9IGNhdGNoIHsgLyogU3lzdGVtIG1heSBiZSBhYnNlbnQgaW4gZXhvdGljIGJ1aWxkcyAqLyB9XG4gICAgICAgIH1cbiAgICB9ICk7XG4gICAgaWYgKCBjYy5kaXJlY3Rvci5nZXRTY2VuZSgpICkgcmVhZHlVcGRhdGVUcmVlKCB0cnVlICk7XG5cbiAgICAvLyBrZWVwIHRoZSBpbnNwZWN0b3IncyBwbGF5L3BhdXNlIGJ1dHRvbiBzdGF0ZSBpbiBzeW5jIHdpdGggdGhlIGdhbWVcbiAgICBjb25zdCBvcmlnaW5hbFBhdXNlID0gY2MuZ2FtZS5wYXVzZTtcbiAgICBjYy5nYW1lLnBhdXNlID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBvcmlnaW5hbFBhdXNlLmNhbGwoIGNjLmdhbWUgKTtcbiAgICAgICAgc2VuZEdhbWVTdGF0ZSggY2MuZ2FtZS5pc1BhdXNlZCgpICk7XG4gICAgfTtcbiAgICBjb25zdCBvcmlnaW5hbFJlc3VtZSA9IGNjLmdhbWUucmVzdW1lO1xuICAgIGNjLmdhbWUucmVzdW1lID0gZnVuY3Rpb24gKCkge1xuICAgICAgICBvcmlnaW5hbFJlc3VtZS5jYWxsKCBjYy5nYW1lICk7XG4gICAgICAgIHNlbmRHYW1lU3RhdGUoIGNjLmdhbWUuaXNQYXVzZWQoKSApO1xuICAgIH07XG4gICAgY2MuX2lzQ29udGV4dE1lbnVFbmFibGUgPSB0cnVlO1xufVxuIiwgIi8vIEluamVjdGVkIHByb2JlIGVudHJ5IHBvaW50LiBUaGUgaW5zcGVjdG9yIHJlbmRlcmVyIGNhbGxzIHRoZSBleHBvc2VkIHdpbmRvdyBnbG9iYWxzIHRocm91Z2hcbi8vIHdlYnZpZXcuZXhlY3V0ZUphdmFTY3JpcHQsIHNvIGV2ZXJ5IG5hbWUgaGVyZSBpcyBwYXJ0IG9mIHRoZSByZW5kZXJlciA8LT4gcHJvYmUgY29udHJhY3QuXG5pbXBvcnQgeyB3IH0gZnJvbSAnLi9zdGF0ZSc7XG5pbXBvcnQgeyBpc0VuZ2luZTNfNE9yTmV3ZXIgfSBmcm9tICcuL2VuZ2luZS1jb21wYXQnO1xuaW1wb3J0IHtcbiAgICB0b2dnbGVEQywgbG9jYXRlTm9kZUJ5UGF0aCwgc3luY09wZW4sIHN5bmNPcGVuRmNvbSwgcmVhZHlVcGRhdGVUcmVlLCB1cGRhdGVUcmVlLFxufSBmcm9tICcuL3RyZWUnO1xuaW1wb3J0IHsgc2V0QnJlYWtQb2ludCwgcmVtb3ZlQnJlYWtQb2ludCwgcmVtb3ZlQWxsQnJlYWtQb2ludHMsIHRvZ2dsZUF1dG9VcGRhdGVTdXBwcmVzc2lvbiB9IGZyb20gJy4vYnJlYWtwb2ludHMnO1xuaW1wb3J0IHsgaW5pdExvZ0xpc3RlbmVycyB9IGZyb20gJy4vY29uc29sZS1ob29rcyc7XG5pbXBvcnQgeyBzZXRIb3ZlciwgdG9nZ2xlRGVzaWduTW9kZSwgY2hlY2tIb3ZlciB9IGZyb20gJy4vaG92ZXInO1xuaW1wb3J0IHsgZHJhd1JlY3QsIGNsZWFyUmVjdCB9IGZyb20gJy4vZHJhdy1yZWN0JztcbmltcG9ydCB7XG4gICAgZ2V0Tm9kZURldGFpbCwgc2V0Q29tQXR0ciwgZXhlY0NvbXBNZXRob2QsIHRvZ2dsZUNvbXAsIHJlbW92ZUNvbXAsXG4gICAgc3luY05vZGUsIHN5bmNOb2RlQ29sb3IsIHJlYWR5R2V0Tm9kZURldGFpbCxcbn0gZnJvbSAnLi9ub2RlLWRldGFpbCc7XG5pbXBvcnQgeyBjb2RlVGlwIH0gZnJvbSAnLi9jb2RlLXRpcCc7XG5pbXBvcnQge1xuICAgIGdldFBhdGgsIGdldFBhdGhCeUlkLCBnZXRVdWlkUGF0aEJ5UGF0aCwgcHJpbnRQYXRoLFxuICAgIHN0b3JlSW5HbG9iYWwsIHN0b3JlQ29tcEluR2xvYmFsLCBnZXRDb21wLCBzZWFyY2hDb21zLFxufSBmcm9tICcuL25vZGUtcGF0aCc7XG5pbXBvcnQge1xuICAgIHRvZ2dsZU5vZGVBY3RpdmUsIHJlbW92ZU5vZGUsIGxvY2tEcmFnTm9kZSwgc3dhcFBvcywgdG9nZ2xlRnBzLFxuICAgIHN0YXJ0U3RhdGlzdGljLCB1cGRhdGVSZXNpemUsIHJlc2l6ZUNhbnZhcywgcmVtb3ZlUHJldmlld1BhZ2VDaHJvbWUsIHJlQ29tcGlsZSxcbn0gZnJvbSAnLi9taXNjJztcbmltcG9ydCB7IGluaXRFbmdpbmVIb29rcyB9IGZyb20gJy4vaW5pdCc7XG5cbmlmICggIXcuX19pbml0TG9nTGlzdGVuZXJzICkge1xuICAgIE9iamVjdC5hc3NpZ24oIHcsIHtcbiAgICAgICAgLy8gbGlmZWN5Y2xlXG4gICAgICAgIF9faW5pdExvZ0xpc3RlbmVyczogaW5pdExvZ0xpc3RlbmVycyxcbiAgICAgICAgX19pbml0U2Y6IGluaXRFbmdpbmVIb29rcyxcbiAgICAgICAgLy8gdHJlZVxuICAgICAgICBfX3VwZGF0ZVRyZWU6IHVwZGF0ZVRyZWUsXG4gICAgICAgIF9fcmVhZHlVcGRhdGVUcmVlOiByZWFkeVVwZGF0ZVRyZWUsXG4gICAgICAgIF9fbG9jYXRlTm9kZTogbG9jYXRlTm9kZUJ5UGF0aCxcbiAgICAgICAgX19zeW5jT3Blbjogc3luY09wZW4sXG4gICAgICAgIF9fc3luY09wZW5GY29tOiBzeW5jT3BlbkZjb20sXG4gICAgICAgIF9fdG9nZ2xlREM6IHRvZ2dsZURDLFxuICAgICAgICBfX3RvZ2dsZU5vZGU6IHRvZ2dsZU5vZGVBY3RpdmUsXG4gICAgICAgIF9fcmVtb3ZlTm9kZTogcmVtb3ZlTm9kZSxcbiAgICAgICAgX19zd2FwUG9zOiBzd2FwUG9zLFxuICAgICAgICBfX2Rvbm90QXV0b1VwZGF0ZTogdG9nZ2xlQXV0b1VwZGF0ZVN1cHByZXNzaW9uLFxuICAgICAgICAvLyBicmVha3BvaW50c1xuICAgICAgICBfX3NldEJyZWFrUG9pbnQ6IHNldEJyZWFrUG9pbnQsXG4gICAgICAgIF9fcmVtb3ZlQnJlYWtQb2ludDogcmVtb3ZlQnJlYWtQb2ludCxcbiAgICAgICAgX19yZW1vdmVBbGxCcmVha1BvaW50OiByZW1vdmVBbGxCcmVha1BvaW50cyxcbiAgICAgICAgLy8gaG92ZXIgLyBkZXNpZ24gbW9kZVxuICAgICAgICBfX3NldEhvdmVyOiBzZXRIb3ZlcixcbiAgICAgICAgX190b2dnbGVEZXNpZ25Nb2RlOiB0b2dnbGVEZXNpZ25Nb2RlLFxuICAgICAgICBfX3RvZ2dsZURyYWc6IGxvY2tEcmFnTm9kZSxcbiAgICAgICAgX19jaGVja0hvdmVyOiBjaGVja0hvdmVyLFxuICAgICAgICBfX2RyYXdSZWN0OiBkcmF3UmVjdCxcbiAgICAgICAgX19jbGVhclJlY3Q6IGNsZWFyUmVjdCxcbiAgICAgICAgLy8gbm9kZSBkZXRhaWxcbiAgICAgICAgX19nZXROb2RlRGV0YWlsOiBnZXROb2RlRGV0YWlsLFxuICAgICAgICBfX3JlYWR5R2V0Tm9kZURldGFpbDogcmVhZHlHZXROb2RlRGV0YWlsLFxuICAgICAgICBfX3NldENvbUF0dHI6IHNldENvbUF0dHIsXG4gICAgICAgIF9fZXhlY0NvbXBNZXRob2Q6IGV4ZWNDb21wTWV0aG9kLFxuICAgICAgICBfX3RvZ2dsZUNvbXA6IHRvZ2dsZUNvbXAsXG4gICAgICAgIF9fcmVtb3ZlQ29tcDogcmVtb3ZlQ29tcCxcbiAgICAgICAgX19zeW5jTm9kZTogc3luY05vZGUsXG4gICAgICAgIF9fc3luY05vZGVDb2xvcjogc3luY05vZGVDb2xvcixcbiAgICAgICAgLy8gY29uc29sZSBoZWxwZXJzIC8gc2VhcmNoXG4gICAgICAgIF9fY29kZVRpcDogY29kZVRpcCxcbiAgICAgICAgX19zZWFyY2hDb21zOiBzZWFyY2hDb21zLFxuICAgICAgICBfX3ByaW50UGF0aDogcHJpbnRQYXRoLFxuICAgICAgICBfX2dldFBhdGg6IGdldFBhdGgsXG4gICAgICAgIF9fZ2V0UGF0aEJ5aWQ6IGdldFBhdGhCeUlkLFxuICAgICAgICBfX2dldFV1aWRQYXRoQnlQYXRoOiBnZXRVdWlkUGF0aEJ5UGF0aCxcbiAgICAgICAgX19zdG9yZUluR2xvYmFsOiBzdG9yZUluR2xvYmFsLFxuICAgICAgICBfX3N0b3JlQ29tcEluR2xvYmFsOiBzdG9yZUNvbXBJbkdsb2JhbCxcbiAgICAgICAgX19nZXRDb21wOiBnZXRDb21wLFxuICAgICAgICAvLyBtaXNjXG4gICAgICAgIF9fdG9nZ2xlRnBzOiB0b2dnbGVGcHMsXG4gICAgICAgIF9fc3RhcnRTdGF0aXN0aWM6IHN0YXJ0U3RhdGlzdGljLFxuICAgICAgICBfX3VwZGF0ZVJlc2l6ZTogdXBkYXRlUmVzaXplLFxuICAgICAgICBfX3Jlc2l6ZUN2bjogcmVzaXplQ2FudmFzLFxuICAgICAgICBfX3JlbW92ZU90aGVyTm9kZXM6IHJlbW92ZVByZXZpZXdQYWdlQ2hyb21lLFxuICAgICAgICBfX3JlQ29tcGlsZTogcmVDb21waWxlLFxuICAgICAgICBfX21vcmVUaGVuM180XzA6IGlzRW5naW5lM180T3JOZXdlcixcbiAgICB9ICk7XG5cbiAgICAvLyBmZ3VpIHN1cHBvcnQgaW4gcHJldmlldyBtb2RlOiB0aGUgbW9kdWxlIGxpdmVzIGluIHRoZSBwcmV2aWV3IHNlcnZlcidzIG1vZHVsZSByZWdpc3RyeVxuICAgIGlmICggIXcuZmd1aSAmJiB0eXBlb2YgU3lzdGVtICE9PSAndW5kZWZpbmVkJyApIHtcbiAgICAgICAgU3lzdGVtLmltcG9ydCggJ2ZhaXJ5Z3VpLWNjJywgbG9jYXRpb24ub3JpZ2luICsgJy9zY3JpcHRpbmcveC9tb2RzLycgKVxuICAgICAgICAgICAgLnRoZW4oICggZmd1aU1vZHVsZSApID0+IHsgdy5mZ3VpID0gZmd1aU1vZHVsZTsgfSApXG4gICAgICAgICAgICAuY2F0Y2goICgpID0+IHsgLyogcHJvamVjdCBkb2VzIG5vdCB1c2UgZmd1aSAqLyB9ICk7XG4gICAgfVxuXG4gICAgaW5pdExvZ0xpc3RlbmVycygpO1xuICAgIGluaXRFbmdpbmVIb29rcygpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7O0FBR08sTUFBTSxJQUFJO0FBR1YsTUFBTSxZQUFtQyxFQUFFLE9BQU8sRUFBRSxRQUFRLENBQUM7QUFHN0QsTUFBTSxRQUFRO0FBQUEsSUFDakIsSUFBSSxRQUFnQjtBQUFFLGFBQU8sRUFBRSxXQUFXO0FBQUEsSUFBRztBQUFBLElBQzdDLElBQUksTUFBTyxPQUFnQjtBQUFFLFFBQUUsVUFBVTtBQUFBLElBQU87QUFBQSxJQUNoRCxJQUFJLGFBQXNCO0FBQUUsYUFBTyxRQUFTLEVBQUUsWUFBYTtBQUFBLElBQUc7QUFBQSxJQUM5RCxJQUFJLFdBQVksT0FBaUI7QUFBRSxRQUFFLGVBQWU7QUFBQSxJQUFPO0FBQUEsSUFDM0QsSUFBSSxlQUE4QjtBQUFFLGFBQU8sRUFBRSxrQkFBa0I7QUFBQSxJQUFNO0FBQUEsSUFDckUsSUFBSSxhQUFjLE9BQXVCO0FBQUUsUUFBRSxpQkFBaUI7QUFBQSxJQUFPO0FBQUEsSUFDckUsSUFBSSxpQkFBMEI7QUFBRSxhQUFPLEVBQUUsb0JBQW9CO0FBQUEsSUFBTTtBQUFBLElBQ25FLElBQUksaUJBQTBCO0FBQUUsYUFBTyxRQUFTLEVBQUUsZ0JBQWlCO0FBQUEsSUFBRztBQUFBLElBQ3RFLElBQUksV0FBbUI7QUFBRSxhQUFPLE9BQVEsRUFBRSxjQUFjLENBQUU7QUFBQSxJQUFHO0FBQUEsSUFDN0QsSUFBSSxtQkFBNEI7QUFBRSxhQUFPLFFBQVMsRUFBRSxrQkFBbUI7QUFBQSxJQUFHO0FBQUEsSUFDMUUsSUFBSSxZQUFxQjtBQUFFLGFBQU8sUUFBUyxFQUFFLFdBQVk7QUFBQSxJQUFHO0FBQUEsSUFDNUQsSUFBSSxVQUFXLE9BQWlCO0FBQUUsUUFBRSxjQUFjO0FBQUEsSUFBTztBQUFBLEVBQzdEO0FBR08sTUFBTSxjQUF1RCxDQUFD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QWUsR0FBRyxLQUFLLFNBQVMsQ0FBRTtBQUFBLElBQ3RDO0FBQ0EsT0FBRyx1QkFBdUI7QUFBQSxFQUM5Qjs7O0FDMURBLE1BQUssQ0FBQyxFQUFFLG9CQUFxQjtBQUN6QixXQUFPLE9BQVEsR0FBRztBQUFBO0FBQUEsTUFFZCxvQkFBb0I7QUFBQSxNQUNwQixVQUFVO0FBQUE7QUFBQSxNQUVWLGNBQWM7QUFBQSxNQUNkLG1CQUFtQjtBQUFBLE1BQ25CLGNBQWM7QUFBQSxNQUNkLFlBQVk7QUFBQSxNQUNaLGdCQUFnQjtBQUFBLE1BQ2hCLFlBQVk7QUFBQSxNQUNaLGNBQWM7QUFBQSxNQUNkLGNBQWM7QUFBQSxNQUNkLFdBQVc7QUFBQSxNQUNYLG1CQUFtQjtBQUFBO0FBQUEsTUFFbkIsaUJBQWlCO0FBQUEsTUFDakIsb0JBQW9CO0FBQUEsTUFDcEIsdUJBQXVCO0FBQUE7QUFBQSxNQUV2QixZQUFZO0FBQUEsTUFDWixvQkFBb0I7QUFBQSxNQUNwQixjQUFjO0FBQUEsTUFDZCxjQUFjO0FBQUEsTUFDZCxZQUFZO0FBQUEsTUFDWixhQUFhO0FBQUE7QUFBQSxNQUViLGlCQUFpQjtBQUFBLE1BQ2pCLHNCQUFzQjtBQUFBLE1BQ3RCLGNBQWM7QUFBQSxNQUNkLGtCQUFrQjtBQUFBLE1BQ2xCLGNBQWM7QUFBQSxNQUNkLGNBQWM7QUFBQSxNQUNkLFlBQVk7QUFBQSxNQUNaLGlCQUFpQjtBQUFBO0FBQUEsTUFFakIsV0FBVztBQUFBLE1BQ1gsY0FBYztBQUFBLE1BQ2QsYUFBYTtBQUFBLE1BQ2IsV0FBVztBQUFBLE1BQ1gsZUFBZTtBQUFBLE1BQ2YscUJBQXFCO0FBQUEsTUFDckIsaUJBQWlCO0FBQUEsTUFDakIscUJBQXFCO0FBQUEsTUFDckIsV0FBVztBQUFBO0FBQUEsTUFFWCxhQUFhO0FBQUEsTUFDYixrQkFBa0I7QUFBQSxNQUNsQixnQkFBZ0I7QUFBQSxNQUNoQixhQUFhO0FBQUEsTUFDYixvQkFBb0I7QUFBQSxNQUNwQixhQUFhO0FBQUEsTUFDYixpQkFBaUI7QUFBQSxJQUNyQixDQUFFO0FBR0YsUUFBSyxDQUFDLEVBQUUsUUFBUSxPQUFPLFdBQVcsYUFBYztBQUM1QyxhQUFPLE9BQVEsZUFBZSxTQUFTLFNBQVMsb0JBQXFCLEVBQ2hFLEtBQU0sQ0FBRSxlQUFnQjtBQUFFLFVBQUUsT0FBTztBQUFBLE1BQVksQ0FBRSxFQUNqRCxNQUFPLE1BQU07QUFBQSxNQUFrQyxDQUFFO0FBQUEsSUFDMUQ7QUFFQSxxQkFBaUI7QUFDakIsb0JBQWdCO0FBQUEsRUFDcEI7IiwKICAibmFtZXMiOiBbImxvY2F0aW9uIl0KfQo=
