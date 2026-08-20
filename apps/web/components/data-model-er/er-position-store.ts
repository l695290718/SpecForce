export interface ErPositionKey {
  applicationServiceId: string;
  scopePath: string;
  mode: string;
  rootModelId?: string;
  topologyDigest: string;
  schemaVersion: number;
}

export interface ErEntityPosition {
  x: number;
  y: number;
}

export type ErEntityPositions = Record<string, ErEntityPosition>;

export interface ErPositionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ErPositionStore {
  load(key: ErPositionKey, entityIds?: ReadonlySet<string>): ErEntityPositions;
  save(key: ErPositionKey, positions: ErEntityPositions, entityIds?: ReadonlySet<string>): void;
  clear(key: ErPositionKey): void;
}

export const ER_POSITION_SCHEMA_VERSION = 1;
export const ER_POSITION_STORAGE_PREFIX = "specforge:er-position";

interface StoredErPositions {
  schemaVersion: number;
  architectureScope: {
    applicationServiceId: string;
    scopePath: string;
  };
  mode: string;
  rootModelId: string | null;
  topologyDigest: string;
  positions: ErEntityPositions;
}

export function buildErPositionStorageKey(key: ErPositionKey): string {
  return `${ER_POSITION_STORAGE_PREFIX}:${JSON.stringify(normalizeKey(key))}`;
}

export function createErPositionStore(storage?: ErPositionStorage): ErPositionStore {
  const adapter = storage ?? browserStorage();
  return {
    load(key, entityIds) {
      if (!adapter || !isValidErPositionKey(key)) return {};
      let raw: string | null;
      try {
        raw = adapter.getItem(buildErPositionStorageKey(key));
      } catch {
        return {};
      }
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!matchesKey(parsed, key)) return {};
        return filterPositions((parsed as StoredErPositions).positions, entityIds);
      } catch {
        return {};
      }
    },
    save(key, positions, entityIds) {
      if (!adapter || !isValidErPositionKey(key)) return;
      const normalized = filterPositions(positions, entityIds);
      const payload: StoredErPositions = {
        ...normalizeKey(key),
        positions: normalized
      };
      try {
        adapter.setItem(buildErPositionStorageKey(key), JSON.stringify(payload));
      } catch {
        // Local preferences are best effort and must never break the canvas.
      }
    },
    clear(key) {
      if (!adapter || !isValidErPositionKey(key)) return;
      try {
        adapter.removeItem(buildErPositionStorageKey(key));
      } catch {
        // Local preferences are best effort and must never break the canvas.
      }
    }
  };
}

export function isFiniteErPosition(position: unknown): position is ErEntityPosition {
  if (!position || typeof position !== "object" || Array.isArray(position)) return false;
  const candidate = position as Record<string, unknown>;
  return typeof candidate.x === "number" && Number.isFinite(candidate.x) && typeof candidate.y === "number" && Number.isFinite(candidate.y);
}

export function isValidErPositionKey(key: ErPositionKey): boolean {
  return Boolean(
    key &&
      nonEmpty(key.applicationServiceId) &&
      nonEmpty(key.scopePath) &&
      nonEmpty(key.mode) &&
      nonEmpty(key.topologyDigest) &&
      Number.isInteger(key.schemaVersion) &&
      key.schemaVersion > 0
  );
}

function normalizeKey(key: ErPositionKey): StoredErPositions {
  return {
    schemaVersion: key.schemaVersion,
    architectureScope: {
      applicationServiceId: key.applicationServiceId,
      scopePath: key.scopePath
    },
    mode: key.mode,
    rootModelId: key.rootModelId ?? null,
    topologyDigest: key.topologyDigest,
    positions: {}
  };
}

function matchesKey(value: unknown, key: ErPositionKey): value is StoredErPositions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<StoredErPositions>;
  const scope = candidate.architectureScope;
  return (
    candidate.schemaVersion === key.schemaVersion &&
    candidate.mode === key.mode &&
    candidate.rootModelId === (key.rootModelId ?? null) &&
    candidate.topologyDigest === key.topologyDigest &&
    Boolean(scope) &&
    scope?.applicationServiceId === key.applicationServiceId &&
    scope?.scopePath === key.scopePath &&
    Boolean(candidate.positions) &&
    typeof candidate.positions === "object" &&
    !Array.isArray(candidate.positions)
  );
}

function filterPositions(value: unknown, entityIds?: ReadonlySet<string>): ErEntityPositions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: ErEntityPositions = {};
  for (const [entityId, position] of Object.entries(value)) {
    if (entityIds && !entityIds.has(entityId)) continue;
    if (isFiniteErPosition(position)) result[entityId] = { x: position.x, y: position.y };
  }
  return result;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function browserStorage(): ErPositionStorage | undefined {
  if (typeof window === "undefined" || !window.localStorage) return undefined;
  return window.localStorage;
}
