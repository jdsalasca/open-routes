import type { CSSProperties } from "react";
import type { Fare, Route } from "../types";
import {
  ArrowLeftIcon,
  BusIcon,
  ClockIcon,
  ExternalLinkIcon,
  PinIcon,
  TicketIcon
} from "./Icons";

type Props = {
  route: Route;
  activeDirection: number;
  onDirection: (index: number) => void;
  onBack: () => void;
  fare: Fare;
  timeZone: string;
};

const money = (value: number) =>
  "$" + new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(value);

const frequency = (value: number | null) =>
  value ? `Cada ${value} min` : "Frecuencia variable";

const minutesInZone = (now: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
};

const parseTime = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};

const nextDeparture = (
  schedule: { start: string; end: string; frequencyMin: number | null },
  timeZone: string
) => {
  if (!schedule.frequencyMin) return null;
  const now = minutesInZone(new Date(), timeZone);
  const start = parseTime(schedule.start);
  const end = parseTime(schedule.end);
  const inRange = start <= end ? now >= start && now < end : now >= start || now < end;
  if (!inRange) return { outside: true, time: "" };
  const delta = (now - start + 24 * 60) % (24 * 60);
  const next = start + Math.ceil(delta / schedule.frequencyMin) * schedule.frequencyMin;
  const minutes = next % (24 * 60);
  return {
    outside: false,
    time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
  };
};

const isSundayInZone = (now: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now) === "Sun";

export function RouteDetail({ route, activeDirection, onDirection, onBack, fare, timeZone }: Props) {
  const direction = route.directions[activeDirection] ?? route.directions[0];
  const stops = direction?.stops ?? [];
  const todaySchedule = isSundayInZone(new Date(), timeZone) ? route.sunday : route.weekday;
  const next = nextDeparture(todaySchedule, timeZone);

  return (
    <article className="detail" style={{ "--route-color": route.color } as CSSProperties}>
      <div className="detail__top">
        <button
          type="button"
          className="detail__back"
          onClick={onBack}
          aria-label="Volver a la lista de rutas"
          autoFocus
        >
          <ArrowLeftIcon />
        </button>
        <span className="detail__kicker">{route.type}</span>
      </div>

      <div className="detail__heading">
        <span className="detail__code" aria-hidden="true">
          {route.code}
        </span>
        <div>
          <h2>{route.name}</h2>
        </div>
      </div>

      <div className="detail__badges">
        <span className="meta-chip">
          <BusIcon size={13} /> {route.type}
        </span>
        <span className="meta-chip">{route.operator}</span>
        {route.circular && (
          <span
            className="meta-chip"
            title="Clasificación del operador; el trazado del mapa puede no cerrar el circuito."
          >
            Circular
          </span>
        )}
      </div>

      <h3 className="detail__section-title">
        <ClockIcon size={13} /> Horarios
      </h3>
      <div className="schedule-grid">
        <div className="schedule-card">
          <div className="schedule-card__label">Lunes a sábado</div>
          <div className="schedule-card__time">
            {route.weekday.start} – {route.weekday.end}
          </div>
          <div className="schedule-card__freq">
            <strong>{frequency(route.weekday.frequencyMin)}</strong>
          </div>
        </div>
        <div className="schedule-card">
          <div className="schedule-card__label">Domingos y festivos</div>
          <div className="schedule-card__time">
            {route.sunday.start} – {route.sunday.end}
          </div>
          <div className="schedule-card__freq">
            <strong>{frequency(route.sunday.frequencyMin)}</strong>
          </div>
        </div>
      </div>

      {next && (
        <p className="next-departure">
          {next.outside
            ? "Fuera del horario de hoy."
            : `Próxima salida aprox. ${next.time} · cada ${todaySchedule.frequencyMin} min`}
        </p>
      )}

      {route.type === "Intermunicipal" ? (
        <>
          <div className="fare">
            <span className="fare__icon">
              <TicketIcon />
            </span>
            <div>
              <div className="fare__label">Tarifa</div>
              <div className="fare__price">Por confirmar</div>
            </div>
            <div className="fare__note">Ruta intermunicipal</div>
          </div>
          <p className="fare-hint">
            La tarifa urbana de {money(fare.day)} no aplica a este recorrido. Confirma el valor con
            el operador.
          </p>
        </>
      ) : fare.day > 0 ? (
        <>
          <div className="fare">
            <span className="fare__icon">
              <TicketIcon />
            </span>
            <div>
              <div className="fare__label">Pasaje</div>
              <div className="fare__price">{money(fare.day)}</div>
            </div>
            <div className="fare__note">
              Nocturno, domingos y festivos
              <strong>{money(fare.night)}</strong>
            </div>
          </div>
          <p className="fare-hint">{fare.note}</p>
        </>
      ) : (
        <>
          <div className="fare">
            <span className="fare__icon">
              <TicketIcon />
            </span>
            <div>
              <div className="fare__label">Pasaje</div>
              <div className="fare__price">Por confirmar</div>
            </div>
          </div>
          <p className="fare-hint">{fare.note}</p>
        </>
      )}

      <h3 className="detail__section-title">
        <PinIcon size={13} /> Trayectos
      </h3>
      {route.directions.length > 1 && (
        <div className="segmented" role="group" aria-label="Elegir trayecto">
          {route.directions.map((item, index) => (
            <button
              key={item.name + index}
              type="button"
              aria-pressed={activeDirection === index}
              onClick={() => onDirection(index)}
            >
              Trazado {index + 1}
            </button>
          ))}
        </div>
      )}
      <p className="direction-name">{direction?.name}</p>

      {direction && direction.streets.length > 0 && (
        <details className="streets">
          <summary>
            Vías del recorrido <span>{direction.streets.length} vías</span>
          </summary>
          <ol>
            {direction.streets.map((street) => (
              <li key={street}>{street}</li>
            ))}
          </ol>
        </details>
      )}

      {stops.length > 0 && (
        <>
          <h3 className="detail__section-title">
            <PinIcon size={13} /> Paradas
          </h3>
          <ul className="stop-list">
            {stops.map((stop) => (
              <li key={stop.name}>
                <PinIcon size={13} /> {stop.name}
              </li>
            ))}
          </ul>
        </>
      )}

      {route.sourceUrl && (
        <a className="detail__source" href={route.sourceUrl} target="_blank" rel="noreferrer">
          Ver trazado oficial del operador <ExternalLinkIcon size={11} />
        </a>
      )}

      <p className="detail__note">
        Trazado y horarios de referencia (2026). Pueden cambiar sin aviso: confirma con el conductor
        o con la UT Mi Ruta.
      </p>
    </article>
  );
}
