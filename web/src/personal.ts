import type { Origin, Place } from "./types";

const FAVORITES = "open-routes-favorites";
const RECENTS = "open-routes-recents";
const MAX_RECENTS = 5;
const RECENT_TTL = 30 * 24 * 60 * 60 * 1000;

export type FavoriteLabel = "Casa" | "Trabajo";

export type FavoritePlace = {
  city: string;
  label: FavoriteLabel;
  place: Place;
};

export type RecentTrip = {
  city: string;
  origin: Origin;
  destination: Place;
  at: number;
};

function read<T>(key: string): T[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, value: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento disponible; la app sigue funcionando.
  }
}

const cell = (value: number) => Math.round(value * 10_000);

const tripKey = (origin: Origin, destination: Place) =>
  `${cell(origin.lat)},${cell(origin.lng)}|${cell(destination.lat)},${cell(destination.lng)}`;

export function loadFavorites(city: string): FavoritePlace[] {
  return read<FavoritePlace>(FAVORITES).filter(
    (item) => item.city === city && (item.label === "Casa" || item.label === "Trabajo")
  );
}

export function saveFavorite(city: string, label: FavoriteLabel, place: Place): FavoritePlace[] {
  const all = read<FavoritePlace>(FAVORITES).filter(
    (item) => !(item.city === city && item.label === label)
  );
  all.push({ city, label, place });
  write(FAVORITES, all);
  return all.filter((item) => item.city === city);
}

export function removeFavorite(city: string, label: FavoriteLabel): FavoritePlace[] {
  const all = read<FavoritePlace>(FAVORITES).filter(
    (item) => !(item.city === city && item.label === label)
  );
  write(FAVORITES, all);
  return all.filter((item) => item.city === city);
}

export function loadRecents(city: string): RecentTrip[] {
  const now = Date.now();
  return read<RecentTrip>(RECENTS)
    .filter((item) => item.city === city && now - item.at < RECENT_TTL)
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_RECENTS);
}

export function addRecent(city: string, origin: Origin, destination: Place): RecentTrip[] {
  const key = tripKey(origin, destination);
  const current = loadRecents(city).filter(
    (item) => tripKey(item.origin, item.destination) !== key
  );
  const next = [{ city, origin, destination, at: Date.now() }, ...current].slice(0, MAX_RECENTS);
  const others = read<RecentTrip>(RECENTS).filter((item) => item.city !== city);
  write(RECENTS, [...others, ...next]);
  return next;
}
