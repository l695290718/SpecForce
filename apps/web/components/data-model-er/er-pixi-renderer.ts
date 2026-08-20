import { Application, Container, Graphics, Rectangle, Text, TextStyle } from "pixi.js";
import type { ErDiagramProjection, ErEntityCard, ErFieldRow } from "./er-diagram-projection";
import { projectErDiagram } from "./er-diagram-projection";
import type { ErGraphState } from "./er-graph-store";
import { deriveErLod } from "./er-graph-store";
import {
  createErPointerState,
  DEFAULT_ER_CAMERA,
  pointerDownOnCanvas,
  pointerDownOnEntity,
  pointerDownOnField,
  pointerMove,
  pointerUp,
  reduceErPointer,
  type ErCamera,
  type ErPoint,
  type ErPointerState
} from "./er-interaction";
import { layoutErDiagramWithFallback, type ErLayoutResult } from "./er-layout";
import { createErPositionStore, ER_POSITION_SCHEMA_VERSION, type ErEntityPositions, type ErPositionKey, type ErPositionStore } from "./er-position-store";
import { ErTextureCache } from "./er-texture-cache";

export type ErRendererFailure = "WEBGL_UNAVAILABLE" | "WEBGL_CONTEXT_LOST" | "LAYOUT_DEGRADED" | "CLIENT_CAPACITY_EXCEEDED";

export interface ErRendererStatus {
  ready: boolean;
  failure?: ErRendererFailure;
  lod: ReturnType<typeof deriveErLod>;
}

export interface ErRendererSelection {
  entityId?: string;
  fieldId?: string;
  relationId?: string;
}

export interface ErPixiRendererOptions {
  locale?: "en" | "zh";
  onStatus?(status: ErRendererStatus): void;
  onEntitySelect?(entityId: string): void;
  onFieldSelect?(fieldId: string): void;
  onRelationSelect?(relationId: string): void;
  onPositionChange?(positions: ErEntityPositions): void;
  onCameraChange?(camera: ErCamera): void;
  positionStore?: ErPositionStore;
  maxTextures?: number;
}

export interface ErDrawField {
  id: string;
  entityId: string;
  row: ErLayoutResult["fieldRows"][string];
  field: ErFieldRow;
  selected: boolean;
}

export interface ErDrawEntity {
  id: string;
  entity: ErEntityCard;
  x: number;
  y: number;
  width: number;
  height: number;
  headerHeight: number;
  fields: ErDrawField[];
  selected: boolean;
}

export interface ErDrawRoute {
  id: string;
  relationId: string;
  points: ErPoint[];
  sourceFieldId?: string;
  targetFieldId?: string;
  selected: boolean;
  mappingConfigured: boolean;
}

export interface ErDrawModel {
  camera: ErCamera;
  lod: ReturnType<typeof deriveErLod>;
  entities: ErDrawEntity[];
  routes: ErDrawRoute[];
}

export interface ErDrawModelOptions {
  camera?: ErCamera;
  selection?: ErRendererSelection;
}

const CARD_HEADER_HEIGHT = 48;
const ROUTE_COLOR = 0x64748b;
const SELECTED_COLOR = 0x0f766e;
const FIELD_PORT_COLOR = 0x0891b2;

export function buildErDrawModel(projection: ErDiagramProjection, layout: ErLayoutResult, options: ErDrawModelOptions = {}): ErDrawModel {
  const camera = options.camera ?? DEFAULT_ER_CAMERA;
  const selection = options.selection ?? {};
  const lod = deriveErLod(projection.entities.length, layout.routes.length, camera.scale);
  const entities = layout.entities.map((item) => ({
    id: item.id,
    entity: item.entity,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    headerHeight: CARD_HEADER_HEIGHT,
    fields: item.fields.map((row) => {
      const field = item.entity.fields.find((candidate) => candidate.id === row.fieldId);
      if (!field) throw new Error(`ER_FIELD_RENDER_DATA_MISSING:${row.fieldId}`);
      return { id: row.fieldId, entityId: item.id, row, field, selected: selection.fieldId === row.fieldId };
    }),
    selected: selection.entityId === item.id
  }));
  const routes = layout.routes.map((route) => ({
    id: route.id,
    relationId: route.relationId,
    points: route.points,
    ...(route.sourceFieldId ? { sourceFieldId: route.sourceFieldId } : {}),
    ...(route.targetFieldId ? { targetFieldId: route.targetFieldId } : {}),
    mappingConfigured: route.mappingConfigured,
    selected: selection.relationId === route.relationId || selection.entityId === route.sourceEntityId || selection.entityId === route.targetEntityId || selection.fieldId === route.sourceFieldId || selection.fieldId === route.targetFieldId
  }));
  return { camera, lod, entities, routes };
}

