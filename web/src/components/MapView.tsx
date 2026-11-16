import L from "leaflet";
import { useCallback, useEffect, useRef } from "react";
import type { TripOption } from "../planner";
import type { City, NearbyRoute, Origin, Place, Route } from "../types";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type Props = {
  city: City;
  selected: Route | null;
  activeDirection: number;
  nearby: NearbyRoute[] | null;
  nearMode: boolean;
  origin: Origin | null;
  destination: Place | null;
  trip: TripOption | null;
  tripRouteIds: string[];
  originRadius: number;
  onSelect: (id: string) => void;
};

const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function MapView({
  city,
  selected,
  activeDirection,
  nearby,
  nearMode,
  origin,
  destination,
  trip,
  tripRouteIds,
  originRadius,
  onSelect
}: Props) {
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
    const focusIds = new Set(tripRouteIds);
    const hasFocus = focusIds.size > 0;
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

    if (trip) {
      for (const route of city.routes) {
        if (route.id === trip.route.id) continue;
        for (const direction of route.directions) {
          for (const path of direction.paths) {
            addPath(path, route.color, 2, 0.1, route);
          }
        }
      }
      for (const direction of trip.route.directions) {
        for (const path of direction.paths) {
          addPath(path, trip.route.color, 2.6, 0.22, trip.route);
        }
      }
      L.polyline(trip.segment, {
        color: "#ffffff",
        weight: 9,
        opacity: 0.95,
        lineCap: "round",
        lineJoin: "round"
      }).addTo(group);
      const segment = L.polyline(trip.segment, {
        color: trip.route.color,
        weight: 6,
        opacity: 1,
        lineCap: "round",
        lineJoin: "round"
      });
      segment.on("click", () => onSelect(trip.route.id));
      segment
        .bindTooltip(`${trip.route.code} · ${trip.route.name}`, {
          sticky: true,
          className: "route-tip",
          opacity: 1
        })
        .addTo(group);

      L.circleMarker(trip.board, {
        radius: 5,
        color: "#ffffff",
        weight: 2,
        fillColor: "#0e6e4e",
        fillOpacity: 1
      })
        .bindTooltip(`Sube a la ${trip.route.code}`, { className: "stop-tip" })
        .addTo(group);
      L.circleMarker(trip.alight, {
        radius: 5,
        color: "#ffffff",
        weight: 2,
        fillColor: "#be123c",
        fillOpacity: 1
      })
        .bindTooltip(`Baja de la ${trip.route.code}`, { className: "stop-tip" })
        .addTo(group);

      return () => {
        group.remove();
        routesLayerRef.current = null;
      };
    }

    for (const route of city.routes) {
      if (selected && route.id === selected.id) continue;
      const isFocus = hasFocus && focusIds.has(route.id);
      const dimmed = selected
        ? true
        : (nearMode && !nearbyIds.has(route.id)) || (hasFocus && !isFocus);
      const weight = nearMode && nearbyIds.has(route.id) ? 3.6 : isFocus ? 3.6 : 2.8;
      const opacity = dimmed
        ? 0.12
        : nearMode && nearbyIds.has(route.id)
          ? 0.95
          : isFocus
            ? 0.9
            : 0.68;
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
  }, [city, selected, activeDirection, nearby, nearMode, trip, tripRouteIds, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (userLayerRef.current) userLayerRef.current.remove();
    if (!origin && !destination) return;

    const layer = L.layerGroup().addTo(map);

    if (origin) {
      const isGps = origin.kind === "gps";
      if (isGps || !destination) {
        L.circle([origin.lat, origin.lng], {
          radius: isGps ? Math.min(origin.accuracy, 300) : originRadius,
          color: isGps ? "#0e6e4e" : "#b45309",
          weight: 1,
          opacity: isGps ? 0.3 : 0.55,
          fillColor: isGps ? "#0e6e4e" : "#b45309",
          fillOpacity: isGps ? 0.08 : 0.04,
          dashArray: isGps ? undefined : "4 7"
        }).addTo(layer);
      }

      const marker = L.marker([origin.lat, origin.lng], {
        interactive: !isGps,
        keyboard: false,
        icon: L.divIcon({
          className: "",
          html: isGps
            ? '<div class="location-pin"><span class="location-pin__pulse"></span><span class="location-pin__dot"></span></div>'
            : '<div class="origin-pin"><span class="origin-pin__dot"></span></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      }).addTo(layer);

      if (!isGps) {
        marker.bindTooltip(origin.label, {
          permanent: true,
          direction: "top",
          className: "origin-tip",
          offset: [0, -8]
        });
      }
    }

    if (destination) {
      L.marker([destination.lat, destination.lng], {
        keyboard: false,
        icon: L.divIcon({
          className: "",
          html: '<div class="destination-pin"><span class="destination-pin__dot"></span></div>',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      })
        .bindTooltip(destination.name, {
          permanent: true,
          direction: "top",
          className: "destination-tip",
          offset: [0, -8]
        })
        .addTo(layer);
    }

    userLayerRef.current = layer;

    return () => {
      layer.remove();
      userLayerRef.current = null;
    };
  }, [origin, destination, originRadius]);

  const focusCity = useCallback(() => {
    const map = mapRef.current;
    if (!map || selected || trip) return;

    if (origin && destination) {
      const bounds = L.latLngBounds([
        [origin.lat, origin.lng],
        [destination.lat, destination.lng]
      ]);
      map.fitBounds(bounds, {
        paddingTopLeft: [24, 28],
        paddingBottomRight: [24, 28],
        maxZoom: 15,
        animate: !reducedMotion()
      });
      return;
    }

    const focus = origin ?? destination;
    if (focus) {
      if (reducedMotion()) {
        map.setView([focus.lat, focus.lng], 15);
      } else {
        map.flyTo([focus.lat, focus.lng], 15, { duration: 0.8 });
      }
      return;
    }

    const zoom = isMobile() ? Math.max(city.zoom - 1, 10) : city.zoom;
    if (reducedMotion()) {
      map.setView([city.center.lat, city.center.lng], zoom);
    } else {
      map.flyTo([city.center.lat, city.center.lng], zoom, { duration: 0.6 });
    }
  }, [city, origin, destination, selected, trip]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (trip) {
      const points: [number, number][] = [...trip.segment, trip.board, trip.alight];
      if (origin) points.push([origin.lat, origin.lng]);
      if (destination) points.push([destination.lat, destination.lng]);
      map.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [24, 28],
        paddingBottomRight: [24, 28],
        maxZoom: 15,
        animate: !reducedMotion()
      });
      return;
    }

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
  }, [trip, selected, focusCity, origin, destination]);

  return <div ref={containerRef} className="map" role="region" aria-label={`Mapa de rutas de ${city.name}`} aria-describedby="map-instructions" />;
}
