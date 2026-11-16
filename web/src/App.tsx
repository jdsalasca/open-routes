import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { api } from "./api";
import { AboutDialog } from "./components/AboutDialog";
import {
  BusIcon,
  ChevronRightIcon,
  CloseIcon,
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

const placeScore = (place: Place, term: string) => {
  const name = normalize(place.name);
  if (name.startsWith(term)) return 0;
  if (name.split(/\s+/).some((word) => word.startsWith(term))) return 1;
  return 2;
};

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
  const [nearby, setNearby] = useState<NearbyRoute[] | null>(null);
  const [nearMode, setNearMode] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [placeQuery, setPlaceQuery] = useState("");
  const [placeOpen, setPlaceOpen] = useState(false);
  const [activePlace, setActivePlace] = useState(0);
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
        setNearby(null);
        setNearMode(false);
        setOrigin(null);
        setPlaceQuery("");
        setPlaceOpen(false);
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

  useEffect(() => {
    if (!nearMode || !nearby) return;
    if (!window.matchMedia("(max-width: 900px)").matches) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      listHeadRef.current?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [nearMode, nearby]);

  const nearbyById = useMemo(
    () => new Map((nearby ?? []).map((hit) => [hit.id, hit])),
    [nearby]
  );

  const placeResults = useMemo(() => {
    if (!city) return [];
    const allPlaces = city.places ?? [];
    const term = normalize(placeQuery.trim());
    if (!term) return allPlaces.slice(0, 7);
    return allPlaces
      .filter((place) =>
        normalize([place.name, place.type, ...place.aliases].join(" ")).includes(term)
      )
      .sort(
        (a, b) =>
          placeScore(a, term) - placeScore(b, term) ||
          a.name.localeCompare(b.name, "es")
      )
      .slice(0, 7);
  }, [city, placeQuery]);

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
    nearbyAbort.current?.abort();
    setNearMode(false);
    setNearby(null);
    setNearbyError(null);
    setNearbyLoading(false);
    setOrigin(null);
    setSelectedId(null);
    setQuery("");
    setPlaceQuery("");
    setPlaceOpen(false);
  }, []);

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

  const handleLocate = useCallback(async () => {
    if (!city) return;
    setSelectedId(null);
    setActiveDirection(0);
    setPlaceQuery("");
    setPlaceOpen(false);
    const point = await locate();
    if (!point) return;
    setOrigin({ kind: "gps", ...point, label: "Tu ubicación" });
    await loadNearby(point, city.slug, GPS_RADIUS);
  }, [city, locate, loadNearby]);

  const selectPlace = useCallback(
    (place: Place) => {
      if (!city) return;
      setOrigin({
        kind: "place",
        lat: place.lat,
        lng: place.lng,
        label: place.name,
        type: place.type
      });
      setSelectedId(null);
      setActiveDirection(0);
      setPlaceQuery("");
      setPlaceOpen(false);
      setActivePlace(0);
      void loadNearby({ lat: place.lat, lng: place.lng }, city.slug, PLACE_RADIUS);
    },
    [city, loadNearby]
  );

  const retryNearby = useCallback(() => {
    if (!origin || !city) return;
    void loadNearby(origin, city.slug, origin.kind === "place" ? PLACE_RADIUS : GPS_RADIUS);
  }, [city, origin, loadNearby]);

  const handlePlaceKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setPlaceOpen(true);
      setActivePlace((index) => Math.min(index + 1, Math.max(placeResults.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setPlaceOpen(true);
      setActivePlace((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && placeOpen && placeResults[activePlace]) {
      event.preventDefault();
      selectPlace(placeResults[activePlace]);
    } else if (event.key === "Escape") {
      setPlaceOpen(false);
    }
  };

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
  const originRadius = origin?.kind === "place" ? PLACE_RADIUS : GPS_RADIUS;
  const listNote = query.trim()
    ? `${visibleRoutes.length} resultados`
    : origin
      ? origin.kind === "place"
        ? "a 500 m"
        : "radio de 1 km"
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

      <main className="layout">
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
                  Escribe un barrio o lugar para ver qué rutas pasan por ahí, o usa tu ubicación.
                </p>

                <div className="origin-search">
                  <label className="origin-search__label" htmlFor="place-search">
                    ¿Desde dónde sales?
                  </label>
                  <div className="origin-search__box">
                    <PinIcon size={16} />
                    <input
                      id="place-search"
                      type="text"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={placeOpen}
                      aria-controls="place-listbox"
                      aria-activedescendant={
                        placeOpen && placeResults[activePlace]
                          ? `place-option-${placeResults[activePlace].id}`
                          : undefined
                      }
                      placeholder="Escandinavo, Plaza de Bolívar, UPTC…"
                      value={placeQuery}
                      onChange={(event) => {
                        setPlaceQuery(event.target.value);
                        setPlaceOpen(true);
                        setActivePlace(0);
                      }}
                      onFocus={() => {
                        setPlaceOpen(true);
                        setActivePlace(0);
                      }}
                      onBlur={() => setPlaceOpen(false)}
                      onKeyDown={handlePlaceKeyDown}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {placeQuery && (
                      <button
                        type="button"
                        className="origin-search__clear"
                        aria-label="Borrar búsqueda de lugar"
                        onClick={() => {
                          setPlaceQuery("");
                          setActivePlace(0);
                        }}
                      >
                        <CloseIcon size={14} />
                      </button>
                    )}
                  </div>
                  {placeOpen && (
                    <ul className="place-list" id="place-listbox" role="listbox" aria-label="Lugares">
                      {placeResults.map((place, index) => (
                        <li
                          key={place.id}
                          id={`place-option-${place.id}`}
                          role="option"
                          aria-selected={index === activePlace}
                          className={`place-option${index === activePlace ? " place-option--active" : ""}`}
                          onPointerDown={(event) => event.preventDefault()}
                          onMouseEnter={() => setActivePlace(index)}
                          onClick={() => selectPlace(place)}
                        >
                          <span className="place-option__name">{place.name}</span>
                          <span className="place-option__type">{place.type}</span>
                          <ChevronRightIcon size={14} className="place-option__chevron" />
                        </li>
                      ))}
                      {placeResults.length === 0 && (
                        <li className="place-empty">
                          No encontramos ese lugar. Prueba con un barrio o usa tu ubicación.
                        </li>
                      )}
                    </ul>
                  )}
                </div>

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
                        ? "Buscando rutas…"
                        : origin?.kind === "gps"
                          ? "Actualizar mi ubicación"
                          : "Usar mi ubicación"}
                  </button>
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

              {origin && (
                <div className="origin-banner">
                  <span className="origin-banner__icon">
                    <PinIcon size={15} />
                  </span>
                  <div className="origin-banner__body">
                    <span className="origin-banner__label">Origen</span>
                    <strong>{origin.label}</strong>
                    <span className="origin-banner__meta">
                      {origin.kind === "gps" ? "Ubicación actual" : origin.type} ·{" "}
                      {origin.kind === "place" ? "500 m" : "1 km"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="origin-banner__clear"
                    onClick={showAll}
                    aria-label="Quitar el origen"
                  >
                    Quitar
                  </button>
                </div>
              )}

              {nearbyLoading && (
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
                <h2 title={origin?.label}>
                  {origin
                    ? origin.kind === "gps"
                      ? "Rutas cerca de ti"
                      : `Rutas cerca de ${origin.label}`
                    : "Todas las rutas"}
                </h2>
                <span className="list-head__note">{listNote}</span>
              </div>

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
                          <span className="route-card__distance">{distanceLabel(hit.distanceMeters)}</span>
                        )}
                        <ChevronRightIcon className="route-card__chevron" />
                      </span>
                    </button>
                  );
                })}
                {visibleRoutes.length === 0 && query.trim() && (
                  <p className="list-empty">
                    No encontramos rutas para «{query.trim()}». Prueba con otra vía o con el código
                    de la ruta.
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
            origin={origin}
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
              : nearMode && nearby
                ? `${nearby.length} rutas cerca de ${origin?.label ?? "tu ubicación"}.`
                : "")}
      </p>

      <AboutDialog dialogRef={aboutRef} city={city} />
    </div>
  );
}
