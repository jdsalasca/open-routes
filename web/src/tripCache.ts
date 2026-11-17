import type { Route } from "./types";

const DB_NAME = "open-routes";
const STORE = "trip-routes";
const VERSION = 1;
const TTL_MS = 72 * 60 * 60 * 1000;
const MAX_ENTRIES = 60;
const memory = new Map<string, CachedRoutes>();

type CachedRoutes = {
  key: string;
  routes: Route[];
  savedAt: number;
};

let database: Promise<IDBDatabase | null> | null = null;

const cell = (value: number) => Math.round(value * 10_000);

export function tripCacheKey(
  slug: string,
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  return `v1|${slug}|${cell(from.lat)},${cell(from.lng)}|${cell(to.lat)},${cell(to.lng)}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (database) return database;
  database = new Promise((resolve) => {
    if (!("indexedDB" in window)) {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return database;
}

export async function readTripRoutes(key: string): Promise<Route[] | null> {
  const cached = memory.get(key);
  if (cached && Date.now() - cached.savedAt < TTL_MS) {
    return cached.routes;
  }
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => {
        const value = request.result as CachedRoutes | undefined;
        if (!value || Date.now() - value.savedAt >= TTL_MS) {
          resolve(null);
          return;
        }
        memory.set(key, value);
        resolve(value.routes);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeTripRoutes(key: string, routes: Route[]): Promise<void> {
  const value: CachedRoutes = { key, routes, savedAt: Date.now() };
  memory.set(key, value);
  const db = await openDatabase();
  if (!db) return;
  try {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    store.put(value);
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      if (keys.result.length <= MAX_ENTRIES) return;
      const oldest = keys.result.slice(0, keys.result.length - MAX_ENTRIES);
      const clean = db.transaction(STORE, "readwrite").objectStore(STORE);
      oldest.forEach((oldKey) => clean.delete(oldKey));
    };
  } catch {
    // El caché del navegador es opcional; el servidor también cachea.
  }
}
