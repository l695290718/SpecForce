import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { ErGraphState } from "./er-graph-store";
import { deriveErLod } from "./er-graph-store";
import type { ErLayoutResult } from "./er-layout";
import { ErTextureCache } from "./er-texture-cache";

export type ErRendererFailure = "WEBGL_UNAVAILABLE" | "WEBGL_CONTEXT_LOST" | "LAYOUT_DEGRADED" | "CLIENT_CAPACITY_EXCEEDED";

export interface ErRendererStatus { ready: boolean; failure?: ErRendererFailure; lod: ReturnType<typeof deriveErLod>; }

export interface ErPixiRendererOptions {
  locale?: "en" | "zh";
  onStatus?(status: ErRendererStatus): void;
  maxTextures?: number;
}

export function canUseWebgl(canvas?: HTMLCanvasElement): boolean {
  if (typeof document === "undefined") return false;
  const target = canvas ?? document.createElement("canvas");
  return Boolean(target.getContext("webgl2") ?? target.getContext("webgl"));
}

export class ErPixiRenderer {
  private app?: Application;
  private readonly root = new Container();
  private readonly cache: ErTextureCache<unknown>;
  private host?: HTMLElement;
  private state?: ErGraphState;
  private layout?: ErLayoutResult;
  private readonly options: ErPixiRendererOptions;

  constructor(options: ErPixiRendererOptions = {}) {
    this.options = options;
    this.cache = new ErTextureCache(options.maxTextures ?? 64);
  }

  async mount(host: HTMLElement): Promise<ErRendererStatus> {
    this.host = host;
    const lod = deriveErLod(this.state?.snapshot.nodes.length ?? 0, this.state?.snapshot.edges.length ?? 0);
    if (!canUseWebgl()) return this.fail("WEBGL_UNAVAILABLE", lod);
    try {
      const app = new Application();
      await app.init({ preference: "webgl", antialias: true, backgroundAlpha: 0, resizeTo: host });
      app.stage.addChild(this.root);
      host.replaceChildren(app.canvas);
      this.app = app;
      app.canvas.addEventListener("webglcontextlost", this.handleContextLost);
      app.canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
      const status = { ready: true, lod };
      this.options.onStatus?.(status);
      this.redraw();
      return status;
    } catch {
      return this.fail("WEBGL_UNAVAILABLE", lod);
    }
  }

  setGraph(state: ErGraphState, layout: ErLayoutResult): void { this.state = state; this.layout = layout; this.redraw(); }
  resize(width: number, height: number): void { this.app?.renderer.resize(width, height); this.redraw(); }
  destroy(): void {
    if (this.app) { this.app.canvas.removeEventListener("webglcontextlost", this.handleContextLost); this.app.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored); this.app.destroy(true, { children: true, texture: true }); }
    this.cache.clear(); this.app = undefined; this.host = undefined; this.layout = undefined; this.state = undefined;
  }

  getStatus(): ErRendererStatus { return { ready: Boolean(this.app), lod: deriveErLod(this.state?.snapshot.nodes.length ?? 0, this.state?.snapshot.edges.length ?? 0) }; }

  private redraw(): void {
    if (!this.app || !this.layout || !this.state) return;
    this.root.removeChildren().forEach((child) => child.destroy());
    const lod = deriveErLod(this.state.snapshot.nodes.length, this.state.snapshot.edges.length, 1);
    if (lod.lod === "SKELETON") { this.options.onStatus?.({ ready: true, failure: "CLIENT_CAPACITY_EXCEEDED", lod }); return; }
    for (const edge of this.layout.edges) {
      const [first, ...rest] = edge.points;
      if (!first) continue;
      const line = new Graphics(); line.moveTo(first.x, first.y); for (const point of rest) line.lineTo(point.x, point.y); line.stroke({ color: 0x94a3b8, width: 1.5, alpha: 0.8 }); this.root.addChild(line);
    }
    for (const item of this.layout.nodes) {
      const card = new Graphics(); card.roundRect(item.x, item.y, item.width, item.height, 10).fill(0xffffff).stroke({ color: 0x0f766e, width: 1.5 }); this.root.addChild(card);
      const label = new Text({ text: item.node.label, style: new TextStyle({ fill: 0x0f172a, fontSize: 14, fontWeight: "600" }) }); label.x = item.x + 14; label.y = item.y + 14; this.root.addChild(label);
      if (lod.showFields) { const detail = new Text({ text: `${item.node.fieldCount ?? item.node.metadata.fieldCount ?? 0} fields`, style: new TextStyle({ fill: 0x64748b, fontSize: 11 }) }); detail.x = item.x + 14; detail.y = item.y + 34; this.root.addChild(detail); }
    }
  }

  private fail(failure: ErRendererFailure, lod: ReturnType<typeof deriveErLod>): ErRendererStatus { const status = { ready: false, failure, lod }; this.options.onStatus?.(status); return status; }
  private readonly handleContextLost = (event: Event): void => { event.preventDefault(); this.options.onStatus?.({ ready: false, failure: "WEBGL_CONTEXT_LOST", lod: deriveErLod(this.state?.snapshot.nodes.length ?? 0, this.state?.snapshot.edges.length ?? 0) }); };
  private readonly handleContextRestored = (): void => { this.options.onStatus?.({ ready: true, lod: deriveErLod(this.state?.snapshot.nodes.length ?? 0, this.state?.snapshot.edges.length ?? 0) }); this.redraw(); };
}
