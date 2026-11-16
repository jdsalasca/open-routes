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
  TicketIcon
} from "./components/Icons";
import { MapView } from "./components/MapView";
import { RouteDetail } from "./components/RouteDetail";
import { useGeolocation } from "./hooks/useGeolocation";
import type { GeoPoint } from "./hooks/useGeolocation";
import type { City, CitySummary, NearbyRoute, Route } from "./types";

const NEARBY_RADIUS = 1000;

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
  const [nearby, setNearby] = useState<NearbyRoute[] | null>(null);
  const [nearMode, setNearMode] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [query, setQuery] = useState("");
  const { position, status, error: geoError, locate } = useGeolocation();

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
  }, [selectedId]);

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

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setActiveDirection(0);
  }, []);

  const showAll = useCallback(() => {
    setNearMode(false);
    setSelectedId(null);
    setQuery("");
  }, []);

  const loadNearby = useCallback(async (point: GeoPoint, citySlug: string) => {
    nearbyAbort.current?.abort();
    const controller = new AbortController();
    nearbyAbort.current = controller;
    setNearbyLoading(true);
    setNearbyError(null);
    try {
      const hits = await api.nearby(citySlug, point.lat, point.lng, NEARBY_RADIUS, controller.signal);
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
  }, []);

  const handleLocate = useCallback(async () => {
    if (!city) return;
    setSelectedId(null);
    setActiveDirection(0);
    const point = await locate();
    if (!point) return;
    await loadNearby(point, city.slug);
  }, [city, locate, loadNearby]);

  const retryNearby = useCallback(() => {
    if (position && city) void loadNearby(position, city.slug);
  }, [city, position, loadNearby]);

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

  const nearbyEmpty = nearMode && nearby !== null && nearby.length === 0;
  const listNote = query.trim()
    ? `${visibleRoutes.length} resultados`
    : nearMode
      ? "radio de 1 km"
      : `${city.routes.length} rutas`;

  return (
    <div className={`app${selected ? " app--detail" : ""}`}>
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

      <div className="layout">
        <aside className="sidebar" ref={sidebarRef} aria-label="Rutas de transporte">
          {selected ? (
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
                  {city.routes.length} rutas de bus en un solo mapa. Activa tu ubicación y mira
                  cuáles pasan cerca de ti, con su recorrido completo.
                </p>
                <div className="hero__actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={handleLocate}
                    disabled={status === "locating" || nearbyLoading}
                  >
                    <LocateIcon />
                    {status === "locating"
                      ? "Buscando tu ubicación…"
                      : nearbyLoading
                        ? "Buscando rutas cerca de ti…"
                        : position
                          ? "Actualizar mi ubicación"
                          : "Usar mi ubicación"}
                  </button>
                  {nearMode && (
                    <button type="button" className="link-button" onClick={showAll}>
                      Ver todas las rutas
                    </button>
                  )}
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

              {geoError && (
                <div className="notice" role="status">
                  <InfoIcon />
                  <span>{geoError}</span>
                </div>
              )}

              {nearbyError && (
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

              {nearbyEmpty && (
                <div className="notice notice--info">
                  <InfoIcon />
                  <span>
                    No hay rutas a menos de 1 km.{" "}
                    <button type="button" className="notice__link" onClick={showAll}>
                      Ver todas
                    </button>
                  </span>
                </div>
              )}

              <div className="list-head" id="rutas" tabIndex={-1}>
                <h2>{nearMode ? "Cerca de ti" : "Todas las rutas"}</h2>
                <span className="list-head__note">{listNote}</span>
                {nearMode && (
                  <button type="button" className="list-head__action" onClick={showAll}>
                    Ver todas
                  </button>
                )}
              </div>

              <div className="search">
                <SearchIcon size={15} />
                <label className="visually-hidden" htmlFor="route-search">
                  Buscar ruta, barrio o vía
                </label>
                <input
                  id="route-search"
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar ruta, barrio o vía…"
                  autoComplete="off"
                />
              </div>

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
                      aria-label={`Ruta ${route.code}: ${route.name}${
                        nearMode && hit ? `. A ${distanceLabel(hit.distanceMeters)} de ti` : ""
                      }`}
                    >
                      <span className="route-card__code" aria-hidden="true">
                        {route.code}
                      </span>
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
                          <span className="route-card__distance">{distanceLabel(hit.distanceMeters)}</span>
                        )}
                        <ChevronRightIcon className="route-card__chevron" />
                      </span>
                    </button>
                  );
                })}
                {visibleRoutes.length === 0 && query.trim() && (
                  <p className="list-empty">
                    No encontramos rutas para «{query.trim()}». Prueba con un barrio, una vía o el
                    código de la ruta.
                  </p>
                )}
              </div>
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
            user={position}
            onSelect={handleSelect}
          />
        </div>
      </div>

      <p className="visually-hidden" aria-live="polite">
        {status === "locating"
          ? "Buscando tu ubicación."
          : geoError ??
            (nearMode && nearby ? `${nearby.length} rutas en un radio de 1 kilómetro.` : "")}
      </p>

      <AboutDialog dialogRef={aboutRef} city={city} />
    </div>
  );
}
