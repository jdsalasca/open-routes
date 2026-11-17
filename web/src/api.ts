import type { City, CitySummary, NewsItem, Place, Route } from "./types";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!response.ok) {
    throw new Error(`La API respondió ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  cities: (signal?: AbortSignal) => getJson<CitySummary[]>("/api/cities", signal),
  city: (slug: string, signal?: AbortSignal) =>
    getJson<City>(`/api/cities/${encodeURIComponent(slug)}`, signal),
  searchPlaces: (slug: string, query: string, signal?: AbortSignal) =>
    getJson<Place[]>(
      `/api/cities/${encodeURIComponent(slug)}/search?q=${encodeURIComponent(query)}`,
      signal
    ),
  news: (slug: string, signal?: AbortSignal) =>
    getJson<NewsItem[]>(`/api/cities/${encodeURIComponent(slug)}/news`, signal),
  tripRoutes: (
    slug: string,
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    signal?: AbortSignal
  ) =>
    getJson<Route[]>(
      `/api/cities/${encodeURIComponent(slug)}/trip-routes?fromLat=${from.lat.toFixed(4)}` +
        `&fromLng=${from.lng.toFixed(4)}&toLat=${to.lat.toFixed(4)}&toLng=${to.lng.toFixed(4)}&radius=150`,
      signal
    )
};
