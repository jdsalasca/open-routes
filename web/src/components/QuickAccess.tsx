import type { Origin, Place } from "../types";
import type { FavoriteLabel, FavoritePlace, RecentTrip } from "../personal";
import { ClockIcon, PinIcon } from "./Icons";

type Props = {
  favorites: FavoritePlace[];
  recents: RecentTrip[];
  origin: Origin | null;
  onApplyPlace: (place: Place) => void;
  onSaveFavorite: (label: FavoriteLabel) => void;
  onApplyRecent: (trip: RecentTrip) => void;
};

export function QuickAccess({
  favorites,
  recents,
  origin,
  onApplyPlace,
  onSaveFavorite,
  onApplyRecent
}: Props) {
  const labels: FavoriteLabel[] = ["Casa", "Trabajo"];
  const saved = new Set(favorites.map((favorite) => favorite.label));
  const canSave = origin?.kind === "place";
  const show = favorites.length > 0 || recents.length > 0 || canSave;
  if (!show) return null;

  return (
    <div className="quick-access" aria-label="Favoritos y viajes recientes">
      {(favorites.length > 0 || canSave) && (
        <div className="quick-access__row">
          <span className="quick-access__label">Favoritos</span>
          {favorites.map((favorite) => (
            <button
              key={favorite.label}
              type="button"
              className="quick-chip"
              onClick={() => onApplyPlace(favorite.place)}
              title={`Usar ${favorite.place.name} como origen`}
            >
              <PinIcon size={12} /> {favorite.label}
            </button>
          ))}
          {canSave &&
            labels
              .filter((label) => !saved.has(label))
              .map((label) => (
                <button
                  key={label}
                  type="button"
                  className="quick-chip quick-chip--add"
                  onClick={() => onSaveFavorite(label)}
                  title={`Guardar ${origin.label} como ${label}`}
                >
                  + {label}
                </button>
              ))}
        </div>
      )}
      {recents.length > 0 && (
        <div className="quick-access__row">
          <span className="quick-access__label">
            <ClockIcon size={12} /> Recientes
          </span>
          {recents.slice(0, 3).map((trip) => {
            const label = `${trip.origin.label} → ${trip.destination.name}`;
            return (
              <button
                key={`${trip.at}-${label}`}
                type="button"
                className="quick-chip quick-chip--trip"
                onClick={() => onApplyRecent(trip)}
                title={label}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
