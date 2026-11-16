import type { City, CitySummary } from "./types";

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
    getJson<City>(`/api/cities/${encodeURIComponent(slug)}`, signal)
};
