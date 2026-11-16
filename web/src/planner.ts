import type { Origin, Place, Route } from "./types";

export interface TripOption {
  route: Route;
  directionIndex: number;
  pathIndex: number;
  board: [number, number];
  alight: [number, number];
  segment: [number, number][];
  walkToMeters: number;
  walkFromMeters: number;
  rideMeters: number;
  rideMinutes: number;
  waitMinutes: number;
  totalMinutes: number;
}

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_DEG_LAT = 110_574;
const MAX_WALK_METERS = 700;
const MIN_RIDE_METERS = 150;
const WALK_METERS_PER_MIN = 75;
const BUS_METERS_PER_MIN = 300;
const WALK_DETOUR_FACTOR = 1.2;

export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function haversine(a: [number, number], b: [number, number]) {
  return distanceMeters({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
}

type Nearest = {
  distance: number;
  index: number;
  point: [number, number];
  along: number;
};

function nearestOnPath(lat: number, lng: number, path: [number, number][]): Nearest | null {
  if (path.length < 2) return null;

  const mPerLng = Math.cos((lat * Math.PI) / 180) * METERS_PER_DEG_LAT;
  const cumulative = new Array<number>(path.length).fill(0);
  for (let i = 1; i < path.length; i++) {
    cumulative[i] = cumulative[i - 1] + haversine(path[i - 1], path[i]);
  }

  let best: Nearest | null = null;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const ax = (a[1] - lng) * mPerLng;
    const ay = (a[0] - lat) * METERS_PER_DEG_LAT;
    const bx = (b[1] - lng) * mPerLng;
    const by = (b[0] - lat) * METERS_PER_DEG_LAT;
    const dx = bx - ax;
    const dy = by - ay;
    const length2 = dx * dx + dy * dy;
    const t =
      length2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2));
    const distance = Math.hypot(ax + t * dx, ay + t * dy);
    if (!best || distance < best.distance) {
      const point: [number, number] = [
        a[0] + t * (b[0] - a[0]),
        a[1] + t * (b[1] - a[1])
      ];
      best = {
        distance,
        index: i,
        point,
        along: cumulative[i] + haversine(a, point)
      };
    }
  }
  return best;
}

function buildSegment(
  path: [number, number][],
  start: Nearest,
  end: Nearest
): [number, number][] {
  const segment: [number, number][] = [[start.point[0], start.point[1]]];
  if (start.index !== end.index) {
    for (let i = start.index + 1; i <= end.index; i++) {
      segment.push([path[i][0], path[i][1]]);
    }
  }
  segment.push([end.point[0], end.point[1]]);
  return segment;
}

/**
 * Rutas directas entre un origen y un destino. Se apoya en el orden del
 * trazado para saber si la ruta avanza del origen al destino; no inventa paradas.
 */
export function findDirectTrips(
  origin: Origin,
  destination: Place,
  routes: Route[]
): TripOption[] {
  const bestByRoute = new Map<string, TripOption>();
  const originPoint = { lat: origin.lat, lng: origin.lng };
  const destinationPoint = { lat: destination.lat, lng: destination.lng };

  for (const route of routes) {
    for (const [directionIndex, direction] of route.directions.entries()) {
      for (const [pathIndex, path] of direction.paths.entries()) {
        const start = nearestOnPath(originPoint.lat, originPoint.lng, path);
        const end = nearestOnPath(destinationPoint.lat, destinationPoint.lng, path);
        if (!start || !end) continue;
        if (start.distance > MAX_WALK_METERS || end.distance > MAX_WALK_METERS) continue;
        if (end.along - start.along < MIN_RIDE_METERS) continue;

        const rideMeters = end.along - start.along;
        const walkToMinutes = (start.distance * WALK_DETOUR_FACTOR) / WALK_METERS_PER_MIN;
        const walkFromMinutes = (end.distance * WALK_DETOUR_FACTOR) / WALK_METERS_PER_MIN;
        const rideMinutes = rideMeters / BUS_METERS_PER_MIN;
        const waitMinutes = (route.weekday.frequencyMin ?? 10) / 2;
        const totalMinutes = Math.round(
          walkToMinutes + waitMinutes + rideMinutes + walkFromMinutes
        );

        const option: TripOption = {
          route,
          directionIndex,
          pathIndex,
          board: [start.point[0], start.point[1]],
          alight: [end.point[0], end.point[1]],
          segment: buildSegment(path, start, end),
          walkToMeters: Math.round(start.distance),
          walkFromMeters: Math.round(end.distance),
          rideMeters: Math.round(rideMeters),
          rideMinutes: Math.round(rideMinutes),
          waitMinutes: Math.round(waitMinutes),
          totalMinutes
        };

        const current = bestByRoute.get(route.id);
        if (!current || option.totalMinutes < current.totalMinutes) {
          bestByRoute.set(route.id, option);
        }
      }
    }
  }

  return [...bestByRoute.values()]
    .sort(
      (a, b) =>
        a.totalMinutes - b.totalMinutes ||
        a.walkToMeters + a.walkFromMeters - (b.walkToMeters + b.walkFromMeters)
    )
    .slice(0, 4);
}
