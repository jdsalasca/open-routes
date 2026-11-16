// Verificación del planificador con datos reales y casos sintéticos.
// Uso: node tools/planner-check.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findDirectTrips,
  findNearbyRoutes,
  findSplitRoutes
} from "../web/src/planner.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const city = JSON.parse(
  fs.readFileSync(path.join(root, "api/src/main/resources/cities/tunja.json"), "utf8")
);
const place = (id) => city.places.find((item) => item.id === id);
const escandinavo = place("escandinavo");
const plaza = place("plaza-bolivar");
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
assert.ok(trips[0].waitKnown, "R3 tiene frecuencia conocida");
assert.ok(trips[0].waitMinutes > 0, "la espera de R3 debe ser positiva");

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

function syntheticRoute({ id = "X", code = "X", circular = false, paths, weekday = 10, sunday = 10 }) {
  const schedule = (frequency) => ({ start: "00:00", end: "23:59", frequencyMin: frequency });
  return {
    id,
    code,
    name: id,
    color: "#000000",
    type: "Urbana",
    description: "",
    weekday: schedule(weekday),
    sunday: schedule(sunday),
    operator: "",
    sourceUrl: "",
    circular,
    directions: [{ name: id, streets: [], paths, stops: [] }]
  };
}

// Un circuito cerrado debe permitir viajar cerrando la vuelta.
const loopPath = [
  [0, 0],
  [0, 0.01],
  [0.01, 0.01],
  [0.01, 0],
  [0, 0]
];
const loopTrips = findDirectTrips(
  { kind: "place", lat: 0, lng: 0.008, label: "O", type: "Sitio" },
  { id: "d", name: "D", type: "Sitio", lat: 0, lng: 0.002, aliases: [] },
  [syntheticRoute({ id: "loop", circular: true, paths: [loopPath] })]
);
assert.equal(loopTrips.length, 1, "un circuito marcado debe permitir cerrar la vuelta");
assert.ok(loopTrips[0].segment.length > 3, "el tramo del circuito debe incluir el cierre");

// Una ruta marcada circular pero con un trazado abierto no debe inventar el cierre.
const openCircular = findDirectTrips(
  { kind: "place", lat: 0.01, lng: 0.01, label: "O", type: "Sitio" },
  { id: "d", name: "D", type: "Sitio", lat: 0, lng: 0, aliases: [] },
  [
    syntheticRoute({
      id: "open-circular",
      circular: true,
      paths: [
        [
          [0, 0],
          [0, 0.01],
          [0.01, 0.01]
        ]
      ]
    })
  ]
);
assert.equal(openCircular.length, 0, "no debe cerrar una vuelta que el trazado no dibuja");

// Si la ruta pasa dos veces cerca del origen, debe elegir la aparición que acorta el viaje.
const repeatedPath = [
  [0, 0],
  [0, 0.01],
  [0.005, 0.01],
  [0.005, 0.0002],
  [0.005, 0.02],
  [0.01, 0.02]
];
const repeated = findDirectTrips(
  { kind: "place", lat: 0, lng: 0, label: "O", type: "Sitio" },
  { id: "d", name: "D", type: "Sitio", lat: 0.01, lng: 0.02, aliases: [] },
  [syntheticRoute({ id: "repeat", paths: [repeatedPath] })]
);
assert.equal(repeated.length, 1, "la ruta repetida debe encontrar viaje");
assert.ok(
  Math.abs(repeated[0].board[0] - 0.005) < 0.0005 &&
    Math.abs(repeated[0].board[1] - 0.0002) < 0.0005,
  "debe subir en la segunda aparición, no en la primera"
);
assert.ok(repeated[0].rideMeters < 3000, "no debe dar la vuelta completa como rodeo");

// Sin frecuencia conocida no se inventan diez minutos de espera.
const unknownWait = findDirectTrips(
  { kind: "place", lat: 0, lng: 0, label: "O", type: "Sitio" },
  { id: "d", name: "D", type: "Sitio", lat: 0, lng: 0.01, aliases: [] },
  [
    syntheticRoute({
      id: "unknown",
      paths: [
        [
          [0, 0],
          [0, 0.01]
        ]
      ],
      weekday: null,
      sunday: null
    })
  ]
);
assert.equal(unknownWait.length, 1, "la ruta sin frecuencia sigue siendo directa");
assert.equal(unknownWait[0].waitMinutes, null, "la espera debe quedar desconocida");
assert.equal(unknownWait[0].waitKnown, false, "no debe inventar una frecuencia");

// R8, R13 y R18 tienen el trazado dividido: se detectan, no se presentan como directas.
const split = findSplitRoutes(
  { kind: "place", lat: 5.599811, lng: -73.32612, label: "CDA", type: "Sector" },
  place("el-triunfo"),
  city.routes
);
assert.ok(split.some((hit) => hit.route.code === "R13"), "R13 debe marcarse como dividida");
assert.ok(
  findSplitRoutes(
    { kind: "place", lat: 5.599811, lng: -73.32612, label: "CDA", type: "Sector" },
    place("prados-san-luis"),
    city.routes
  ).some((hit) => hit.route.code === "R18"),
  "R18 debe marcarse como dividida"
);
assert.ok(
  findSplitRoutes(
    { kind: "place", lat: 5.5150467, lng: -73.3589478, label: "Cooservicios", type: "Barrio" },
    place("la-fuente"),
    city.routes
  ).some((hit) => hit.route.code === "R8"),
  "R8 debe marcarse como dividida"
);

console.log(
  "Planificador OK:",
  trips.map((trip) => `${trip.route.code} ~${Math.round(trip.totalMinutes)} min`).join(" · "),
  "· cercanas:",
  nearby.map((hit) => `${hit.code} ${hit.distanceMeters}m`).join(" · "),
  "· divididas:",
  split.map((hit) => hit.route.code).join(", ") || "ninguna"
);
