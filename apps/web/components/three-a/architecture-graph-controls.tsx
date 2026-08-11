"use client";

import {
  CircleDot,
  Focus,
  GitBranch,
  Network,
  Play,
  RotateCcw,
  Scan,
  Square,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon
} from "lucide-react";
import React from "react";

export type ArchitectureGraphView = "force" | "tree" | "circles";
export type ArchitectureGraphLifecycle = "seeded" | "running" | "settled" | "stopped" | "failed";

export interface ArchitectureGraphControlsProps {
  view: ArchitectureGraphView;
  lifecycle: ArchitectureGraphLifecycle;
  hasSelection: boolean;
  onViewChange(view: ArchitectureGraphView): void;
  onZoomIn(): void;
  onZoomOut(): void;
  onResetCamera(): void;
  onFocusSelection(): void;
  onStartLayout(): void;
  onStopLayout(): void;
  onRestartLayout(): void;
  onClearSelection(): void;
  labels?: Partial<ArchitectureGraphControlLabels>;
}

export interface ArchitectureGraphControlLabels {
  toolbar: string;
  viewGroup: string;
  forceView: string;
  treeView: string;
  circleView: string;
  cameraGroup: string;
  zoomIn: string;
  zoomOut: string;
  resetCamera: string;
  selectionGroup: string;
  focusSelection: string;
  clearSelection: string;
  layoutGroup: string;
  startLayout: string;
  stopLayout: string;
  restartLayout: string;
}

interface ViewOption {
  value: ArchitectureGraphView;
  label: ViewLabelKey;
  icon: LucideIcon;
}

type ViewLabelKey = "forceView" | "treeView" | "circleView";

const viewOptions: ViewOption[] = [
  { value: "force", label: "forceView", icon: Network },
  { value: "tree", label: "treeView", icon: GitBranch },
  { value: "circles", label: "circleView", icon: CircleDot }
];

const defaultLabels: ArchitectureGraphControlLabels = {
  toolbar: "Architecture graph controls",
  viewGroup: "Graph view",
  forceView: "Force view",
  treeView: "Tree view",
  circleView: "Circle view",
  cameraGroup: "Camera controls",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetCamera: "Reset camera",
  selectionGroup: "Selection controls",
  focusSelection: "Focus selection",
  clearSelection: "Clear selection",
  layoutGroup: "Layout controls",
  startLayout: "Start layout",
  stopLayout: "Stop layout",
  restartLayout: "Restart layout"
};

const buttonClassName =
  "inline-flex h-8 w-8 items-center justify-center rounded text-muted transition hover:bg-chrome hover:text-ink disabled:pointer-events-none disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-accent";
const activeButtonClassName = "bg-accent text-white hover:bg-blue-700 hover:text-white";

function ControlButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  pressed
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={`${buttonClassName}${pressed ? ` ${activeButtonClassName}` : ""}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" size={16} strokeWidth={1.9} />
    </button>
  );
}

export function ArchitectureGraphControls({
  view,
  lifecycle,
  hasSelection,
  onViewChange,
  onZoomIn,
  onZoomOut,
  onResetCamera,
  onFocusSelection,
  onStartLayout,
  onStopLayout,
  onRestartLayout,
  onClearSelection,
  labels: labelOverrides
}: ArchitectureGraphControlsProps) {
  const labels = { ...defaultLabels, ...labelOverrides };
  const canStartLayout = lifecycle === "seeded" || lifecycle === "stopped";
  const canStopLayout = lifecycle === "running";
  const canRestartLayout = lifecycle === "settled" || lifecycle === "stopped" || lifecycle === "failed";

  return (
    <div aria-label={labels.toolbar} className="flex flex-wrap items-center gap-2" role="toolbar">
      <div
        aria-label={labels.viewGroup}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-white p-1 shadow-sm"
        role="group"
      >
        {viewOptions.map(({ value, label, icon }) => (
          <ControlButton
            key={value}
            label={labels[label]}
            icon={icon}
            onClick={() => onViewChange(value)}
            pressed={view === value}
          />
        ))}
      </div>

      <div
        aria-label={labels.cameraGroup}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-white p-1 shadow-sm"
        role="group"
      >
        <ControlButton label={labels.zoomIn} icon={ZoomIn} onClick={onZoomIn} />
        <ControlButton label={labels.zoomOut} icon={ZoomOut} onClick={onZoomOut} />
        <ControlButton label={labels.resetCamera} icon={Scan} onClick={onResetCamera} />
      </div>

      <div
        aria-label={labels.selectionGroup}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-white p-1 shadow-sm"
        role="group"
      >
        <ControlButton label={labels.focusSelection} icon={Focus} disabled={!hasSelection} onClick={onFocusSelection} />
        <ControlButton label={labels.clearSelection} icon={X} disabled={!hasSelection} onClick={onClearSelection} />
      </div>

      <div
        aria-label={labels.layoutGroup}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-white p-1 shadow-sm"
        role="group"
      >
        <ControlButton label={labels.startLayout} icon={Play} disabled={!canStartLayout} onClick={onStartLayout} />
        <ControlButton label={labels.stopLayout} icon={Square} disabled={!canStopLayout} onClick={onStopLayout} />
        <ControlButton label={labels.restartLayout} icon={RotateCcw} disabled={!canRestartLayout} onClick={onRestartLayout} />
      </div>
    </div>
  );
}