interface PixiPointerEventLike {
  global: { x: number; y: number };
  pointerId?: number;
  button?: number;
  stopPropagation?(): void;
}

export function canUseWebgl(canvas?: HTMLCanvasElement): boolean {
  if (typeof document === "undefined") return false;
  const target = canvas ?? document.createElement("canvas");
  return Boolean(target.getContext("webgl2") ?? target.getContext("webgl"));
}

export class ErPixiRenderer {
  private app?: Application;
  private readonly root = new Container();
  private readonly routeLayer = new Container();
  private readonly entityLayer = new Container();
  private readonly cache: ErTextureCache<unknown>;
  private readonly options: ErPixiRendererOptions;
  private readonly positionStore: ErPositionStore;
  private host?: HTMLElement;
  private state?: ErGraphState;
  private projection?: ErDiagramProjection;
  private layout?: ErLayoutResult;
  private positionKey?: ErPositionKey;
  private positions: ErEntityPositions = {};
  private camera: ErCamera = DEFAULT_ER_CAMERA;
  private pointerState: ErPointerState = createErPointerState(DEFAULT_ER_CAMERA);
  private selection: ErRendererSelection = {};
  private dragStartPositions: ErEntityPositions = {};
  private drawModel?: ErDrawModel;

  constructor(options: ErPixiRendererOptions = {}) {
    this.options = options;
    this.positionStore = options.positionStore ?? createErPositionStore();
    this.cache = new ErTextureCache(options.maxTextures ?? 64);
  }

