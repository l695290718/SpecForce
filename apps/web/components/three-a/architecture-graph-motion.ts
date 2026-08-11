export interface GraphMotionPosition {
  id: string;
  x: number;
  y: number;
}

export interface GraphPulseState {
  nodeId: string;
  startedAt?: number;
}

export const GRAPH_LAYOUT_TRANSITION_MS = 900;
export const GRAPH_CAMERA_TRANSITION_MS = 600;
export const GRAPH_PULSE_MS = 900;

export function interpolateGraphPositions(current: readonly GraphMotionPosition[], target: readonly GraphMotionPosition[], progress: number, reducedMotion = false): GraphMotionPosition[] {
  const currentById = new Map(current.map((position) => [position.id, position]));
  const easedProgress = reducedMotion ? 1 : easeOutCubic(progress);
  return target.map((destination) => {
    const origin = currentById.get(destination.id) ?? destination;
    return {
      id: destination.id,
      x: roundFinite(origin.x + (destination.x - origin.x) * easedProgress),
      y: roundFinite(origin.y + (destination.y - origin.y) * easedProgress)
    };
  });
}

export function easeOutCubic(progress: number): number {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return 1 - Math.pow(1 - clamped, 3);
}

function roundFinite(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 1_000) / 1_000;
}
