import type { NearbyRoute, Origin, Place, Route } from "./types";

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
  waitMinutes: number | null;
  waitKnown: boolean;
  totalMinutes: number;
}

export interface SplitRoute {
  route: Route;
  fragments: number;
}

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_DEG_LAT = 110_574;
const MAX_WALK_METERS = 700;
const MIN_RIDE_METERS = 150;
const WALK_METERS_PER_MIN = 75;
const BUS_METERS_PER_MIN = 300;
const WALK_DETOUR_FACTOR = 1.2;
const MAX_CANDIDATES = 6;
const CANDIDATE_DEDUPE_METERS = 30;
const LOOP_MAX_GAP_METERS = 150;

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

function cumulativeDistances(path: [number, number][]) {
  const cumulative = new Array<number>(path.length).fill(0);
  for (let i = 1; i < path.length; i++) {
    cumulative[i] = cumulative[i - 1] + haversine(path[i - 1], path[i]);
  }
  return cumulative;
}

function projectOnSegment(
  lat: number,
  lng: number,
  a: [number, number],
  b: [number, number],
  mPerLng: number
) {
  const ax = (a[1] - lng) * mPerLng;
  const ay = (a[0] - lat) * METERS_PER_DEG_LAT;
  const bx = (b[1] - lng) * mPerLng;
  const by = (b[0] - lat) * METERS_PER_DEG_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length2));
  return {
    distance: Math.hypot(ax + t * dx, ay + t * dy),
    point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] as [number, number]
  };
}

function nearestOnPath(lat: number, lng: number, path: [number, number][]): Nearest | null {
  if (path.length < 2) return null;
  const mPerLng = Math.cos((lat * Math.PI) / 180) * METERS_PER_DEG_LAT;
  const cumulative = cumulativeDistances(path);
  let best: Nearest | null = null;

  for (let i = 0; i < path.length - 1; i++) {
    const hit = projectOnSegment(lat, lng, path[i], path[i + 1], mPerLng);
    if (!best || hit.distance < best.distance) {
      best = {
        distance: hit.distance,
        index: i,
        point: hit.point,
        along: cumulative[i] + haversine(path[i], hit.point)
      };
    }
  }
  return best;
}

/**
 * El punto puede estar cerca de la ruta en más de un tramo (ida y vuelta,
 * calles paralelas o una ruta que se cruza). Se evalúan hasta 6 apariciones
 * para no quedarse con la primera y elegir un rodeo.
 */
function candidatesOnPath(
  lat: number,
  lng: number,
  path: [number, number][]
): Nearest[] {
  if (path.length < 2) return [];
  const mPerLng = Math.cos((lat * Math.PI) / 180) * METERS_PER_DEG_LAT;
  const cumulative = cumulativeDistances(path);
  const candidates: Nearest[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const hit = projectOnSegment(lat, lng, path[i], path[i + 1], mPerLng);
    if (hit.distance > MAX_WALK_METERS) continue;
    candidates.push({
      distance: hit.distance,
      index: i,
      point: hit.point,
      along: cumulative[i] + haversine(path[i], hit.point)
    });
  }

  candidates.sort((a, b) => a.distance - b.distance);
  const unique: Nearest[] = [];
  for (const candidate of candidates) {
    if (unique.some((item) => Math.abs(item.along - candidate.along) < CANDIDATE_DEDUPE_METERS)) {
      continue;
    }
    unique.push(candidate);
    if (unique.length >= MAX_CANDIDATES) break;
  }
  return unique;
}

function buildSegment(
  path: [number, number][],
  start: Nearest,
  end: Nearest,
  wrap: boolean
): [number, number][] {
  const segment: [number, number][] = [[start.point[0], start.point[1]]];

  if (wrap) {
    for (let i = start.index + 1; i < path.length; i++) {
      segment.push([path[i][0], path[i][1]]);
    }
    for (let i = 0; i <= end.index; i++) {
      segment.push([path[i][0], path[i][1]]);
    }
  } else {
    for (let i = start.index + 1; i <= end.index; i++) {
      segment.push([path[i][0], path[i][1]]);
    }
  }

  segment.push([end.point[0], end.point[1]]);
  return segment;
}

/**
 * Rutas directas entre un origen y un destino. Evalúa varias proyecciones por
 * extremo y solo permite cerrar un circuito cuando la ruta está marcada como
 * circular y su trazado termina cerca de donde empieza.
 */
