import type { RefObject } from "react";
import type { City, NewsItem } from "../types";
import { AlertIcon, CloseIcon, ExternalLinkIcon } from "./Icons";

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  city: City;
  items: NewsItem[];
};

export function AlertsDialog({ dialogRef, city, items }: Props) {
  const dateLabel = (value: string | null) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: city.timezone
    }).format(new Date(value));
  };

  return (
    <dialog
      ref={dialogRef}
      className="about news"
      aria-labelledby="alerts-title"
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="about__top">
        <div>
          <span className="news__kicker">
            <AlertIcon size={13} /> Últimas 48 h
          </span>
          <h2 id="alerts-title">Avisos de movilidad en {city.name}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Cerrar avisos"
          onClick={() => dialogRef.current?.close()}
        >
          <CloseIcon />
        </button>
      </div>

      <p>
        Cierres, desvíos, manifestaciones y obras publicados por medios locales en las últimas 48
        horas. Cada nota abre en su medio original.
      </p>

      {items.length === 0 ? (
        <div className="news__status" role="status">
          No hay avisos de movilidad en las últimas 48 horas para {city.name}.
        </div>
      ) : (
        <ul className="news__list">
          {items.map((item) => (
            <li key={item.url}>
              <a href={item.url} target="_blank" rel="noreferrer">
                <span className="news__title">{item.title}</span>
                <span className="news__meta">
                  {item.source}
                  {item.publishedAt ? ` · ${dateLabel(item.publishedAt)}` : ""}
                  <ExternalLinkIcon size={10} />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      <p className="news__note">
        Titulares de prensa, no avisos oficiales del operador. Confirma el estado de la vía antes de
        salir. Los enlaces conservan el crédito de su medio.
      </p>
    </dialog>
  );
}
