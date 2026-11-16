export interface Point {
  lat: number;
  lng: number;
}

export interface Source {
  label: string;
  url: string;
}

export interface Place {
  id: string;
  name: string;
  type: string;
  lat: number;
  lng: number;
  aliases: string[];
}

export type Origin =
  | { kind: "gps"; lat: number; lng: number; label: string; accuracy: number }
  | { kind: "place"; lat: number; lng: number; label: string; type: string };

export interface Fare {
  day: number;
  night: number;
  currency: string;
  note: string;
}

export interface Schedule {
  start: string;
  end: string;
  frequencyMin: number | null;
}

export interface Stop {
  name: string;
  lat: number;
  lng: number;
}

export interface Direction {
  name: string;
  streets: string[];
  paths: [number, number][][];
  stops: Stop[];
}

export interface Route {
  id: string;
  code: string;
  name: string;
  color: string;
  type: string;
  description: string;
  weekday: Schedule;
  sunday: Schedule;
  operator: string;
  sourceUrl: string;
  circular: boolean;
  directions: Direction[];
}

export interface CitySummary {
  slug: string;
  name: string;
  department: string;
  country: string;
  center: Point;
  zoom: number;
  description: string;
  sources: Source[];
  fare: Fare;
  routeCount: number;
}

export interface City extends Omit<CitySummary, "routeCount"> {
  places: Place[];
  routes: Route[];
}

export interface NearbyRoute {
  id: string;
  code: string;
  name: string;
  color: string;
  type: string;
  direction: string;
  distanceMeters: number;
}
