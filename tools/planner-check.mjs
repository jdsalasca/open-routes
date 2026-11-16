// Verificación mínima del planificador con datos reales de Tunja.
// Uso: node tools/planner-check.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDirectTrips, findNearbyRoutes } from "../web/src/planner.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const city = JSON.parse(
  fs.readFileSync(path.join(root, "api/src/main/resources/cities/tunja.json"), "utf8")
);
const escandinavo = city.places.find((place) => place.id === "escandinavo");
const plaza = city.places.find((place) => place.id === "plaza-bolivar");

assert.ok(escandinavo && plaza, "faltan los lugares de prueba");

const origin = {
  kind: "place",
  lat: escandinavo.lat,
  lng: escandinavo.lng,
  label: escandinavo.name,
  type: escandinavo.type
};

const trips = findDirectTrips(origin, plaza, city.routes);
assert.ok(trips.length >= 3, `esperaba al menos 3 rutas directas, llegaron ${trips.length}`);
assert.ok(trips.some((trip) => trip.route.code === "R3"), "R3 debe conectar Escandinavo con la Plaza");
assert.ok(
  trips.every((trip) => trip.totalMinutes > 0 && trip.segment.length > 1),
  "cada opción debe tener tiempo y trazado"
);

const reverse = findDirectTrips(
  { kind: "place", lat: plaza.lat, lng: plaza.lng, label: plaza.name, type: plaza.type },
  escandinavo,
  city.routes
);
assert.ok(reverse.some((trip) => trip.route.code === "R3"), "R3 también debe servir el regreso");

const nearby = findNearbyRoutes({ lat: escandinavo.lat, lng: escandinavo.lng }, 500, city.routes);
assert.ok(nearby.length >= 5, `esperaba al menos 5 rutas a 500 m, llegaron ${nearby.length}`);
assert.equal(nearby[0].code, "R3", "R3 pasa por Escandinavo");
assert.ok(
  nearby.every(
    (hit, index, all) => index === 0 || all[index - 1].distanceMeters <= hit.distanceMeters
  ),
  "las rutas cercanas deben venir ordenadas por distancia"
);

const far = { id: "far", name: "Lejos", type: "Sitio", lat: 5.62, lng: -73.3, aliases: [] };
assert.equal(
  findDirectTrips(origin, far, city.routes).length,
  0,
  "un punto rural lejano no debe tener ruta directa"
);

console.log(
  "Planificador OK:",
  trips.map((trip) => `${trip.route.code} ~${trip.totalMinutes} min`).join(" · "),
  "· cercanas:",
  nearby.map((hit) => `${hit.code} ${hit.distanceMeters}m`).join(" · ")
);
