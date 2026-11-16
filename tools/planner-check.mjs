// Verificación mínima del planificador con datos reales de Tunja.
// Uso: node tools/planner-check.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findDirectTrips } from "../web/src/planner.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const city = JSON.parse(
  fs.readFileSync(path.join(root, "api/src/main/resources/cities/tunja.json"), "utf8")
);
const escandinavo = city.places.find((place) => place.id === "escandinavo");
const plaza = city.places.find((place) => place.id === "plaza-bolivar");

assert.ok(escandinavo && plaza, "faltan los lugares de prueba");

const trips = findDirectTrips(
  {
    kind: "place",
    lat: escandinavo.lat,
    lng: escandinavo.lng,
    label: escandinavo.name,
    type: escandinavo.type
  },
  plaza,
  city.routes
);

assert.ok(trips.length >= 3, `esperaba al menos 3 rutas directas, llegaron ${trips.length}`);
assert.ok(trips.some((trip) => trip.route.code === "R3"), "R3 debe conectar Escandinavo con la Plaza");
assert.ok(
  trips.every((trip) => trip.totalMinutes > 0 && trip.segment.length > 1),
  "cada opción debe tener tiempo y trazado"
);
console.log(
  "Planificador OK:",
  trips.map((trip) => `${trip.route.code} ~${trip.totalMinutes} min`).join(" · ")
);
