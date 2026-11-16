import { useEffect } from "react";
import type { CSSProperties } from "react";
import type { NearbyRoute } from "../types";
import { CloseIcon, PinIcon } from "./Icons";

type Props = {
  routes: NearbyRoute[];
  onClose: () => void;
  onSelect: (id: string) => void;
};

const meters = (value: number) => (value < 1000 ? `${value} m` : `${(value / 1000).toFixed(1)} km`);

export function PointInspector({ routes, onClose, onSelect }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section className="point-panel" aria-labelledby="point-panel-title">
      <header className="point-panel__top">
        <div>
          <span className="point-panel__kicker">
            <PinIcon size={12} /> Punto del mapa
          </span>
          <h2 id="point-panel-title">Rutas en este punto</h2>
          <p>
            {routes.length
              ? `${routes.length} ${routes.length === 1 ? "ruta pasa" : "rutas pasan"} a menos de 150 m`
              : "No hay rutas a menos de 150 m"}
          </p>
        </div>
        <button type="button" className="icon-button" aria-label="Cerrar rutas del punto" onClick={onClose}>
          <CloseIcon size={17} />
        </button>
      </header>

      {routes.length > 0 ? (
        <>
          <ul className="point-list">
            {routes.map((route) => (
              <li key={route.id}>
                <button
                  type="button"
                  className="point-route"
                  style={{ "--route-color": route.color } as CSSProperties}
                  onClick={() => onSelect(route.id)}
                  title={route.direction || undefined}
                >
                  <span className="point-route__dot" aria-hidden="true" />
                  <span className="point-route__code">{route.code}</span>
                  <span className="point-route__body">
                    <span className="point-route__name">{route.name}</span>
                    <span className="point-route__meta">
                      {route.type} · a {meters(route.distanceMeters)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="point-panel__foot">Elige una ruta para ver su recorrido completo.</p>
        </>
      ) : (
        <p className="point-panel__empty">
          Toca otro punto del mapa o usa tu ubicación para encontrar rutas cercanas.
        </p>
      )}

      <span className="visually-hidden" role="status">
        {routes.length
          ? `${routes.length} rutas cerca del punto elegido.`
          : "No hay rutas cerca del punto elegido."}
      </span>
    </section>
  );
}
