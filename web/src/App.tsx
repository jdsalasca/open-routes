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
  NewsIcon,
  PinIcon,
  SearchIcon,
  SwapIcon,
  TicketIcon
} from "./components/Icons";
import { MapView } from "./components/MapView";
import { NewsDialog } from "./components/NewsDialog";
import { PlaceField } from "./components/PlaceField";
import { PointInspector } from "./components/PointInspector";
import { RouteDetail } from "./components/RouteDetail";
import { TripDetail } from "./components/TripDetail";
import { useGeolocation } from "./hooks/useGeolocation";
import { distanceMeters, dayKeyInTimeZone, findDirectTrips, findNearbyRoutes, findSplitRoutes } from "./planner";
import type { TripOption } from "./planner";
import { readTripRoutes, tripCacheKey, writeTripRoutes } from "./tripCache";
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

const initialCitySlug = () => {
  const fromUrl = new URLSearchParams(window.location.search).get("city");
  if (fromUrl) return fromUrl;
  try {
    return window.localStorage.getItem("open-routes-city");
  } catch {
    return null;
  }
};

export default function App() {
  const aboutRef = useRef<HTMLDialogElement>(null);
  const newsRef = useRef<HTMLDialogElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const initialSlug = useRef(initialCitySlug());
  const autoDetectTried = useRef(false);
  const listHeadRef = useRef<HTMLDivElement>(null);
  const routeRefs = useRef(new Map<string, HTMLButtonElement>());
  const tripRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastTripKey = useRef<string | null>(null);
  const returnFocusToTrip = useRef(false);
  const locateToken = useRef(0);
  const [cities, setCities] = useState<CitySummary[] | null>(null);
  const [slug, setSlug] = useState<string | null>(initialCitySlug);
  const [city, setCity] = useState<City | null>(null);
  const [boot, setBoot] = useState<"loading" | "ready" | "error">("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDirection, setActiveDirection] = useState(0);
  const [activeTrip, setActiveTrip] = useState<TripOption | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [nearby, setNearby] = useState<NearbyRoute[] | null>(null);
  const [nearMode, setNearMode] = useState(false);
  const [query, setQuery] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  const [newsOpen, setNewsOpen] = useState(false);
  const [inspectPoint, setInspectPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [extraRoutes, setExtraRoutes] = useState<Route[]>([]);
  const [tripRoutesLoading, setTripRoutesLoading] = useState(false);
  const [tripRoutesError, setTripRoutesError] = useState<string | null>(null);
  const [detectingCity, setDetectingCity] = useState(false);
  const [cityDetectError, setCityDetectError] = useState<string | null>(null);
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
    locateToken.current += 1;
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
        setInspectPoint(null);
        setExtraRoutes([]);
        setTripRoutesError(null);
        setTripRoutesLoading(false);
        document.title = `open-routes · Rutas de ${data.name}`;
        document
          .querySelector('meta[name="description"]')
          ?.setAttribute(
            "content",
            `Rutas de transporte público de ${data.name}, ${data.department}: ubícate, consulta recorridos, horarios y tarifas.`
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setBoot("error");
      });
    return () => controller.abort();
  }, [slug]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const routePool = useMemo(() => {
    if (!city) return [];
    const seen = new Set(city.routes.map((route) => route.id));
    return [...city.routes, ...extraRoutes.filter((route) => !seen.has(route.id))];
  }, [city, extraRoutes]);

  const selected = useMemo(
    () => routePool.find((route) => route.id === selectedId) ?? null,
    [routePool, selectedId]
  );

  useEffect(() => {
    sidebarRef.current?.scrollTo({ top: 0 });
  }, [selectedId, activeTrip]);

  const places = city?.places ?? [];

  const changeCity = useCallback((next: string) => {
    setSlug(next);
    setInspectPoint(null);
    const url = new URL(window.location.href);
    url.searchParams.set("city", next);
    window.history.replaceState(null, "", url);
    try {
      window.localStorage.setItem("open-routes-city", next);
    } catch {
      // El navegador puede bloquear el almacenamiento; la URL ya conserva la elección.
    }
  }, []);

  const searchPlaces = useCallback(
    (term: string, signal?: AbortSignal) =>
      city ? api.searchPlaces(city.slug, term, signal) : Promise.resolve([]),
    [city]
  );

  const detectCity = useCallback(() => {
    if (!cities || cities.length === 0) return;
    if (!navigator.geolocation) {
      setCityDetectError("Tu navegador no permite detectar la ciudad.");
      return;
    }
    setDetectingCity(true);
    setCityDetectError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDetectingCity(false);
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        const nearest = cities
          .map((item) => ({ item, meters: distanceMeters(point, item.center) }))
          .sort((a, b) => a.meters - b.meters)[0];
        if (nearest && nearest.meters <= 80_000) {
          changeCity(nearest.item.slug);
        } else {
          setCityDetectError("Aún no tenemos datos para tu ciudad.");
        }
      },
      () => {
        setDetectingCity(false);
        setCityDetectError("No pudimos obtener tu ubicación. Elige la ciudad en la lista.");
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 600_000 }
    );
  }, [cities, changeCity]);

  useEffect(() => {
    if (autoDetectTried.current || initialSlug.current || !cities || cities.length < 2) {
      return;
    }
    autoDetectTried.current = true;
    if (!navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: "geolocation" })
      .then((permission) => {
        if (permission.state === "granted") detectCity();
      })
      .catch(() => {
        // El botón de detectar ciudad sigue disponible.
      });
  }, [cities, detectCity]);

  const nearbyById = useMemo(
    () => new Map((nearby ?? []).map((hit) => [hit.id, hit])),
    [nearby]
  );

  const inspectRoutes = useMemo(
    () => (inspectPoint && city ? findNearbyRoutes(inspectPoint, 150, routePool) : []),
    [inspectPoint, routePool]
  );

  const inspectAt = useCallback((lat: number, lng: number) => {
    setInspectPoint({ lat, lng });
  }, []);

  const closeInspector = useCallback(() => setInspectPoint(null), []);

  const samePlace = Boolean(
    origin && destination && distanceMeters(origin, destination) < 30
  );

  useEffect(() => {
    if (!city?.partial || !origin || !destination || samePlace) {
      setExtraRoutes([]);
      setTripRoutesLoading(false);
      setTripRoutesError(null);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setExtraRoutes([]);
    setTripRoutesLoading(true);
    setTripRoutesError(null);
    const key = tripCacheKey(city.slug, origin, destination);
    void (async () => {
      const cached = await readTripRoutes(key);
      if (cancelled) return;
      if (cached) {
        setExtraRoutes(cached);
        setTripRoutesLoading(false);
        return;
      }
      try {
        const routes = await api.tripRoutes(
          city.slug,
          { lat: origin.lat, lng: origin.lng },
          { lat: destination.lat, lng: destination.lng },
          controller.signal
        );
        if (cancelled) return;
        setExtraRoutes(routes);
        await writeTripRoutes(key, routes);
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setTripRoutesError(
            "No pudimos cargar todas las rutas para este viaje. Mostramos las principales."
          );
        }
      } finally {
        if (!cancelled) setTripRoutesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [city, origin, destination, samePlace]);

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

  const timeZone = city?.timezone ?? "America/Bogota";
  const dayKey = useMemo(() => dayKeyInTimeZone(new Date(clock), timeZone), [clock, timeZone]);

  const allTripOptions = useMemo(() => {
    if (!city || !origin || !destination || samePlace) return [];
    return findDirectTrips(origin, destination, routePool, {
      timeZone,
      now: new Date(clock)
    });
    // dayKey obliga a recalcular al cruzar la medianoche en la ciudad.
  }, [city, origin, destination, samePlace, routePool, timeZone, dayKey]);

  const tripOptions = useMemo(() => allTripOptions.slice(0, 4), [allTripOptions]);
  const directRouteIds = useMemo(
    () => new Set(allTripOptions.map((option) => option.route.id)),
    [allTripOptions]
  );

  const tripRouteIds = useMemo(
    () => allTripOptions.map((option) => option.route.id),
    [allTripOptions]
  );

  const splitRoutes = useMemo(() => {
    if (!city || !origin || !destination || samePlace) return [];
    return findSplitRoutes(origin, destination, routePool)
      .filter((hit) => !directRouteIds.has(hit.route.id))
      .slice(0, 3);
  }, [city, origin, destination, samePlace, directRouteIds, routePool]);

  const tripMode = Boolean(origin && destination);
  const destinationOnly = Boolean(!origin && destination);
  const canSwap = origin?.kind === "place" && destination !== null;
  const originRadius = origin?.kind === "place" ? PLACE_RADIUS : GPS_RADIUS;
  const detailOpen = Boolean(selected || activeTrip);

  const clearNearby = useCallback(() => {
    setNearby(null);
    setNearMode(false);
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
  }, [nearMode, nearby, tripMode, origin, destination, selectedId, activeTrip]);

  const handleSelect = useCallback(
    (id: string) => {
      const matchingTrip = tripOptions.find((option) => option.route.id === id);
      if (matchingTrip) {
        lastTripKey.current = `${matchingTrip.route.id}-${matchingTrip.directionIndex}`;
        returnFocusToTrip.current = true;
      } else {
        returnFocusToTrip.current = false;
      }
      setSelectedId(id);
      setActiveDirection(0);
      setActiveTrip(null);
      setInspectPoint(null);
    },
    [tripOptions]
  );

  const showAll = useCallback(() => {
    locateToken.current += 1;
    returnFocusToTrip.current = false;
    clearNearby();
    setOrigin(null);
    setDestination(null);
    setActiveTrip(null);
    setSelectedId(null);
    setQuery("");
    setInspectPoint(null);
    sidebarRef.current?.scrollTo({ top: 0 });
  }, [clearNearby]);

  const loadNearby = useCallback(
    (point: { lat: number; lng: number }, radius: number) => {
      if (!city) return;
      setNearby(findNearbyRoutes(point, radius, city.routes));
      setNearMode(true);
      setQuery("");
    },
    [city]
  );

  const selectOriginPlace = useCallback(
    (place: Place) => {
      locateToken.current += 1;
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
      setInspectPoint(null);
      if (destination) {
        clearNearby();
      } else {
        loadNearby({ lat: place.lat, lng: place.lng }, PLACE_RADIUS);
      }
    },
    [destination, clearNearby, loadNearby]
  );

  const selectDestination = useCallback(
    (place: Place) => {
      locateToken.current += 1;
      setDestination(place);
      setActiveTrip(null);
      setSelectedId(null);
      setQuery("");
      setInspectPoint(null);
      clearNearby();
    },
    [clearNearby]
  );

  const clearOrigin = useCallback(() => {
    locateToken.current += 1;
    setOrigin(null);
    setActiveTrip(null);
    clearNearby();
  }, [clearNearby]);

  const clearDestination = useCallback(() => {
    locateToken.current += 1;
    setDestination(null);
    setActiveTrip(null);
    if (origin) {
      loadNearby(origin, origin.kind === "place" ? PLACE_RADIUS : GPS_RADIUS);
    } else {
      clearNearby();
    }
  }, [origin, clearNearby, loadNearby]);

  const swapEnds = useCallback(() => {
    if (!origin || origin.kind !== "place" || !destination) return;
    locateToken.current += 1;
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
    setInspectPoint(null);
    clearNearby();
  }, [origin, destination, clearNearby]);

  const handleLocate = useCallback(async () => {
    if (!city) return;
    const token = ++locateToken.current;
    setSelectedId(null);
    setInspectPoint(null);
    const point = await locate();
    if (token !== locateToken.current) return;
    if (!point) return;
    setOrigin({ kind: "gps", ...point, label: "Tu ubicación" });
    setActiveTrip(null);
    if (destination) {
      clearNearby();
    } else {
      loadNearby(point, GPS_RADIUS);
    }
  }, [city, destination, locate, clearNearby, loadNearby]);

  const openTrip = useCallback((trip: TripOption, key: string) => {
    lastTripKey.current = key;
    returnFocusToTrip.current = false;
    setActiveTrip(trip);
    setSelectedId(null);
    setActiveDirection(trip.directionIndex);
  }, []);

  const closeTrip = useCallback(() => {
    const key = lastTripKey.current;
    returnFocusToTrip.current = false;
    setActiveTrip(null);
    requestAnimationFrame(() => {
      if (key) tripRefs.current.get(key)?.focus();
    });
  }, []);

  const openRouteFromTrip = useCallback(() => {
    if (!activeTrip) return;
    returnFocusToTrip.current = true;
    lastTripKey.current = `${activeTrip.route.id}-${activeTrip.directionIndex}`;
    setSelectedId(activeTrip.route.id);
    setActiveDirection(activeTrip.directionIndex);
    setActiveTrip(null);
  }, [activeTrip]);

  const handleBack = useCallback(() => {
    const id = selectedId;
    const key = lastTripKey.current;
    const focusTrip = returnFocusToTrip.current;
    returnFocusToTrip.current = false;
    setSelectedId(null);
    setActiveDirection(0);
    requestAnimationFrame(() => {
      if (focusTrip && key) tripRefs.current.get(key)?.focus();
      else if (id) routeRefs.current.get(id)?.focus();
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
      : tripRoutesLoading
        ? "buscando rutas"
        : allTripOptions.length
          ? `${tripOptions.length}${
              allTripOptions.length > tripOptions.length ? ` de ${allTripOptions.length}` : ""
            } ${allTripOptions.length === 1 ? "ruta directa" : "rutas directas"}`
          : "sin ruta directa"
    : destinationOnly
      ? "destino elegido"
      : query.trim()
        ? `${visibleRoutes.length} resultados`
        : origin
          ? origin.kind === "place"
            ? "a 500 m"
            : "radio de 1 km"
          : `${city.routes.length}${city.partial ? " principales" : ""} rutas`;

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

        <div className="city-switch">
          {cities && cities.length > 1 ? (
            <label className="city-pill">
              <PinIcon size={14} />
              <span className="visually-hidden">Ciudad</span>
              <select value={city.slug} onChange={(event) => changeCity(event.target.value)}>
                {cities.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}, {item.department}
                    {item.routeCount > 0 ? ` · ${item.routeCount} rutas` : ""}
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
          {cities && cities.length > 1 && (
            <button
              type="button"
              className="icon-button city-detect"
              aria-label="Detectar mi ciudad"
              title="Detectar mi ciudad"
              disabled={detectingCity}
              onClick={detectCity}
            >
              {detectingCity ? (
                <span className="city-detect__spinner" aria-hidden="true" />
              ) : (
                <LocateIcon size={16} />
              )}
            </button>
          )}
        </div>

        <div className="topbar__actions">
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setNewsOpen(true);
              newsRef.current?.showModal();
            }}
          >
            Movilidad
          </button>
          <button
            type="button"
            className="icon-button news-icon"
            aria-label="Movilidad y noticias"
            onClick={() => {
              setNewsOpen(true);
              newsRef.current?.showModal();
            }}
          >
            <NewsIcon size={18} />
          </button>
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
            className="icon-button github-link"
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
              onBack={closeTrip}
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
                    disabled={status === "locating"}
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
                    placeholder="Barrio, sitio o dirección…"
                    places={places}
                    onSelect={selectOriginPlace}
                    onClear={clearOrigin}
                    onSearch={searchPlaces}
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
                    placeholder="Barrio, dirección o sitio (opcional)"
                    places={places}
                    onSelect={selectDestination}
                    onClear={clearDestination}
                    onSearch={searchPlaces}
                  />
                </div>

                <p className="hero__privacy">
                  La cercanía se calcula en tu navegador. Tu ubicación no se envía; las
                  direcciones que buscas se consultan en OpenStreetMap.
                </p>
                <div className="hero__meta">
                  <span className="meta-chip">
                    <BusIcon size={13} /> {city.routes.length} rutas
                    {city.partial ? " principales" : ""}
                  </span>
                  {city.fare.day > 0 && (
                    <span className="meta-chip">
                      <TicketIcon size={13} /> Pasaje {money(city.fare.day)}
                    </span>
                  )}
                </div>
              </section>

              {city.partial && (
                <div className="notice notice--info">
                  <InfoIcon />
                  <span>
                    Mapa con {city.routes.length} rutas principales de {city.name}. Al elegir
                    origen y destino cargamos solo las rutas que te sirven.
                  </span>
                </div>
              )}

              {cityDetectError && (
                <div className="notice notice--info" role="status">
                  <InfoIcon />
                  <span>{cityDetectError}</span>
                </div>
              )}

              {samePlace && (
                <div className="notice notice--info">
                  <InfoIcon />
                  <span>El origen y el destino son el mismo lugar. Elige otro destino.</span>
                </div>
              )}

              {tripMode && tripRoutesLoading && (
                <div className="notice notice--info" role="status">
                  <InfoIcon />
                  <span>Buscando las rutas que te sirven en {city.name}…</span>
                </div>
              )}

              {tripMode && tripRoutesError && (
                <div className="notice" role="status">
                  <InfoIcon />
                  <span>{tripRoutesError}</span>
                </div>
              )}

              {tripMode && !samePlace && !tripRoutesLoading && tripOptions.length === 0 && (
                <div className="notice notice--info">
                  <InfoIcon />
                  <span>
                    No encontramos una ruta directa verificada entre {origin?.label} y{" "}
                    {destination?.name}.{" "}
                    {splitRoutes.length > 0 &&
                      (splitRoutes.length === 1
                        ? `La ruta ${splitRoutes[0].route.code} tiene el trazado dividido en el mapa; podría servir, pero no lo confirmamos. `
                        : `Las rutas ${splitRoutes
                            .map((hit) => hit.route.code)
                            .join(", ")} tienen el trazado dividido en el mapa; podrían servir, pero no lo confirmamos. `)}
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

              {geoError && (
                <div className="notice" role="status">
                  <InfoIcon />
                  <span>{geoError}</span>
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
                <>
                  <div className="trip-list">
                  {!samePlace &&
                    tripOptions.map((option) => {
                      const key = `${option.route.id}-${option.directionIndex}`;
                      return (
                        <button
                          key={key}
                          ref={(element) => {
                            if (element) tripRefs.current.set(key, element);
                            else tripRefs.current.delete(key);
                          }}
                          type="button"
                          className="trip-card"
                          style={{ "--route-color": option.route.color } as CSSProperties}
                          onClick={() => openTrip(option, key)}
                        >
                          <span className="trip-card__code" aria-hidden="true">
                            {option.route.code}
                          </span>
                          <span className="trip-card__body">
                            <span className="trip-card__name">{option.route.name}</span>
                            <span className="trip-card__meta">
                              <strong>
                                ≈ {Math.round(option.totalMinutes)} min
                                {option.waitKnown ? "" : " + espera"}
                              </strong>
                              <span>
                                ≈ {distanceLabel(option.walkToMeters + option.walkFromMeters)} a pie
                              </span>
                              <span>{Math.round(option.rideMinutes)} min en bus</span>
                              {option.outsideHours && (
                                <span className="trip-card__warn">fuera de horario</span>
                              )}
                            </span>
                            <span className="trip-card__hint">
                              Sube cerca de {origin?.label} · baja cerca de {destination?.name}
                            </span>
                          </span>
                          <span className="trip-card__side">
                            <ChevronRightIcon className="route-card__chevron" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {tripOptions.length > 0 && splitRoutes.length > 0 && !tripRoutesLoading && (
                    <p className="list-footnote">
                      No evaluamos {splitRoutes.map((hit) => hit.route.code).join(", ")}: su trazado
                      está dividido en el mapa y no permite confirmar una ruta directa.
                    </p>
                  )}
                </>
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
          <p id="map-instructions" className="visually-hidden">
            El mapa es una ayuda visual. Toca un punto para ver qué rutas pasan cerca. Usa la
            lista de rutas y las opciones de viaje para seleccionar recorridos con el teclado;
            los pasos se describen en texto al abrir una opción.
          </p>
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
            inspectPoint={inspectPoint}
            onSelect={handleSelect}
            onInspectPoint={inspectAt}
          />
          {inspectPoint && (
            <PointInspector
              routes={inspectRoutes}
              onClose={closeInspector}
              onSelect={handleSelect}
            />
          )}
          {!inspectPoint && !selected && !activeTrip && (
            <p className="map-hint">Toca el mapa y descubre qué rutas pasan por ese punto.</p>
          )}
        </div>
      </main>

      <p className="visually-hidden" aria-live="polite">
        {status === "locating"
          ? "Buscando tu ubicación."
          : geoError ??
            (tripMode
              ? samePlace
                ? "El origen y el destino son el mismo lugar."
                : `${tripOptions.length} rutas directas encontradas.`
              : nearMode && nearby
                ? `${nearby.length} rutas cerca de ${origin?.label ?? "tu ubicación"}.`
                : "")}
      </p>

      <AboutDialog dialogRef={aboutRef} city={city} />
      <NewsDialog
        dialogRef={newsRef}
        city={city}
        active={newsOpen}
        onClose={() => setNewsOpen(false)}
      />
    </div>
  );
}