  async mount(host: HTMLElement): Promise<ErRendererStatus> {
    this.host = host;
    const lod = this.currentLod();
    if (!canUseWebgl()) return this.fail("WEBGL_UNAVAILABLE", lod);
    try {
      const app = new Application();
      await app.init({ preference: "webgl", antialias: true, backgroundAlpha: 0, resizeTo: host });
      app.stage.eventMode = "static";
      app.stage.hitArea = new Rectangle(0, 0, Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
      this.root.eventMode = "static";
      this.root.hitArea = new Rectangle(0, 0, Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
      this.root.addChild(this.routeLayer, this.entityLayer);
      this.attachPointerListeners();
      app.stage.addChild(this.root);
      host.replaceChildren(app.canvas);
      this.app = app;
      app.canvas.addEventListener("webglcontextlost", this.handleContextLost);
      app.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
      app.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
      const status = { ready: true, lod: this.currentLod() };
      this.options.onStatus?.(status);
      this.redraw();
      return status;
    } catch {
      return this.fail("WEBGL_UNAVAILABLE", lod);
    }
  }

  setGraph(state: ErGraphState, layout: ErLayoutResult, projection?: ErDiagramProjection): void {
    this.state = state;
    this.projection = projection ?? projectErDiagram(state.snapshot);
    this.positionKey = this.buildPositionKey(this.projection);
    const entityIds = new Set(this.projection.entities.map((entity) => entity.id));
    const layoutPositions = Object.fromEntries(layout.entities.map((entity) => [entity.id, { x: entity.x, y: entity.y }])) as ErEntityPositions;
    const savedPositions = this.positionKey ? this.positionStore.load(this.positionKey, entityIds) : {};
    this.positions = { ...layoutPositions, ...savedPositions };
    this.layout = layoutErDiagramWithFallback({ entities: this.projection.entities, relations: this.projection.relations, positions: this.positions });
    this.selection = state.selectedId ? this.selectionForId(state.selectedId) : {};
    this.pointerState = createErPointerState(this.camera);
    this.redraw();
  }

  setProjection(projection: ErDiagramProjection, layout?: ErLayoutResult): void {
    if (!this.state) throw new Error("ER_RENDERER_STATE_REQUIRED");
    this.setGraph(this.state, layout ?? layoutErDiagramWithFallback({ entities: projection.entities, relations: projection.relations }), projection);
  }

  resize(width: number, height: number): void {
    this.app?.renderer.resize(width, height);
    if (this.app?.stage.hitArea instanceof Rectangle) this.app.stage.hitArea = new Rectangle(0, 0, Math.max(1, width), Math.max(1, height));
    if (this.root.hitArea instanceof Rectangle) this.root.hitArea = new Rectangle(0, 0, Math.max(1, width), Math.max(1, height));
    this.redraw();
  }

  fitToView(width = this.app?.screen.width ?? this.host?.clientWidth ?? 1, height = this.app?.screen.height ?? this.host?.clientHeight ?? 1): ErCamera {
    const entities = this.layout?.entities ?? [];
    if (!entities.length) return this.setCamera(DEFAULT_ER_CAMERA);
    const bounds = entities.reduce((current, entity) => ({
      minX: Math.min(current.minX, entity.x),
      minY: Math.min(current.minY, entity.y),
      maxX: Math.max(current.maxX, entity.x + entity.width),
      maxY: Math.max(current.maxY, entity.y + entity.height)
    }), { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY });
    const padding = 48;
    const scale = Math.min((width - padding * 2) / Math.max(1, bounds.maxX - bounds.minX), (height - padding * 2) / Math.max(1, bounds.maxY - bounds.minY));
    const safeScale = Number.isFinite(scale) ? Math.max(0.25, Math.min(3, scale)) : 1;
    return this.setCamera({ scale: safeScale, x: width / 2 - (bounds.minX + (bounds.maxX - bounds.minX) / 2) * safeScale, y: height / 2 - (bounds.minY + (bounds.maxY - bounds.minY) / 2) * safeScale });
  }

  resetCamera(): ErCamera { return this.setCamera(DEFAULT_ER_CAMERA); }

  resetLayout(): void {
    if (this.positionKey) this.positionStore.clear(this.positionKey);
    this.positions = {};
    if (this.projection) this.layout = layoutErDiagramWithFallback({ entities: this.projection.entities, relations: this.projection.relations });
    this.options.onPositionChange?.({});
    this.redraw();
  }

  getCamera(): ErCamera { return { ...this.camera }; }
  getPositions(): ErEntityPositions { return { ...this.positions }; }
  getDrawModel(): ErDrawModel | undefined { return this.drawModel; }

  destroy(): void {
    if (this.app) {
      this.detachPointerListeners();
      this.app.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
      this.app.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
      this.app.canvas.removeEventListener("wheel", this.handleWheel);
      this.app.destroy(true, { children: true, texture: true });
    }
    this.cache.clear();
    this.app = undefined;
    this.host = undefined;
    this.layout = undefined;
    this.state = undefined;
    this.projection = undefined;
    this.drawModel = undefined;
  }

  getStatus(): ErRendererStatus { return { ready: Boolean(this.app), lod: this.currentLod() }; }

  private redraw(): void {
    if (!this.app || !this.layout || !this.projection) return;
    this.routeLayer.removeChildren().forEach((child) => child.destroy());
    this.entityLayer.removeChildren().forEach((child) => child.destroy());
    this.root.position.set(this.camera.x, this.camera.y);
    this.root.scale.set(this.camera.scale);
    const model = buildErDrawModel(this.projection, this.layout, { camera: this.camera, selection: this.selection });
    this.drawModel = model;
    if (model.lod.lod === "SKELETON") {
      this.options.onStatus?.({ ready: true, failure: "CLIENT_CAPACITY_EXCEEDED", lod: model.lod });
      return;
    }
    for (const route of model.routes) this.drawRoute(route);
    for (const entity of model.entities) this.drawEntity(entity, model.lod.showFields);
    this.options.onStatus?.({ ready: true, ...(this.layout.degraded ? { failure: "LAYOUT_DEGRADED" as const } : {}), lod: model.lod });
  }

  private drawRoute(route: ErDrawRoute): void {
    const line = new Graphics();
    const [first, ...rest] = route.points;
    if (!first) return;
    line.moveTo(first.x, first.y);
    for (const point of rest) line.lineTo(point.x, point.y);
    line.stroke({ color: route.selected ? SELECTED_COLOR : ROUTE_COLOR, width: route.selected ? 3 : 1.5, alpha: route.selected ? 1 : 0.78 });
    line.eventMode = "static";
    line.cursor = "pointer";
    line.on("pointerdown", (event: PixiPointerEventLike) => {
      event.stopPropagation?.();
      this.selection = { relationId: route.relationId };
      this.options.onRelationSelect?.(route.relationId);
      this.redraw();
    });
    this.routeLayer.addChild(line);
  }

  private drawEntity(entity: ErDrawEntity, showFields: boolean): void {
    const card = new Container();
    card.eventMode = "static";
    card.cursor = "grab";
    card.on("pointerdown", (event: PixiPointerEventLike) => this.handleEntityDown(entity.id, event));
    const background = new Graphics();
    background.roundRect(entity.x, entity.y, entity.width, entity.height, 6).fill(entity.selected ? 0xecfdf5 : 0xffffff).stroke({ color: entity.selected ? SELECTED_COLOR : 0x0f766e, width: entity.selected ? 2.5 : 1.5 });
    card.addChild(background);
    const header = new Graphics();
    header.roundRect(entity.x, entity.y, entity.width, entity.headerHeight, 6).fill(entity.selected ? 0xccfbf1 : 0xf0fdfa);
    header.rect(entity.x, entity.y + entity.headerHeight - 6, entity.width, 6).fill(entity.selected ? 0xccfbf1 : 0xf0fdfa);
    card.addChild(header);
    card.addChild(this.text(entity.entity.displayName, entity.x + 12, entity.y + 9, { fill: 0x0f172a, fontSize: 14, fontWeight: "600" }));
    card.addChild(this.text(entity.entity.physicalName ?? `${entity.entity.fields.length} ${this.options.locale === "zh" ? "fields" : "fields"}`, entity.x + 12, entity.y + 28, { fill: 0x475569, fontSize: 10 }));
    if (showFields) for (const field of entity.fields) this.drawField(card, field);
    this.entityLayer.addChild(card);
  }

  private drawField(card: Container, field: ErDrawField): void {
    const row = new Graphics();
    row.rect(field.row.x, field.row.y, field.row.width, field.row.height).fill(field.selected ? 0xeff6ff : 0xffffff);
    row.eventMode = "static";
    row.cursor = "pointer";
    row.on("pointerdown", (event: PixiPointerEventLike) => this.handleFieldDown(field.entityId, field.id, event));
    card.addChild(row);
    const marker = field.field.primaryKey ? "PK" : field.field.foreignKey ? "FK" : field.field.unique ? "UQ" : "";
    const markerWidth = marker ? 22 : 0;
    if (marker) card.addChild(this.text(marker, field.row.x + 8, field.row.y + 7, { fill: field.field.foreignKey ? 0x0e7490 : 0x7c3aed, fontSize: 9, fontWeight: "700" }));
    card.addChild(this.text(field.field.displayName, field.row.x + 12 + markerWidth, field.row.y + 6, { fill: 0x1e293b, fontSize: 11 }));
    card.addChild(this.text(`${field.field.dataType}${field.field.nullable ? "" : " !"}`, field.row.x + field.row.width - 84, field.row.y + 6, { fill: 0x64748b, fontSize: 10 }));
    const port = new Graphics();
    port.circle(field.row.x + field.row.width, field.row.center.y, field.selected ? 4 : 3).fill(field.selected ? SELECTED_COLOR : FIELD_PORT_COLOR);
    card.addChild(port);
  }

  private text(value: string, x: number, y: number, style: Partial<TextStyle>): Text {
    const label = new Text({ text: value, style: new TextStyle(style) });
    label.x = x;
    label.y = y;
    return label;
  }

  private handleEntityDown(entityId: string, event: PixiPointerEventLike): void {
    event.stopPropagation?.();
    this.dragStartPositions = { ...this.positions };
    this.pointerState = reduceErPointer(pointerDownOnEntity(entityId, this.eventPoint(event), { pointerId: event.pointerId ?? 1 }), this.pointerState);
  }

  private handleFieldDown(entityId: string, fieldId: string, event: PixiPointerEventLike): void {
    event.stopPropagation?.();
    this.dragStartPositions = { ...this.positions };
    this.pointerState = reduceErPointer(pointerDownOnField(entityId, fieldId, this.eventPoint(event), event.pointerId ?? 1), this.pointerState);
  }

  private handlePointerDown = (event: PixiPointerEventLike): void => { this.pointerState = reduceErPointer(pointerDownOnCanvas(this.eventPoint(event), event.pointerId ?? 1), this.pointerState); };

  private handlePointerMove = (event: PixiPointerEventLike): void => {
    const previous = this.pointerState;
    const next = reduceErPointer(pointerMove(this.eventPoint(event), event.pointerId ?? 1), previous);
    this.pointerState = next;
    if (next.mode === "DRAGGING_ENTITY" && next.drag) {
      const start = this.dragStartPositions[next.drag.entityId] ?? { x: 0, y: 0 };
      this.positions = { ...this.positions, [next.drag.entityId]: { x: start.x + next.drag.deltaWorld.x, y: start.y + next.drag.deltaWorld.y } };
      this.relayoutWithPositions();
      this.redraw();
    } else if (next.camera.x !== previous.camera.x || next.camera.y !== previous.camera.y) {
      this.camera = next.camera;
      this.options.onCameraChange?.(this.camera);
      this.redraw();
    }
  };

  private handlePointerUp = (event: PixiPointerEventLike): void => {
    const next = reduceErPointer(pointerUp(this.eventPoint(event), event.pointerId ?? 1), this.pointerState);
    this.pointerState = next;
    if (next.selectedFieldId) {
      this.selection = { fieldId: next.selectedFieldId, entityId: next.selectedEntityId };
      this.options.onFieldSelect?.(next.selectedFieldId);
    } else if (next.selectedEntityId) {
      this.selection = { entityId: next.selectedEntityId };
      this.options.onEntitySelect?.(next.selectedEntityId);
    }
    if (Object.keys(this.positions).length) {
      if (this.positionKey) this.positionStore.save(this.positionKey, this.positions, new Set(this.projection?.entities.map((entity) => entity.id)));
      this.options.onPositionChange?.({ ...this.positions });
    }
    this.redraw();
  };

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const rect = this.app?.canvas.getBoundingClientRect();
    const point = { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
    const next = reduceErPointer({ type: "WHEEL", point, deltaY: event.deltaY }, this.pointerState);
    this.pointerState = next;
    this.camera = next.camera;
    this.options.onCameraChange?.(this.camera);
    this.redraw();
  };

  private attachPointerListeners(): void {
    this.root.on("pointerdown", this.handlePointerDown);
    this.root.on("globalpointermove", this.handlePointerMove);
    this.root.on("pointerup", this.handlePointerUp);
    this.root.on("pointerupoutside", this.handlePointerUp);
  }

  private detachPointerListeners(): void {
    this.root.off("pointerdown", this.handlePointerDown);
    this.root.off("globalpointermove", this.handlePointerMove);
    this.root.off("pointerup", this.handlePointerUp);
    this.root.off("pointerupoutside", this.handlePointerUp);
  }

  private relayoutWithPositions(): void {
    if (this.projection) this.layout = layoutErDiagramWithFallback({ entities: this.projection.entities, relations: this.projection.relations, positions: this.positions });
  }

  private setCamera(camera: ErCamera): ErCamera {
    this.camera = camera;
    this.pointerState = reduceErPointer({ type: "SET_CAMERA", camera }, this.pointerState);
    this.camera = this.pointerState.camera;
    this.options.onCameraChange?.(this.camera);
    this.redraw();
    return { ...this.camera };
  }

  private selectionForId(id: string): ErRendererSelection {
    const field = this.projection?.entities.flatMap((entity) => entity.fields).find((candidate) => candidate.id === id);
    return field ? { fieldId: id, entityId: field.entityId } : this.projection?.entities.some((entity) => entity.id === id) ? { entityId: id } : {};
  }

  private buildPositionKey(projection: ErDiagramProjection): ErPositionKey { return { ...projection.identity, schemaVersion: ER_POSITION_SCHEMA_VERSION }; }
  private eventPoint(event: PixiPointerEventLike): ErPoint { return { x: event.global.x, y: event.global.y }; }
  private currentLod() { return deriveErLod(this.state?.snapshot.nodes.length ?? 0, this.state?.snapshot.edges.length ?? 0, this.camera.scale); }
  private fail(failure: ErRendererFailure, lod: ReturnType<typeof deriveErLod>): ErRendererStatus { const status = { ready: false, failure, lod }; this.options.onStatus?.(status); return status; }
  private readonly handleContextLost = (event: Event): void => { event.preventDefault(); this.options.onStatus?.({ ready: false, failure: "WEBGL_CONTEXT_LOST", lod: this.currentLod() }); };
  private readonly handleContextRestored = (): void => { this.options.onStatus?.({ ready: true, lod: this.currentLod() }); this.redraw(); };
}
