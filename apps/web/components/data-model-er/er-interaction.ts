export interface ErPoint {
  x: number;
  y: number;
}

export interface ErRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ErCamera extends ErPoint {
  scale: number;
}

export type ErPointerMode = "IDLE" | "PENDING" | "DRAGGING_ENTITY" | "PANNING";

export interface ErDragState {
  entityId: string;
  startWorld: ErPoint;
  currentWorld: ErPoint;
  deltaWorld: ErPoint;
}

export interface ErPointerState {
  mode: ErPointerMode;
  camera: ErCamera;
  pointerId?: number;
  entityId?: string;
  fieldId?: string;
  startScreen?: ErPoint;
  currentScreen?: ErPoint;
  startCamera?: ErCamera;
  startWorld?: ErPoint;
  currentWorld?: ErPoint;
  movement: number;
  moved: boolean;
  pointerCaptured: boolean;
  drag?: ErDragState;
  selectedEntityId?: string;
  selectedFieldId?: string;
}

export type ErPointerEvent =
  | { type: "POINTER_DOWN"; point: ErPoint; pointerId: number; entityId?: string; fieldId?: string; button?: number }
  | { type: "POINTER_MOVE"; point: ErPoint; pointerId?: number }
  | { type: "POINTER_UP"; point?: ErPoint; pointerId?: number }
  | { type: "POINTER_CANCEL"; pointerId?: number }
  | { type: "WHEEL"; point: ErPoint; deltaY: number }
  | { type: "SET_CAMERA"; camera: ErCamera };

export interface ErHitTarget {
  id: string;
  rect: ErRect;
}

export const ER_DRAG_THRESHOLD = 8;
export const ER_MIN_CAMERA_SCALE = 0.25;
export const ER_MAX_CAMERA_SCALE = 3;
export const DEFAULT_ER_CAMERA: ErCamera = { x: 0, y: 0, scale: 1 };

export function createErPointerState(camera: ErCamera = DEFAULT_ER_CAMERA): ErPointerState {
  return { mode: "IDLE", camera: normalizeCamera(camera), movement: 0, moved: false, pointerCaptured: false };
}

export function reduceErPointer(event: ErPointerEvent, state: ErPointerState = createErPointerState()): ErPointerState {
  switch (event.type) {
    case "POINTER_DOWN":
      return pointerDown(event, state);
    case "POINTER_MOVE":
      return handlePointerMove(event, state);
    case "POINTER_UP":
      return handlePointerUp(event, state);
    case "POINTER_CANCEL":
      return resetPointer(state);
    case "WHEEL":
      return { ...state, camera: zoomAtPoint(state.camera, event.point, event.deltaY) };
    case "SET_CAMERA":
      return { ...state, camera: normalizeCamera(event.camera) };
  }
}

export function pointerDownOnEntity(entityId: string, point: ErPoint, options: { pointerId?: number; fieldId?: string } = {}): ErPointerEvent {
  return { type: "POINTER_DOWN", point, pointerId: options.pointerId ?? 1, entityId, ...(options.fieldId ? { fieldId: options.fieldId } : {}) };
}

export function pointerDownOnCanvas(point: ErPoint, pointerId = 1): ErPointerEvent {
  return { type: "POINTER_DOWN", point, pointerId };
}

export function pointerDownOnField(entityId: string, fieldId: string, point: ErPoint, pointerId = 1): ErPointerEvent {
  return pointerDownOnEntity(entityId, point, { pointerId, fieldId });
}

export function pointerMove(point: ErPoint, pointerId = 1): ErPointerEvent {
  return { type: "POINTER_MOVE", point, pointerId };
}

export function pointerUp(point?: ErPoint, pointerId = 1): ErPointerEvent {
  return { type: "POINTER_UP", ...(point ? { point } : {}), pointerId };
}

export function pointerCancel(pointerId = 1): ErPointerEvent {
  return { type: "POINTER_CANCEL", pointerId };
}

export function screenToWorld(point: ErPoint, camera: ErCamera): ErPoint {
  const safeCamera = normalizeCamera(camera);
  return { x: (point.x - safeCamera.x) / safeCamera.scale, y: (point.y - safeCamera.y) / safeCamera.scale };
}

export function worldToScreen(point: ErPoint, camera: ErCamera): ErPoint {
  const safeCamera = normalizeCamera(camera);
  return { x: point.x * safeCamera.scale + safeCamera.x, y: point.y * safeCamera.scale + safeCamera.y };
}

export function clampCameraScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_ER_CAMERA.scale;
  return Math.min(ER_MAX_CAMERA_SCALE, Math.max(ER_MIN_CAMERA_SCALE, scale));
}

export function panCamera(camera: ErCamera, delta: ErPoint): ErCamera {
  const safeCamera = normalizeCamera(camera);
  return { x: safeCamera.x + finiteOrZero(delta.x), y: safeCamera.y + finiteOrZero(delta.y), scale: safeCamera.scale };
}

