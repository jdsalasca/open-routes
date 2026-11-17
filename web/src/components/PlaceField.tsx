import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { Place } from "../types";
import { ChevronRightIcon, CloseIcon, SearchIcon } from "./Icons";

type Props = {
  id: string;
  label: string;
  tone: "origin" | "destination";
  icon: ReactNode;
  selectedLabel?: string;
  selectedHint?: string;
  placeholder: string;
  places: Place[];
  onSelect: (place: Place) => void;
  onClear: () => void;
  onSearch?: (query: string, signal?: AbortSignal) => Promise<Place[]>;
};

type Option =
  | { kind: "place"; place: Place }
  | { kind: "search"; label: string };

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const score = (place: Place, term: string) => {
  const name = normalize(place.name);
  if (name.startsWith(term)) return 0;
  if (name.split(/\s+/).some((word) => word.startsWith(term))) return 1;
  return 2;
};

export function PlaceField({
  id,
  label,
  tone,
  icon,
  selectedLabel,
  selectedHint,
  placeholder,
  places,
  onSelect,
  onClear,
  onSearch
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchController = useRef<AbortController | null>(null);
  const lastSelected = useRef(selectedLabel ?? "");
  const [query, setQuery] = useState(selectedLabel ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [remote, setRemote] = useState<Place[]>([]);
  const [remoteQuery, setRemoteQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutside);
    return () => document.removeEventListener("pointerdown", closeOnOutside);
  }, [open]);

  useEffect(() => {
    if (selectedLabel && selectedLabel !== lastSelected.current) {
      setQuery(selectedLabel);
      lastSelected.current = selectedLabel;
    } else if (!selectedLabel) {
      setQuery("");
      lastSelected.current = "";
    }
  }, [selectedLabel]);

  useEffect(() => {
    searchController.current?.abort();
    setRemote([]);
    setRemoteQuery("");
    setSearchError(null);
    setSearching(false);
  }, [query]);

  useEffect(() => () => searchController.current?.abort(), []);

  const results = useMemo(() => {
    const term = normalize(query.trim());
    const sameAsSelected = Boolean(selectedLabel && query === selectedLabel);
    if (!term || sameAsSelected) return places.slice(0, 7);
    return places
      .filter((place) =>
        normalize([place.name, place.type, ...place.aliases].join(" ")).includes(term)
      )
      .sort(
        (a, b) => score(a, term) - score(b, term) || a.name.localeCompare(b.name, "es")
      )
      .slice(0, 7);
  }, [places, query, selectedLabel]);

  const remoteResults = useMemo(() => {
    const localNames = new Set(results.map((place) => normalize(place.name)));
    return remote.filter((place) => !localNames.has(normalize(place.name)));
  }, [remote, results]);

  const term = query.trim();
  const sameAsSelected = Boolean(selectedLabel && query === selectedLabel);
  const canSearch = Boolean(onSearch && term.length >= 3 && !sameAsSelected);
  const searchActionLabel =
    remoteQuery === term && term
      ? `Buscar otra vez «${term}» en el mapa`
      : `Buscar «${term}» en el mapa`;

  const options = useMemo<Option[]>(() => {
    const list: Option[] = [
      ...results.map((place) => ({ kind: "place" as const, place })),
      ...remoteResults.map((place) => ({ kind: "place" as const, place }))
    ];
    if (canSearch && !searching) {
      list.push({ kind: "search", label: searchActionLabel });
    }
    return list;
  }, [results, remoteResults, canSearch, searching, searchActionLabel]);

  useEffect(() => {
    setActive((current) => (current >= options.length ? -1 : current));
  }, [options.length]);

  const choose = (place: Place) => {
    searchController.current?.abort();
    lastSelected.current = place.name;
    setQuery(place.name);
    setOpen(false);
    onSelect(place);
  };

  const chooseOption = (option: Option) => {
    if (option.kind === "place") {
      choose(option.place);
    } else {
      void runSearch();
    }
  };

  async function runSearch() {
    if (!onSearch || term.length < 3) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setOpen(true);
    setSearching(true);
    setSearchError(null);
    try {
      const found = await onSearch(term, controller.signal);
      if (controller.signal.aborted) return;
      setRemote(found);
      setRemoteQuery(term);
      setActive(found.length ? results.length : -1);
    } catch (error) {
      if (controller.signal.aborted) return;
      setRemote([]);
      setRemoteQuery(term);
      setSearchError(
        error instanceof Error && error.message.includes("502")
          ? "El buscador de direcciones no está disponible ahora."
          : "No pudimos buscar en el mapa. Revisa tu conexión e inténtalo de nuevo."
      );
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) =>
        index < 0 ? 0 : Math.min(index + 1, Math.max(options.length - 1, 0))
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((index) =>
        index < 0 ? Math.max(options.length - 1, 0) : Math.max(index - 1, 0)
      );
    } else if (event.key === "Enter") {
      if (open && active >= 0 && options[active]) {
        event.preventDefault();
        chooseOption(options[active]);
      } else if (canSearch && !searching) {
        event.preventDefault();
        void runSearch();
      }
    } else if (event.key === "Escape") {
      searchController.current?.abort();
      setOpen(false);
    }
  };

  const activeOption = open && active >= 0 ? options[active] : null;
  const activeId = activeOption
    ? activeOption.kind === "place"
      ? `${id}-option-${activeOption.place.id}`
      : `${id}-action-search`
    : undefined;
  const showPanel = open && (options.length > 0 || searching || Boolean(searchError));

  return (
    <div ref={rootRef} className={`place-field place-field--${tone}`}>
      <div className="place-field__label">
        <label htmlFor={id}>{label}</label>
        {selectedHint && <span>{selectedHint}</span>}
      </div>
      <div className="place-field__box">
        {icon}
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={showPanel ? `${id}-listbox` : undefined}
          aria-activedescendant={activeId}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={(event) => {
            setOpen(true);
            setActive(-1);
            if (event.currentTarget.value === selectedLabel) event.currentTarget.select();
          }}
          onBlur={() => {
            setOpen(false);
            setQuery(selectedLabel ?? "");
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        {query && (
          <button
            type="button"
            className="place-field__clear"
            aria-label={`Borrar ${label.toLowerCase()}`}
            onClick={() => {
              searchController.current?.abort();
              setQuery("");
              lastSelected.current = "";
              setOpen(false);
              onClear();
            }}
          >
            <CloseIcon size={14} />
          </button>
        )}
      </div>
      {showPanel && (
        <ul
          className="place-list"
          id={`${id}-listbox`}
          role="listbox"
          aria-label={`Sugerencias de ${label.toLowerCase()}`}
        >
          {results.length > 0 && remoteResults.length > 0 && (
            <li className="place-list__label" role="presentation">
              Lugares de la ciudad
            </li>
          )}
          {results.map((place, index) => (
            <li
              key={place.id}
              id={`${id}-option-${place.id}`}
              role="option"
              aria-selected={index === active}
              className={`place-option${index === active ? " place-option--active" : ""}`}
              onPointerDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(place)}
            >
              <span className="place-option__name">{place.name}</span>
              <span className="place-option__type">{place.type}</span>
              <ChevronRightIcon size={14} className="place-option__chevron" />
            </li>
          ))}
          {remoteResults.length > 0 && (
            <li className="place-list__label" role="presentation">
              Barrios, direcciones y sitios del mapa
            </li>
          )}
          {remoteResults.map((place, index) => {
            const optionIndex = results.length + index;
            return (
              <li
                key={place.id}
                id={`${id}-option-${place.id}`}
                role="option"
                aria-selected={optionIndex === active}
                className={`place-option${optionIndex === active ? " place-option--active" : ""}`}
                onPointerDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(optionIndex)}
                onClick={() => choose(place)}
              >
                <span className="place-option__name">{place.name}</span>
                <span className="place-option__type">{place.type}</span>
                <ChevronRightIcon size={14} className="place-option__chevron" />
              </li>
            );
          })}
          {searching && (
            <li className="place-status" role="status">
              <span className="place-status__spinner" aria-hidden="true" />
              Buscando en el mapa…
            </li>
          )}
          {searchError && !searching && (
            <li className="place-status place-status--error" role="status">
              {searchError}
            </li>
          )}
          {remoteQuery === term && !searching && !searchError && remoteResults.length === 0 && (
            <li className="place-status" role="status">
              OpenStreetMap no encontró «{term}».
            </li>
          )}
          {canSearch && !searching && (
            <li
              id={`${id}-action-search`}
              role="option"
              aria-selected={options.length - 1 === active}
              className={`place-option place-option--search${
                options.length - 1 === active ? " place-option--active" : ""
              }`}
              onPointerDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(options.length - 1)}
              onClick={() => void runSearch()}
            >
              <SearchIcon size={14} className="place-option__search-icon" />
              <span className="place-option__name">{searchActionLabel}</span>
              <span className="place-option__type">OpenStreetMap</span>
            </li>
          )}
          {options.length === 0 && !searching && !searchError && (
            <li className="place-status" role="status">
              No encontramos ese lugar. Prueba con un barrio o una dirección.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
