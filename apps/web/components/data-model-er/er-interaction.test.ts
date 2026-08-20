import { describe, expect, it } from "vitest";
import { DEFAULT_ER_CAMERA, ER_DRAG_THRESHOLD, clampCameraScale, hitTestEntity, pointerDownOnCanvas, pointerDownOnEntity, pointerDownOnField, pointerMove, pointerUp, reduceErPointer, screenToWorld, worldToScreen, zoomAtPoint } from "./er-interaction";

describe("ER interaction state", () => {
  it("requires a movement threshold before entering drag mode", () => {
    const pending = reduceErPointer(pointerDownOnEntity("entity:one", { x: 100, y: 100 }));
    expect(reduceErPointer(pointerMove({ x: 103, y: 102 }), pending).mode).toBe("PENDING");
    const dragging = reduceErPointer(pointerMove({ x: 116, y: 102 }), pending);
    expect(dragging.mode).toBe("DRAGGING_ENTITY");
    expect(dragging.pointerCaptured).toBe(true);
    expect(dragging.drag?.deltaWorld).toEqual({ x: 16, y: 2 });
    expect(ER_DRAG_THRESHOLD).toBe(8);
  });

  it("keeps a click as selection and does not select a drag as a click", () => {
    const clicked = reduceErPointer(pointerUp({ x: 101, y: 101 }), reduceErPointer(pointerDownOnField("entity:one", "field:one.id", { x: 100, y: 100 })));
    expect(clicked.mode).toBe("IDLE");
    expect(clicked.selectedEntityId).toBe("entity:one");
    expect(clicked.selectedFieldId).toBe("field:one.id");

    const down = reduceErPointer(pointerDownOnEntity("entity:one", { x: 100, y: 100 }));
    const dragged = reduceErPointer(pointerMove({ x: 120, y: 100 }), down);
    const released = reduceErPointer(pointerUp({ x: 120, y: 100 }), dragged);
    expect(released.selectedEntityId).toBeUndefined();
  });

  it("keeps canvas panning separate from entity dragging", () => {
    const state = reduceErPointer(pointerDownOnCanvas({ x: 10, y: 20 }));
    const panned = reduceErPointer(pointerMove({ x: 30, y: 50 }), state);
    expect(panned.mode).toBe("PANNING");
    expect(panned.camera).toEqual({ x: 20, y: 30, scale: 1 });
    expect(panned.drag).toBeUndefined();
  });

  it("round-trips camera transforms and clamps zoom", () => {
    const camera = { x: 40, y: -20, scale: 2 };
    const world = screenToWorld({ x: 140, y: 80 }, camera);
    expect(worldToScreen(world, camera)).toEqual({ x: 140, y: 80 });
    expect(clampCameraScale(0)).toBe(0.25);
    expect(clampCameraScale(99)).toBe(3);
    expect(clampCameraScale(Number.NaN)).toBe(1);
    expect(zoomAtPoint(DEFAULT_ER_CAMERA, { x: 100, y: 100 }, -2000).scale).toBe(3);
  });

  it("keeps the zoom anchor stable and performs world-space hit testing", () => {
    const before = screenToWorld({ x: 120, y: 80 }, DEFAULT_ER_CAMERA);
    const zoomed = zoomAtPoint(DEFAULT_ER_CAMERA, { x: 120, y: 80 }, -500);
    expect(screenToWorld({ x: 120, y: 80 }, zoomed)).toEqual(expect.objectContaining({ x: before.x, y: expect.closeTo(before.y, 10) }));
    expect(hitTestEntity({ x: 120, y: 80 }, [{ id: "entity:one", rect: { x: 100, y: 50, width: 80, height: 60 } }])).toBe("entity:one");
    expect(hitTestEntity({ x: 10, y: 10 }, [{ id: "entity:one", rect: { x: 100, y: 50, width: 80, height: 60 } }])).toBeUndefined();
  });
});