export function zoomAtPoint(camera: ErCamera, point: ErPoint, deltaY: number): ErCamera {
  const safeCamera = normalizeCamera(camera);
  const anchorWorld = screenToWorld(point, safeCamera);
  const nextScale = clampCameraScale(safeCamera.scale * Math.exp(-finiteOrZero(deltaY) * 0.001));
  return { scale: nextScale, x: point.x - anchorWorld.x * nextScale, y: point.y - anchorWorld.y * nextScale };
}

export function hitTestEntity(point: ErPoint, targets: readonly ErHitTarget[] | ReadonlyMap<string, ErRect>, camera: ErCamera = DEFAULT_ER_CAMERA): string | undefined {
  return hitTest(point, targets, camera);
}

export function hitTestField(point: ErPoint, targets: readonly ErHitTarget[] | ReadonlyMap<string, ErRect>, camera: ErCamera = DEFAULT_ER_CAMERA): string | undefined {
  return hitTest(point, targets, camera);
}

function pointerDown(event: Extract<ErPointerEvent, { type: "POINTER_DOWN" }>, state: ErPointerState): ErPointerState {
  if (event.button !== undefined && event.button !== 0) return state;
  const startWorld = screenToWorld(event.point, state.camera);
  return {
    ...state,
    mode: "PENDING",
    pointerId: event.pointerId,
    ...(event.entityId ? { entityId: event.entityId } : {}),
    ...(event.fieldId ? { fieldId: event.fieldId } : {}),
    startScreen: event.point,
    currentScreen: event.point,
    startCamera: state.camera,
    startWorld,
    currentWorld: startWorld,
    movement: 0,
    moved: false,
    pointerCaptured: false,
    drag: undefined
  };
}

function handlePointerMove(event: Extract<ErPointerEvent, { type: "POINTER_MOVE" }>, state: ErPointerState): ErPointerState {
  if (state.mode === "IDLE" || (state.pointerId !== undefined && event.pointerId !== undefined && state.pointerId !== event.pointerId)) return state;
  const startScreen = state.startScreen ?? event.point;
  const currentWorld = screenToWorld(event.point, state.camera);
  const movement = distance(startScreen, event.point);
  const moved = state.moved || movement >= ER_DRAG_THRESHOLD;
  const nextMode = state.mode === "PENDING" && moved ? (state.entityId ? "DRAGGING_ENTITY" : "PANNING") : state.mode;
  const next: ErPointerState = { ...state, mode: nextMode, currentScreen: event.point, currentWorld, movement, moved };
  if (nextMode === "DRAGGING_ENTITY" && state.entityId && state.startWorld) {
    next.pointerCaptured = true;
    next.drag = { entityId: state.entityId, startWorld: state.startWorld, currentWorld, deltaWorld: { x: currentWorld.x - state.startWorld.x, y: currentWorld.y - state.startWorld.y } };
  } else if (nextMode === "PANNING" && state.startScreen) {
    next.camera = panCamera(state.startCamera ?? state.camera, { x: event.point.x - state.startScreen.x, y: event.point.y - state.startScreen.y });
  }
  return next;
}

function handlePointerUp(event: Extract<ErPointerEvent, { type: "POINTER_UP" }>, state: ErPointerState): ErPointerState {
  if (state.pointerId !== undefined && event.pointerId !== undefined && state.pointerId !== event.pointerId) return state;
  const clicked = state.mode === "PENDING" && !state.moved;
  return {
    ...state,
    mode: "IDLE",
    pointerId: undefined,
    entityId: undefined,
    fieldId: undefined,
    startScreen: undefined,
    currentScreen: event.point ?? state.currentScreen,
    startCamera: undefined,
    startWorld: undefined,
    currentWorld: undefined,
    movement: 0,
    moved: false,
    pointerCaptured: false,
    drag: undefined,
    ...(clicked && state.entityId ? { selectedEntityId: state.entityId } : {}),
    ...(clicked && state.fieldId ? { selectedFieldId: state.fieldId } : {})
  };
}

function resetPointer(state: ErPointerState): ErPointerState {
  return { ...state, mode: "IDLE", pointerId: undefined, entityId: undefined, fieldId: undefined, startScreen: undefined, currentScreen: undefined, startCamera: undefined, startWorld: undefined, currentWorld: undefined, movement: 0, moved: false, pointerCaptured: false, drag: undefined };
}

function hitTest(point: ErPoint, targets: readonly ErHitTarget[] | ReadonlyMap<string, ErRect>, camera: ErCamera): string | undefined {
  const worldPoint = screenToWorld(point, camera);
  const entries: readonly ErHitTarget[] = Array.isArray(targets) ? targets : [...targets.entries()].map(([id, rect]) => ({ id, rect }));
  return entries.find(({ rect }) => rectContains(rect, worldPoint))?.id;
}

function rectContains(rect: ErRect, point: ErPoint): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function normalizeCamera(camera: ErCamera): ErCamera {
  return { x: finiteOrZero(camera.x), y: finiteOrZero(camera.y), scale: clampCameraScale(camera.scale) };
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function distance(left: ErPoint, right: ErPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}
