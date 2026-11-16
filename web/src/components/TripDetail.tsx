import type { CSSProperties } from "react";
import type { TripOption } from "../planner";
import { ArrowLeftIcon, BusIcon, ClockIcon, PinIcon } from "./Icons";

type Props = {
  trip: TripOption;
  originLabel: string;
  destinationLabel: string;
  onBack: () => void;
  onOpenRoute: () => void;
};

const meters = (value: number) =>
  value < 1000
    ? `${Math.max(10, Math.round(value / 10) * 10)} m`
    : `${(value / 1000).toFixed(1).replace(".", ",")} km`;

export function TripDetail({
  trip,
  originLabel,
  destinationLabel,
  onBack,
  onOpenRoute
}: Props) {
  return (
    <article className="detail trip-detail" style={{ "--route-color": trip.route.color } as CSSProperties}>
      <div className="detail__top">
        <button
          type="button"
          className="detail__back"
          onClick={onBack}
          aria-label="Volver a las opciones de viaje"
          autoFocus
        >
          <ArrowLeftIcon />
        </button>
        <span className="detail__kicker">Viaje directo</span>
      </div>

      <div className="trip-detail__heading">
        <span className="detail__code" aria-hidden="true">
          {trip.route.code}
        </span>
        <div>
          <h2>{trip.route.name}</h2>
          <p>
            {originLabel} → {destinationLabel}
          </p>
        </div>
      </div>

      <div className="trip-steps">
        <div className="trip-step">
          <span className="trip-step__num">1</span>
          <div>
            <strong>
              {trip.walkToMeters < 30
                ? `Estás sobre la ruta ${trip.route.code}`
                : `Camina ${meters(trip.walkToMeters)}`}
            </strong>
            <p>
              {trip.walkToMeters < 30
                ? `Sube cerca de ${originLabel}.`
                : `hasta la ruta ${trip.route.code}, cerca de ${originLabel}.`}
            </p>
          </div>
        </div>
        <div className="trip-step">
          <span className="trip-step__num">2</span>
          <div>
            <strong>
              <BusIcon size={13} /> Toma la {trip.route.code} · {trip.rideMinutes} min a bordo
            </strong>
            <p className="trip-step__direction">{trip.route.directions[trip.directionIndex]?.name}</p>
          </div>
        </div>
        <div className="trip-step">
          <span className="trip-step__num">3</span>
          <div>
            <strong>
              {trip.walkFromMeters < 30
                ? `Baja cerca de ${destinationLabel}`
                : `Baja a ${meters(trip.walkFromMeters)} de ${destinationLabel}`}
            </strong>
            <p>El punto de bajada es una referencia sobre el trazado, no una parada oficial.</p>
          </div>
        </div>
      </div>

      <div className="trip-total">
        <ClockIcon size={18} />
        <div>
          <span>Tiempo estimado</span>
          <strong>{trip.totalMinutes} min</strong>
        </div>
        <p>
          {trip.walkToMeters < 30 ? "Estás en la ruta" : `${meters(trip.walkToMeters)} a pie`} · ~
          {trip.waitMinutes} min de espera · {meters(trip.rideMeters)} en bus
        </p>
      </div>

      <div className="trip-detail__actions">
        <button type="button" className="primary-button" onClick={onOpenRoute}>
          <PinIcon size={16} /> Ver recorrido completo
        </button>
        <button type="button" className="text-button" onClick={onBack}>
          Volver a opciones
        </button>
      </div>

      <p className="detail__note">
        Distancias a pie aproximadas en línea recta; el tiempo añade un factor de desvío. No incluye
        tráfico, semáforos ni paradas oficiales; confirma con el conductor.
      </p>
    </article>
  );
}
