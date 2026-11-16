import L from "leaflet";
import { useCallback, useEffect, useRef } from "react";
import type { GeoPoint } from "../hooks/useGeolocation";
import type { City, NearbyRoute, Route } from "../types";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type Props = {
  city: City;
  selected: Route | null;
  activeDirection: number;
  nearby: NearbyRoute[] | null;
  nearMode: boolean;
  user: GeoPoint | null;
  onSelect: (id: string) => void;
};

const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function MapView({ city, selected, activeDirection, nearby, nearMode, user, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routesLayerRef = useRef<L.LayerGroup | null>(null);
  const userLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = L.map(container, {
      center: [city.center.lat, city.center.lng],
      zoom: isMobile() ? Math.max(city.zoom - 1, 10) : city.zoom,
      minZoom: Math.max(2, city.zoom - 4),
      maxZoom: 18,
      zoomControl: false,
      attributionControl: true
    });

    L.control.zoom({ position: "topleft" }).addTo(map);
    L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      maxZoom: 19
    }).addTo(map);

    mapRef.current = map;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [city]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const group = L.layerGroup().addTo(map);
    routesLayerRef.current = group;
    const nearbyIds = new Set(nearby?.map((route) => route.id) ?? []);
    const addPath = (points: [number, number][], color: string, weight: number, opacity: number, route: Route) => {
      const line = L.polyline(points, {
        color,
        weight,
        opacity,
        lineCap: "round",
        lineJoin: "round",
        smoothFactor: 0.7
      });
      line.on("click", () => onSelect(route.id));
      line.bindTooltip(`${route.code} · ${route.name}`, {
        sticky: true,
        direction: "top",
        className: "route-tip",
        opacity: 1
      });
      line.addTo(group);
    };

    for (const route of city.routes) {
      if (selected && route.id === selected.id) continue;
      const dimmed = selected ? true : nearMode && !nearbyIds.has(route.id);
      const weight = nearMode && nearbyIds.has(route.id) ? 3.6 : 2.8;
      const opacity = dimmed ? 0.12 : nearMode && nearbyIds.has(route.id) ? 0.95 : 0.68;
      for (const direction of route.directions) {
        for (const path of direction.paths) {
          addPath(path, route.color, weight, opacity, route);
        }
      }
    }

    if (selected) {
      // Halo blanco para que la ruta elegida se lea sobre cualquier fondo.
      for (const direction of selected.directions) {
        for (const path of direction.paths) {
          L.polyline(path, {
            color: "#ffffff",
            weight: 9,
            opacity: 0.95,
            lineCap: "round",
            lineJoin: "round"
          }).addTo(group);
        }
      }
      for (const [index, direction] of selected.directions.entries()) {
        const active = index === activeDirection || selected.directions.length === 1;
        for (const path of direction.paths) {
          addPath(path, selected.color, active ? 6 : 3.2, active ? 1 : 0.35, selected);
        }
      }
      for (const stop of selected.directions[activeDirection]?.stops ?? selected.directions[0]?.stops ?? []) {
        L.circleMarker([stop.lat, stop.lng], {
          radius: 5,
          color: "#ffffff",
          weight: 2,
          fillColor: selected.color,
          fillOpacity: 1
        })
          .bindTooltip(stop.name, { direction: "top", className: "stop-tip" })
          .addTo(group);
      }
    }

    return () => {
      group.remove();
      routesLayerRef.current = null;
    };
  }, [city, selected, activeDirection, nearby, nearMode, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userLayerRef.current) userLayerRef.current.remove();
    if (!user) return;

    const layer = L.layerGroup().addTo(map);
    L.circle([user.lat, user.lng], {
      radius: Math.min(user.accuracy, 300),
      color: "#0e6e4e",
      weight: 1,
      opacity: 0.3,
      fillColor: "#0e6e4e",
      fillOpacity: 0.08
    }).addTo(layer);

    L.marker([user.lat, user.lng], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: "",
        html: '<div class="location-pin"><span class="location-pin__pulse"></span><span class="location-pin__dot"></span></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      })
    }).addTo(layer);

    userLayerRef.current = layer;

    return () => {
      layer.remove();
      userLayerRef.current = null;
    };
  }, [user]);

  const focusCity = useCallback(() => {
    const map = mapRef.current;
    if (!map || selected) return;
    if (user && nearMode) {
      if (reducedMotion()) {
        map.setView([user.lat, user.lng], 15);
      } else {
        map.flyTo([user.lat, user.lng], 15, { duration: 0.8 });
      }
      return;
    }
    const zoom = isMobile() ? Math.max(city.zoom - 1, 10) : city.zoom;
    if (reducedMotion()) {
      map.setView([city.center.lat, city.center.lng], zoom);
    } else {
      map.flyTo([city.center.lat, city.center.lng], zoom, { duration: 0.6 });
    }
  }, [city, user, nearMode, selected]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (selected) {
      const points = selected.directions.flatMap((direction) => direction.paths.flat());
      if (points.length) {
        const bounds = L.latLngBounds(points);
        map.fitBounds(bounds, {
          paddingTopLeft: [24, 28],
          paddingBottomRight: [24, 28],
          maxZoom: 15,
          animate: !reducedMotion()
        });
      }
      return;
    }
    focusCity();
  }, [selected, focusCity]);

  return <div ref={containerRef} className="map" role="region" aria-label={`Mapa de rutas de ${city.name}`} />;
}