export function findDirectTrips(
  origin: Origin,
  destination: Place,
  routes: Route[]
): TripOption[] {
  const bestByRoute = new Map<string, TripOption>();
  const isSunday = new Date().getDay() === 0;

  for (const route of routes) {
    const schedule = isSunday ? route.sunday : route.weekday;
    const waitMinutes =
      schedule.frequencyMin && schedule.frequencyMin > 0
        ? schedule.frequencyMin / 2
        : null;

    for (const [directionIndex, direction] of route.directions.entries()) {
      for (const [pathIndex, path] of direction.paths.entries()) {
        const starts = candidatesOnPath(origin.lat, origin.lng, path);
        const ends = candidatesOnPath(destination.lat, destination.lng, path);
        if (!starts.length || !ends.length) continue;

        const pathLength = path.length
          ? cumulativeDistances(path)[path.length - 1]
          : 0;
        const isOperationalLoop =
          route.circular && haversine(path[0], path[path.length - 1]) <= LOOP_MAX_GAP_METERS;

        for (const start of starts) {
          for (const end of ends) {
            let rideMeters: number;
            let wrap = false;

            if (end.along > start.along + MIN_RIDE_METERS) {
              rideMeters = end.along - start.along;
            } else if (isOperationalLoop) {
              rideMeters = pathLength - start.along + end.along;
              wrap = true;
              if (rideMeters < MIN_RIDE_METERS) continue;
            } else {
              continue;
            }

            const walkToMinutes = (start.distance * WALK_DETOUR_FACTOR) / WALK_METERS_PER_MIN;
            const walkFromMinutes = (end.distance * WALK_DETOUR_FACTOR) / WALK_METERS_PER_MIN;
            const rideMinutes = rideMeters / BUS_METERS_PER_MIN;
            const totalMinutes =
              walkToMinutes + rideMinutes + walkFromMinutes + (waitMinutes ?? 0);

            const option: TripOption = {
              route,
              directionIndex,
              pathIndex,
              board: [start.point[0], start.point[1]],
              alight: [end.point[0], end.point[1]],
              segment: buildSegment(path, start, end, wrap),
              walkToMeters: Math.round(start.distance),
              walkFromMeters: Math.round(end.distance),
              rideMeters: Math.round(rideMeters),
              rideMinutes,
              waitMinutes,
              waitKnown: waitMinutes !== null,
              totalMinutes
            };

            const current = bestByRoute.get(route.id);
            if (
              !current ||
              option.totalMinutes < current.totalMinutes ||
              (option.totalMinutes === current.totalMinutes &&
                option.walkToMeters + option.walkFromMeters <
                  current.walkToMeters + current.walkFromMeters)
            ) {
              bestByRoute.set(route.id, option);
            }
          }
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

/**
 * Rutas que tienen al menos un punto cerca del origen y otro del destino, pero
 * cuyo sentido está dividido en varios fragmentos. No se presentan como
 * directas: se avisa que el mapa no permite verificarlas.
 */
export function findSplitRoutes(
  origin: Origin,
  destination: Place,
  routes: Route[]
): SplitRoute[] {
  const result: SplitRoute[] = [];

  for (const route of routes) {
    const fragments = Math.max(...route.directions.map((direction) => direction.paths.length));
    if (fragments < 2) continue;

    let originServed = false;
    let destinationServed = false;
    for (const direction of route.directions) {
      for (const path of direction.paths) {
        const start = nearestOnPath(origin.lat, origin.lng, path);
        const end = nearestOnPath(destination.lat, destination.lng, path);
        if (start && start.distance <= MAX_WALK_METERS) originServed = true;
        if (end && end.distance <= MAX_WALK_METERS) destinationServed = true;
      }
    }
    if (originServed && destinationServed) {
      result.push({ route, fragments });
    }
  }
  return result;
}

/**
 * Equivalente cliente del endpoint /near: evita enviar coordenadas al servidor.
 */
export function findNearbyRoutes(
  point: { lat: number; lng: number },
  radiusMeters: number,
  routes: Route[]
): NearbyRoute[] {
  return routes
    .map((route) => {
      let best = Number.POSITIVE_INFINITY;
      let direction = "";
      for (const item of route.directions) {
        for (const path of item.paths) {
          const hit = nearestOnPath(point.lat, point.lng, path);
          if (hit && hit.distance < best) {
            best = hit.distance;
            direction = item.name;
          }
        }
      }
      if (!Number.isFinite(best) || best > radiusMeters) return null;
      return {
        id: route.id,
        code: route.code,
        name: route.name,
        color: route.color,
        type: route.type,
        direction,
        distanceMeters: Math.round(best)
      } satisfies NearbyRoute;
    })
    .filter((hit): hit is NearbyRoute => hit !== null)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}
