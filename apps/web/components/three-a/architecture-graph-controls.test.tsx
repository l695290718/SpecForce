import React, { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  ArchitectureGraphControls,
  type ArchitectureGraphControlsProps,
  type ArchitectureGraphLifecycle
} from "./architecture-graph-controls";

type ButtonProps = {
  "aria-label"?: string;
  "aria-pressed"?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  type?: string;
};

function findButtons(node: ReactNode): Array<React.ReactElement<ButtonProps>> {
  if (!isValidElement(node)) return [];
  if (node.type === "button") return [node as React.ReactElement<ButtonProps>];

  if (typeof node.type === "function") {
    const Component = node.type as (props: Record<string, unknown>) => ReactNode;
    return findButtons(Component(node.props as Record<string, unknown>));
  }

  const props = node.props as { children?: ReactNode };
  return React.Children.toArray(props.children).flatMap(findButtons);
}

function buttonByLabel(buttons: Array<React.ReactElement<ButtonProps>>, label: string) {
  const button = buttons.find((item) => item.props["aria-label"] === label);
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

const callbacks = () => ({
  onViewChange: vi.fn(),
  onZoomIn: vi.fn(),
  onZoomOut: vi.fn(),
  onResetCamera: vi.fn(),
  onFocusSelection: vi.fn(),
  onStartLayout: vi.fn(),
  onStopLayout: vi.fn(),
  onRestartLayout: vi.fn(),
  onClearSelection: vi.fn()
});

function renderControls(overrides: Partial<ArchitectureGraphControlsProps> = {}) {
  const props = {
    view: "force",
    lifecycle: "seeded",
    hasSelection: true,
    ...callbacks(),
    ...overrides
  } satisfies ArchitectureGraphControlsProps;
  return { element: ArchitectureGraphControls(props), props };
}

describe("ArchitectureGraphControls", () => {
  it("marks the active graph view and exposes icon buttons accessibly", () => {
    const { element } = renderControls({ view: "tree" });
    const buttons = findButtons(element);

    expect(buttonByLabel(buttons, "Force view").props["aria-pressed"]).toBe(false);
    expect(buttonByLabel(buttons, "Tree view").props["aria-pressed"]).toBe(true);
    expect(buttonByLabel(buttons, "Circle view").props["aria-pressed"]).toBe(false);
    expect(buttonByLabel(buttons, "Zoom in").props.title).toBe("Zoom in");
    expect(buttonByLabel(buttons, "Zoom in").props.type).toBe("button");
    expect(element.props.role).toBe("toolbar");
    expect(element.props["aria-label"]).toBe("Architecture graph controls");
  });

  it("disables selection actions without a selection", () => {
    const { element } = renderControls({ hasSelection: false });
    const buttons = findButtons(element);

    expect(buttonByLabel(buttons, "Focus selection").props.disabled).toBe(true);
    expect(buttonByLabel(buttons, "Clear selection").props.disabled).toBe(true);
  });

  it.each([
    ["seeded", { start: false, stop: true, restart: true }],
    ["running", { start: true, stop: false, restart: true }],
    ["settled", { start: true, stop: true, restart: false }],
    ["stopped", { start: false, stop: true, restart: false }],
    ["failed", { start: true, stop: true, restart: false }]
  ] as const)("applies layout lifecycle disabled state for %s", (lifecycle: ArchitectureGraphLifecycle, expected) => {
    const { element } = renderControls({ lifecycle });
    const buttons = findButtons(element);

    expect(buttonByLabel(buttons, "Start layout").props.disabled).toBe(expected.start);
    expect(buttonByLabel(buttons, "Stop layout").props.disabled).toBe(expected.stop);
    expect(buttonByLabel(buttons, "Restart layout").props.disabled).toBe(expected.restart);
  });

  it("routes every view and action control to its callback", () => {
    const handlers = callbacks();
    const { element } = renderControls({ lifecycle: "stopped", ...handlers });
    const buttons = findButtons(element);

    buttonByLabel(buttons, "Force view").props.onClick?.();
    buttonByLabel(buttons, "Tree view").props.onClick?.();
    buttonByLabel(buttons, "Circle view").props.onClick?.();
    buttonByLabel(buttons, "Zoom in").props.onClick?.();
    buttonByLabel(buttons, "Zoom out").props.onClick?.();
    buttonByLabel(buttons, "Reset camera").props.onClick?.();
    buttonByLabel(buttons, "Focus selection").props.onClick?.();
    buttonByLabel(buttons, "Start layout").props.onClick?.();
    buttonByLabel(buttons, "Restart layout").props.onClick?.();
    buttonByLabel(buttons, "Clear selection").props.onClick?.();

    const running = renderControls({ lifecycle: "running", ...handlers });
    buttonByLabel(findButtons(running.element), "Stop layout").props.onClick?.();

    expect(handlers.onViewChange.mock.calls.map(([nextView]) => nextView)).toEqual(["force", "tree", "circles"]);
    expect(handlers.onZoomIn).toHaveBeenCalledOnce();
    expect(handlers.onZoomOut).toHaveBeenCalledOnce();
    expect(handlers.onResetCamera).toHaveBeenCalledOnce();
    expect(handlers.onFocusSelection).toHaveBeenCalledOnce();
    expect(handlers.onStartLayout).toHaveBeenCalledOnce();
    expect(handlers.onStopLayout).toHaveBeenCalledOnce();
    expect(handlers.onRestartLayout).toHaveBeenCalledOnce();
    expect(handlers.onClearSelection).toHaveBeenCalledOnce();
  });
});
