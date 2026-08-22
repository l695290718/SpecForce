"use client";

import React, { useEffect, useRef } from "react";
import type { ArchitectureGraphStore } from "./architecture-graph-store";

export interface MinimapExtent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CameraState2D {
  x: number;
  y: number;
  ratio: number;
}

export interface MinimapCamera {
  getState(): CameraState2D;
  animate?(state: Partial<CameraState2D>, options?: { duration?: number }): unknown;
}

const MINIMAP_WIDTH = 168;
const MINIMAP_HEIGHT = 112;
const DRAW_INTERVAL_MS = 150;

const LAYER_DOT_COLORS: Record<string, string> = {
  BIZ: "#fbbf24",
  SYS: "#60a5fa",
  TECH: "#34d399"
};

// Raw layout coordinates are unbounded (force layout), so the minimap normalizes
// node positions by their live bounding box. Sigma's camera x/y/ratio live in the
// same normalized [0,1] display space, so the viewport rect maps directly.
export function graphExtent(positions: Iterable<{ x: number; y: number }>): MinimapExtent | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let count = 0;
  for (const position of positions) {
    count += 1;
    minX = Math.min(minX, position.x);
    minY = Math.min(minY, position.y);
    maxX = Math.max(maxX, position.x);
    maxY = Math.max(maxY, position.y);
  }
  if (!count) return undefined;
  return { minX, minY, maxX, maxY };
}

export function viewportRect(camera: CameraState2D, extent: MinimapExtent, width = MINIMAP_WIDTH, height = MINIMAP_HEIGHT): { x: number; y: number; w: number; h: number } {
  const cx = camera.x * width;
  const cy = camera.y * height;
  const halfW = (camera.ratio * width) / 2;
  const halfH = (camera.ratio * height) / 2;
  return { x: cx - halfW, y: cy - halfH, w: halfW * 2, h: halfH * 2 };
}

function normalize(value: number, min: number, span: number): number {
  return span > 0 ? (value - min) / span : 0.5;
}

export function ArchitectureGraphMinimap({ store, cameraProvider }: { store: ArchitectureGraphStore; cameraProvider(): MinimapCamera | undefined }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef(false);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      const graph = store.graph;
      context.clearRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
      context.fillStyle = "rgba(8,14,28,0.86)";
      context.fillRect(0, 0, MINIMAP_WIDTH, MINIMAP_HEIGHT);
      if (!graph.order) return;
      const positions: Array<{ x: number; y: number; layer?: string }> = [];
      graph.forEachNode((node, attributes) => positions.push({ x: attributes.x, y: attributes.y, layer: attributes.layer }));
      const extent = graphExtent(positions);
      if (!extent) return;
      const spanX = extent.maxX - extent.minX;
      const spanY = extent.maxY - extent.minY;
      for (const position of positions) {
        context.fillStyle = LAYER_DOT_COLORS[position.layer ?? ""] ?? "#94a3b8";
        context.beginPath();
        context.arc(normalize(position.x, extent.minX, spanX) * MINIMAP_WIDTH, normalize(position.y, extent.minY, spanY) * MINIMAP_HEIGHT, 1.6, 0, Math.PI * 2);
        context.fill();
      }
      const camera = cameraProvider()?.getState();
      if (!camera) return;
      const rect = viewportRect(camera, extent);
      context.strokeStyle = "rgba(226,232,240,0.85)";
      context.lineWidth = 1;
      context.strokeRect(rect.x, rect.y, rect.w, rect.h);
    };
    draw();
    const interval = window.setInterval(draw, DRAW_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [store, cameraProvider]);

  const navigateTo = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const camera = cameraProvider();
    if (!camera) return;
    camera.animate?.({ x, y }, { duration: 120 });
  };

  return <div className="pointer-events-auto absolute bottom-3 right-3 rounded-md border border-white/15 shadow-elevated" data-testid="architecture-graph-minimap">
    <canvas
      ref={canvasRef}
      width={MINIMAP_WIDTH}
      height={MINIMAP_HEIGHT}
      className="block cursor-crosshair rounded-md"
      onPointerDown={(event) => { dragRef.current = true; navigateTo(event); }}
      onPointerMove={(event) => { if (dragRef.current) navigateTo(event); }}
      onPointerUp={() => { dragRef.current = false; }}
      onPointerLeave={() => { dragRef.current = false; }}
    />
  </div>;
}
