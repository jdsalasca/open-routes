import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { api } from "../api";
import type { City, NewsItem } from "../types";
import { CloseIcon, ExternalLinkIcon, NewsIcon } from "./Icons";

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  city: City;
  active: boolean;
  onClose: () => void;
};

export function NewsDialog({ dialogRef, city, active, onClose }: Props) {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [loadedSlug, setLoadedSlug] = useState<string | null>(null);
  const accounts = city.social ?? [];

  useEffect(() => {
    if (!active || loadedSlug === city.slug) return;
    const controller = new AbortController();
    setStatus("loading");
    api
      .news(city.slug, controller.signal)
      .then((news) => {
        setItems(news);
        setLoadedSlug(city.slug);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [active, city.slug, loadedSlug]);

  const dateLabel = (value: string | null) => {
    if (!value) return "";
    return new Intl.DateTimeFormat("es-CO", {
      day: "numeric",
      month: "short",
      timeZone: city.timezone
    }).format(new Date(value));
  };

  return (
    <dialog
      ref={dialogRef}
      className="about news"
      aria-labelledby="news-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="about__top">
        <div>
          <span className="news__kicker">
            <NewsIcon size={13} /> Movilidad
          </span>
          <h2 id="news-title">Novedades de {city.name}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Cerrar novedades"
          onClick={() => dialogRef.current?.close()}
        >
          <CloseIcon />
        </button>
      </div>

      <p>
        Titulares de movilidad, transporte y vías publicados por medios locales. Cada nota abre en
        su medio original.
      </p>

      {status === "loading" && (
        <div className="news__status" role="status">
          <span className="place-status__spinner" aria-hidden="true" />
          Buscando titulares recientes…
        </div>
      )}

      {status === "error" && (
        <div className="news__status news__status--error" role="status">
          No pudimos cargar los titulares ahora. Puedes abrir las cuentas oficiales abajo.
        </div>
      )}

      {status === "ready" && items.length === 0 && (
        <div className="news__status" role="status">
          No hay titulares recientes. Revisa las cuentas oficiales.
        </div>
      )}

      {status === "ready" && items.length > 0 && (
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

      {accounts.length > 0 && (
        <>
          <h3>Cuentas oficiales</h3>
          <ul className="news__accounts">
            {accounts.map((account) => (
              <li key={account.url}>
                <a href={account.url} target="_blank" rel="noreferrer">
                  <span>
                    <strong>{account.handle}</strong>
                    <span>{account.label}</span>
                  </span>
                  <ExternalLinkIcon size={11} />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="news__note">
        No incrustamos publicaciones de X: sus enlaces se abren en X para no cargar cookies de
        terceros en esta página. Los titulares vienen de Google News y conservan el crédito de su
        medio.
      </p>
    </dialog>
  );
}
