import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { Place } from "../types";
import { ChevronRightIcon, CloseIcon } from "./Icons";

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
};

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
  onClear
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSelected = useRef(selectedLabel ?? "");
  const [query, setQuery] = useState(selectedLabel ?? "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

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
      lastSelected.current = "";
    }
  }, [selectedLabel]);

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
  }, [places, query]);

  const choose = (place: Place) => {
    lastSelected.current = place.name;
    setQuery(place.name);
    setOpen(false);
    onSelect(place);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && results[active]) {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

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
          aria-controls={`${id}-listbox`}
          aria-activedescendant={
            open && results[active] ? `${id}-option-${results[active].id}` : undefined
          }
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            setOpen(true);
            setActive(0);
            if (selectedLabel && next !== selectedLabel) onClear();
          }}
          onFocus={(event) => {
            setOpen(true);
            setActive(0);
            if (event.currentTarget.value === selectedLabel) event.currentTarget.select();
          }}
          onBlur={() => setOpen(false)}
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
              setQuery("");
              lastSelected.current = "";
              setOpen(true);
              onClear();
              inputRef.current?.focus();
            }}
          >
            <CloseIcon size={14} />
          </button>
        )}
      </div>
      {open && (
        <ul
          className="place-list"
          id={`${id}-listbox`}
          role="listbox"
          aria-label={`Sugerencias de ${label.toLowerCase()}`}
        >
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
          {results.length === 0 && (
            <li className="place-empty">
              No encontramos ese lugar. Prueba con un barrio o usa tu ubicación.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
