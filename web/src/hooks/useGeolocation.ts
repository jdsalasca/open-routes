import { useCallback, useState } from "react";

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracy: number;
}

type GeoStatus = "idle" | "locating" | "ready" | "error";

const messages: Record<number, string> = {
  1: "No diste permiso de ubicación. Puedes activarlo en los ajustes del navegador.",
  2: "Tu ubicación no está disponible en este momento. Revisa la señal o el GPS.",
  3: "La ubicación tardó demasiado. Inténtalo de nuevo."
};

export function useGeolocation() {
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const locate = useCallback((): Promise<GeoPoint | null> => {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setError("Tu navegador no permite geolocalización.");
      return Promise.resolve(null);
    }

    setStatus("locating");
    setError(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (result) => {
          const point = {
            lat: result.coords.latitude,
            lng: result.coords.longitude,
            accuracy: result.coords.accuracy
          };
          setPosition(point);
          setStatus("ready");
          resolve(point);
        },
        (failure) => {
          setStatus("error");
          setError(messages[failure.code] ?? "No pudimos obtener tu ubicación.");
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
      );
    });
  }, []);

  return { position, status, error, locate };
}
