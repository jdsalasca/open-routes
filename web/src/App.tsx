import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { api } from "./api";
import { AboutDialog } from "./components/AboutDialog";
import {
  BusIcon,
  ChevronRightIcon,
  GithubIcon,
  InfoIcon,
  LocateIcon,
  LogoMark,
  PinIcon,
  SearchIcon,
  SwapIcon,
  TicketIcon
} from "./components/Icons";
import { MapView } from "./components/MapView";
import { PlaceField } from "./components/PlaceField";
import { RouteDetail } from "./components/RouteDetail";
import { TripDetail } from "./components/TripDetail";
import { useGeolocation } from "./hooks/useGeolocation";
import { distanceMeters, findDirectTrips } from "./planner";
import type { TripOption } from "./planner";
import type { City, CitySummary, NearbyRoute, Origin, Place, Route } from "./types";

const GPS_RADIUS = 1000;
const PLACE_RADIUS = 500;

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const money = (value: number) =>
  "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);

const frequency = (value: number | null) => (value ? `Cada ${value} min` : "Frecuencia variable");

const distanceLabel = (meters: number) =>
  meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1).replace(".", ",")} km`;

export default function App() {
  const aboutRef = useRef<HTMLDialogElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const listHeadRef = useRef<HTMLDivElement>(null);
  const nearbyAbort = useRef<AbortController | null>(null);
  const routeRefs = useRef(new Map<string, HTMLButtonElement>());
  const [cities, setCities] = useState<CitySummary[] | null>(null);
  const [slug, setSlug] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get("city")
  );
  const [city, setCity] = useState<City | null>(null);
  const [boot, setBoot] = useState<"loading" | "ready" | "error">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDirection, setActiveDirection] = useState(0);
  const [activeTrip, setActiveTrip] = useState<TripOption | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [nearby, setNearby] = useState<NearbyRoute[] | null>(null);
  const [nearMode, setNearMode] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [query, setQuery] = useState("");
  const { status, error: geoError, locate } = useGeolocation();

  useEffect(() => {
    const controller = new AbortController();
    api
      .cities(controller.signal)
      .then((list) => {
        if (!list.length) throw new Error("No hay ciudades publicadas");
        setCities(list);
        setSlug((current) =>
          current && list.some((item) => item.slug === current) ? current : list[0].slug
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setBoot("error");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!slug) return;
    nearbyAbort.current?.abort();
    setNearbyError(null);
    setNearbyLoading(false);
    const controller = new AbortController();
    setBoot("loading");
    api
      .city(slug, controller.signal)
      .then((data) => {
        setCity(data);
        setBoot("ready");
        setSelectedId(null);
        setActiveDirection(0);
        setActiveTrip(null);
        setOrigin(null);
        setDestination(null);
        setNearby(null);
        setNearMode(false);
        setQuery("");
        document.title = `open-routes · Rutas de ${data.name}`;
      })
      .catch(() => {
        if (!controller.signal.aborted) setBoot("error");
      });
    return () => controller.abort();
  }, [slug]);

  const selected = useMemo(
    () => city?.routes.find((route) => route.id === selectedId) ?? null,
    [city, selectedId]
  );

  useEffect(() => {
    sidebarRef.current?.scrollTo({ top: 0 });
  }, [selectedId, activeTrip]);

  const places = city?.places ?? [];
  const nearbyById = useMemo(
    () => new Map((nearby ?? []).map((hit) => [hit.id, hit])),
    [nearby]
  );

  const visibleRoutes = useMemo(() => {
    if (!city) return [];
    let list: Route[] = city.routes;
    if (nearMode && nearby) {
      list = nearby
        .map((hit) => city.routes.find((route) => route.id === hit.id))
        .filter((route): route is Route => Boolean(route));
    }
    const term = normalize(query.trim());
    if (!term) return list;
    return list.filter((route) =>
      normalize(
        [route.code, route.name, route.description, ...route.directions.flatMap((d) => d.streets)].join(" ")
      ).includes(term)
    );
  }, [city, nearMode, nearby, query]);

  const samePlace = Boolean(
    origin && destination && distanceMeters(origin, destination) < 100
  );

  const tripOptions = useMemo(() => {
    if (!city || !origin || !destination || samePlace) return [];
    return findDirectTrips(origin, destination, city.routes);
  }, [city, origin, destination, samePlace]);

  const tripRouteIds = useMemo(
    () => tripOptions.map((option) => option.route.id),
    [tripOptions]
  );

  const tripMode = Boolean(origin && destination);
  const destinationOnly = Boolean(!origin && destination);
  const canSwap = origin?.kind === "place" && destination !== null;
  const originRadius = origin?.kind === "place" ? PLACE_RADIUS : GPS_RADIUS;
  const detailOpen = Boolean(selected || activeTrip);

  const clearNearby = useCallback(() => {
    nearbyAbort.current?.abort();
    setNearby(null);
    setNearMode(false);
    setNearbyError(null);
    setNearbyLoading(false);
  }, []);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 900px)").matches) return;
    const reveal = (nearMode && nearby) || tripMode;
    if (!reveal) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      listHeadRef.current?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [nearMode, nearby, tripMode, origin, destination]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setActiveDirection(0);
    setActiveTrip(null);
  }, []);

  const showAll = useCallback(() => {
    clearNearby();
    setOrigin(null);
    setDestination(null);
    setActiveTrip(null);
    setSelectedId(null);
    setQuery("");
    sidebarRef.current?.scrollTo({ top: 0 });
  }, [clearNearby]);

  const loadNearby = useCallback(
    async (point: { lat: number; lng: number }, citySlug: string, radius: number) => {
      nearbyAbort.current?.abort();
      const controller = new AbortController();
      nearbyAbort.current = controller;
      setNearby(null);
      setNearMode(false);
      setNearbyLoading(true);
      setNearbyError(null);
      try {
        const hits = await api.nearby(citySlug, point.lat, point.lng, radius, controller.signal);
        if (controller.signal.aborted) return;
        setNearby(hits);
        setNearMode(true);
        setQuery("");
      } catch {
        if (controller.signal.aborted) return;
        setNearby(null);
        setNearMode(false);
        setNearbyError("No pudimos consultar las rutas cercanas. Revisa tu conexión e inténtalo otra vez.");
      } finally {
        if (!controller.signal.aborted) setNearbyLoading(false);
      }
    },
    []
  );

  const selectOriginPlace = useCallback(
    (place: Place) => {
      if (!city) return;
      setOrigin({
        kind: "place",
        lat: place.lat,
        lng: place.lng,
        label: place.name,
        type: place.type
      });
      setActiveTrip(null);
      setSelectedId(null);
      setQuery("");
      if (destination) {
        clearNearby();
      } else {
        void loadNearby({ lat: place.lat, lng: place.lng }, city.slug, PLACE_RADIUS);
      }
    },
    [city, destination, clearNearby, loadNearby]
  );

  const selectDestination = useCallback(
    (place: Place) => {
      setDestination(place);
      setActiveTrip(null);
      setSelectedId(null);
      setQuery("");
      clearNearby();
    },
    [clearNearby]
  );

  const clearOrigin = useCallback(() => {
    setOrigin(null);
    setActiveTrip(null);
    clearNearby();
  }, [clearNearby]);

  const clearDestination = useCallback(() => {
    setDestination(null);
    setActiveTrip(null);
    if (origin && city) {
      void loadNearby(
        origin,
        city.slug,
        origin.kind === "place" ? PLACE_RADIUS : GPS_RADIUS
      );
    } else {
      clearNearby();
    }
  }, [city, origin, clearNearby, loadNearby]);

  const swapEnds = useCallback(() => {
    if (!origin || origin.kind !== "place" || !destination) return;
    const nextOrigin: Origin = {
      kind: "place",
      lat: destination.lat,
      lng: destination.lng,
      label: destination.name,
      type: destination.type
    };
    const nextDestination: Place = {
      id: "swapped-origin",
      name: origin.label,
      type: origin.type,
      lat: origin.lat,
      lng: origin.lng,
      aliases: []
    };
    setOrigin(nextOrigin);
    setDestination(nextDestination);
    setActiveTrip(null);
    clearNearby();
  }, [origin, destination, clearNearby]);

  const handleLocate = useCallback(async () => {
    if (!city) return;
    setSelectedId(null);
    const point = await locate();
    if (!point) return;
    setOrigin({ kind: "gps", ...point, label: "Tu ubicación" });
    setActiveTrip(null);
    if (destination) {
      clearNearby();
    } else {
      await loadNearby(point, city.slug, GPS_RADIUS);
    }
  }, [city, destination, locate, clearNearby, loadNearby]);

  const retryNearby = useCallback(() => {
    if (!origin || !city) return;
    void loadNearby(
      origin,
      city.slug,
      origin.kind === "place" ? PLACE_RADIUS : GPS_RADIUS
    );
  }, [city, origin, loadNearby]);

  const openTrip = useCallback((trip: TripOption) => {
    setActiveTrip(trip);
    setSelectedId(null);
    setActiveDirection(trip.directionIndex);
  }, []);

  const openRouteFromTrip = useCallback(() => {
    if (!activeTrip) return;
    setSelectedId(activeTrip.route.id);
    setActiveDirection(activeTrip.directionIndex);
    setActiveTrip(null);
  }, [activeTrip]);

  const handleBack = useCallback(() => {
    const id = selectedId;
    setSelectedId(null);
    setActiveDirection(0);
    requestAnimationFrame(() => {
      if (id) routeRefs.current.get(id)?.focus();
    });
  }, [selectedId]);

  if (boot === "error") {
    return (
      <div className="loading">
        <div className="loading__card">
          <LogoMark size={38} />
          <strong>No pudimos cargar las rutas.</strong>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (boot === "loading" || !city) {
    return (
      <div className="loading">
        <div className="loading__card">
          <LogoMark size={38} />
          <span className="loading__spinner" aria-hidden="true" />
          <span>Cargando rutas…</span>
        </div>
      </div>
    );
  }

  const listNote = tripMode
    ? samePlace
      ? "mismo lugar"
      : tripOptions.length
        ? `${tripOptions.length} ${tripOptions.length === 1 ? "ruta directa" : "rutas directas"}`
        : "sin ruta directa"
    : destinationOnly
      ? "destino elegido"
      : query.trim()
        ? `${visibleRoutes.length} resultados`
        : origin
          ? origin.kind === "place"
            ? "a 500 m"
            : "radio de 1 km"
          : `${city.routes.length} rutas`;

  const headTitle = tripMode
    ? "Opciones de viaje"
    : destinationOnly
      ? "Elige un origen"
      : origin
        ? origin.kind === "gps"
          ? "Rutas cerca de ti"
          : `Rutas cerca de ${origin.label}`
        : "Todas las rutas";

  const locateLabel =
    status === "locating"
      ? "Buscando tu ubicación…"
      : nearbyLoading
        ? "Buscando rutas…"
        : origin?.kind === "gps"
          ? "Actualizar mi ubicación"
          : "Usar mi ubicación";

  return (
    <div className={`app${detailOpen ? " app--detail" : ""}`}>
      <a className="skip-link" href="#rutas">
        Saltar a la lista de rutas
      </a>

      <header className="topbar">
        <button
          type="button"
          className="brand"
          onClick={() => {
            setSelectedId(null);
            showAll();
          }}
          aria-label="open-routes, inicio"
        >
          <LogoMark />
          <span className="brand__name">
            open<span>-routes</span>
          </span>
          <span className="brand__tag">beta</span>
        </button>

        {cities && cities.length > 1 ? (
          <label className="city-pill">
            <PinIcon size={14} />
            <span className="visually-hidden">Ciudad</span>
            <select value={city.slug} onChange={(event) => setSlug(event.target.value)}>
              {cities.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}, {item.department}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="city-pill">
            <PinIcon size={14} />
            <span>
              {city.name}
              <span className="city-pill__dept">, {city.department}</span>
            </span>
          </div>
        )}

        <div className="topbar__actions">
          <button
            type="button"
            className="text-button"
            onClick={() => aboutRef.current?.showModal()}
          >
            Acerca de
          </button>
          <button
            type="button"
            className="icon-button about-icon"
            aria-label="Acerca de open-routes"
            onClick={() => aboutRef.current?.showModal()}
          >
            <InfoIcon size={18} />
          </button>
          <a
            className="icon-button"
            href="https://github.com/jdsalasca/open-routes"
            target="_blank"
            rel="noreferrer"
            aria-label="Código en GitHub"
          >
            <GithubIcon />
          </a>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar" ref={sidebarRef} aria-label="Rutas de transporte">
          {activeTrip ? (
            <TripDetail
              trip={activeTrip}
              originLabel={origin?.label ?? "tu origen"}
              destinationLabel={destination?.name ?? "tu destino"}
              onBack={() => setActiveTrip(null)}
              onOpenRoute={openRouteFromTrip}
            />
          ) : selected ? (
            <RouteDetail
              route={selected}
              activeDirection={activeDirection}
              onDirection={setActiveDirection}
              onBack={handleBack}
              fare={city.fare}
            />
          ) : (
            <>
              <section className="hero">
                <p className="hero__eyebrow">
                  <span className="hero__dot" />
                  {city.name} · {city.department}
                </p>
                <h1>
                  ¿Qué <em>ruta</em> te lleva?
                </h1>
                <p>
                  Elige un origen y un destino para ver rutas directas, o usa tu ubicación.
                </p>

                <div className="hero__actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleLocate}
                    disabled={status === "locating" || nearbyLoading}
                  >
                    <LocateIcon />
                    {locateLabel}
                  </button>
                </div>

                <div className="trip-form">
                  <PlaceField
                    id="origin-field"
                    label="Origen"
                    tone="origin"
                    icon={<PinIcon size={16} />}
                    selectedLabel={origin?.label}
                    selectedHint={
                      origin ? (origin.kind === "gps" ? "Ubicación actual" : origin.type) : undefined
                    }
                    placeholder="Escandinavo, Plaza de Bolívar…"
                    places={places}
                    onSelect={selectOriginPlace}
                    onClear={clearOrigin}
                  />
                  <button
                    type="button"
                    className="swap-button"
                    onClick={swapEnds}
                    disabled={!canSwap}
                    aria-label="Intercambiar origen y destino"
                    title={
                      canSwap
                        ? "Intercambiar origen y destino"
                        : "Elige un origen y un destino para intercambiar"
                    }
                  >
                    <SwapIcon size={16} />
                  </button>
                  <PlaceField
                    id="destination-field"
                    label="Destino"
                    tone="destination"
                    icon={<PinIcon size={16} />}
                    selectedLabel={destination?.name}
                    selectedHint={destination?.type}
                    placeholder="¿A dónde vas? (opcional)"
                    places={places}
                    onSelect={selectDestination}
                    onClear={clearDestination}
                  />
                </div>

                <p className="hero__privacy">
                  Se envía a nuestro servidor solo para calcular distancias. No se almacena.
                </p>
                <div className="hero__meta">
                  <span className="meta-chip">
                    <BusIcon size={13} /> {city.routes.length} rutas
                  </span>
                  <span className="meta-chip">
                    <TicketIcon size={13} /> Pasaje {money(city.fare.day)}
                  </span>
                </div>
              </section>

              {samePlace && (
                <div className="notice notice--info">
                  <InfoIcon />
                  <span>El origen y el destino son el mismo lugar. Elige otro destino.</span>
                </div>
              )}

              {tripMode && !samePlace && tripOptions.length === 0 && (
                <div className="notice notice--info">
                  <InfoIcon />
                  <span>
                    No encontramos una ruta directa entre {origin?.label} y {destination?.name}.{" "}
                    <button type="button" className="notice__link" onClick={clearDestination}>
                      Ver rutas cerca del origen
                    </button>
                  </span>
                </div>
              )}

              {!tripMode && destinationOnly && (
                <div className="notice notice--info">
                  <InfoIcon />
                  <span>Elige un origen o usa tu ubicación para calcular el viaje.</span>
                </div>
              )}

              {nearbyLoading && !tripMode && (
                <div className="notice notice--info" role="status">
                  <span className="notice__spinner" aria-hidden="true" />
                  <span>Buscando rutas cerca de {origin?.label ?? "tu ubicación"}…</span>
                </div>
              )}

              {geoError && (
                <div className="notice" role="status">
                  <InfoIcon />
                  <span>{geoError}</span>
                </div>
              )}

              {nearbyError && !tripMode && (
                <div className="notice" role="alert">
                  <InfoIcon />
                  <span>
                    {nearbyError}{" "}
                    <button type="button" className="notice__link" onClick={retryNearby}>
                      Reintentar
                    </button>
                  </span>
                </div>
              )}

              {nearMode && nearby !== null && nearby.length === 0 && !tripMode && (
                <div className="notice notice--info">
                  <InfoIcon />
                  <span>
                    {origin?.kind === "place"
                      ? `No hay rutas a menos de 500 m de ${origin.label}.`
                      : "No hay rutas a menos de 1 km."}{" "}
                    <button type="button" className="notice__link" onClick={showAll}>
                      Ver todas
                    </button>
                  </span>
                </div>
              )}

              <div className="list-head" id="rutas" tabIndex={-1} ref={listHeadRef}>
                <h2 title={headTitle}>{headTitle}</h2>
                <span className="list-head__note">{listNote}</span>
              </div>

              {!tripMode && !destinationOnly && (
                <div className="search">
                  <SearchIcon size={15} />
                  <label className="visually-hidden" htmlFor="route-search">
                    Filtrar rutas por código o vía
                  </label>
                  <input
                    id="route-search"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filtrar por ruta o vía…"
                    autoComplete="off"
                  />
                </div>
              )}

              {tripMode ? (
                <div className="trip-list">
                  {!samePlace &&
                    tripOptions.map((option) => (
                      <button
                        key={`${option.route.id}-${option.directionIndex}`}
                        type="button"
                        className="trip-card"
                        style={{ "--route-color": option.route.color } as CSSProperties}
                        onClick={() => openTrip(option)}
                      >
                        <span className="trip-card__code" aria-hidden="true">
                          {option.route.code}
                        </span>
                        <span className="trip-card__body">
                          <span className="trip-card__name">{option.route.name}</span>
                          <span className="trip-card__meta">
                            <strong>≈ {option.totalMinutes} min</strong>
                            <span>
                              {distanceLabel(option.walkToMeters + option.walkFromMeters)} a pie
                            </span>
                            <span>{option.rideMinutes} min en bus</span>
                          </span>
                          <span className="trip-card__hint">
                            Sube cerca de {origin?.label} · baja cerca de {destination?.name}
                          </span>
                        </span>
                        <span className="trip-card__side">
                          <ChevronRightIcon className="route-card__chevron" />
                        </span>
                      </button>
                    ))}
                </div>
              ) : destinationOnly ? (
                <p className="list-empty">
                  Destino: {destination?.name}. Elige un origen o usa tu ubicación para ver las
                  rutas que te llevan.
                </p>
              ) : (
                <div className="route-list">
                  {visibleRoutes.map((route) => {
                    const hit = nearbyById.get(route.id);
                    return (
                      <button
                        key={route.id}
                        ref={(element) => {
                          if (element) routeRefs.current.set(route.id, element);
                          else routeRefs.current.delete(route.id);
                        }}
                        type="button"
                        className={`route-card${selectedId === route.id ? " route-card--selected" : ""}`}
                        style={{ "--route-color": route.color } as CSSProperties}
                        onClick={() => handleSelect(route.id)}
                      >
                        <span className="visually-hidden">Ruta </span>
                        <span className="route-card__code">{route.code}</span>
                        <span className="route-card__body">
                          <span className="route-card__name">{route.name}</span>
                          <span className="route-card__meta">
                            <span>{frequency(route.weekday.frequencyMin)}</span>
                            <span>
                              {route.weekday.start}–{route.weekday.end}
                            </span>
                          </span>
                        </span>
                        <span className="route-card__side">
                          {nearMode && hit && (
                            <span className="route-card__distance">
                              {distanceLabel(hit.distanceMeters)}
                            </span>
                          )}
                          <ChevronRightIcon className="route-card__chevron" />
                        </span>
                      </button>
                    );
                  })}
                  {visibleRoutes.length === 0 && query.trim() && (
                    <p className="list-empty">
                      No encontramos rutas para «{query.trim()}». Prueba con otra vía o con el
                      código de la ruta.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <footer className="sidebar__footer">
            <p>
              Datos de{" "}
              <a href={city.sources[0]?.url} target="_blank" rel="noreferrer">
                {city.sources[0]?.label ?? "la UT Mi Ruta"}
              </a>{" "}
              (2026). Trazados y horarios pueden cambiar: confirma con el operador.
            </p>
            <p>
              <a href="https://github.com/jdsalasca/open-routes" target="_blank" rel="noreferrer">
                Código abierto · MIT
              </a>
            </p>
          </footer>
        </aside>

        <div className="map-wrap">
          <MapView
            city={city}
            selected={selected}
            activeDirection={activeDirection}
            nearby={nearMode ? nearby : null}
            nearMode={nearMode}
            origin={origin}
            destination={destination}
            trip={activeTrip}
            tripRouteIds={tripRouteIds}
            originRadius={originRadius}
            onSelect={handleSelect}
          />
        </div>
      </main>

      <p className="visually-hidden" aria-live="polite">
        {status === "locating"
          ? "Buscando tu ubicación."
          : geoError ??
            nearbyError ??
            (nearbyLoading
              ? `Buscando rutas cerca de ${origin?.label ?? "tu ubicación"}.`
              : tripMode
                ? samePlace
                  ? "El origen y el destino son el mismo lugar."
                  : `${tripOptions.length} rutas directas encontradas.`
                : nearMode && nearby
                  ? `${nearby.length} rutas cerca de ${origin?.label ?? "tu ubicación"}.`
                  : "")}
      </p>

      <AboutDialog dialogRef={aboutRef} city={city} />
    </div>
  );
}
