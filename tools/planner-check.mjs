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
assert.ok(trips.length >= 1, `esperaba al menos 1 ruta directa, llegaron ${trips.length}`);
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

// Un barrio compacto no se sirve desde una avenida a 300-500 m: solo cuentan
// las rutas que realmente entran o lo nombran (R15), no las que pasan cerca (R1, R26).
const uptc = place("uptc");
const cooservicios = place("cooservicios");
const asPlace = (item) => ({
  kind: "place",
  lat: item.lat,
  lng: item.lng,
  label: item.name,
  type: item.type
});
const toCooservicios = findDirectTrips(asPlace(uptc), cooservicios, city.routes).map(
  (trip) => trip.route.code
);
assert.ok(toCooservicios.includes("R15"), "R15 debe conectar UPTC con Cooservicios");
assert.ok(!toCooservicios.includes("R1"), "R1 no pasa por Cooservicios");
assert.ok(!toCooservicios.includes("R26"), "R26 no pasa por Cooservicios");
const fromCooservicios = findDirectTrips(asPlace(cooservicios), uptc, city.routes).map(
  (trip) => trip.route.code
);
assert.ok(fromCooservicios.includes("R15"), "R15 debe servir la salida de Cooservicios");
assert.ok(!fromCooservicios.includes("R1"), "R1 tampoco sirve la salida de Cooservicios");
assert.ok(!fromCooservicios.includes("R26"), "R26 tampoco sirve la salida de Cooservicios");

// Si la ruta nombra el barrio, se conserva aunque su trazado quede retirado.
const toAntoniaSantos = findDirectTrips(
  asPlace(uptc),
  place("antonia-santos"),
  city.routes
).map((trip) => trip.route.code);
assert.ok(toAntoniaSantos.includes("R26"), "R26 debe seguir sirviendo Antonia Santos");

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

function syntheticRoute({
  id = "X",
  code = "X",
  circular = false,
  paths,
  weekday = 10,
  sunday = 10,
  start = "00:00",
  end = "23:59"
}) {
  const schedule = (frequency) => ({ start, end, frequencyMin: frequency });
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

// Muchas pasadas por el origen: no basta con mirar solo las seis más cercanas.
const manyPasses = [[0, 0]];
for (let i = 0; i < 7; i++) {
  manyPasses.push([0.01, 0], [0, 0]);
}
manyPasses.push([0, 0.02]);
const manyPassTrips = findDirectTrips(
  { kind: "place", lat: 0, lng: 0, label: "O", type: "Sitio" },
  { id: "d", name: "D", type: "Sitio", lat: 0, lng: 0.02, aliases: [] },
  [syntheticRoute({ id: "many", paths: [manyPasses] })]
);
assert.equal(manyPassTrips.length, 1, "debe encontrar el viaje entre muchas pasadas");
assert.ok(
  manyPassTrips[0].rideMeters < 3000,
  `debe subir en la última pasada, no hacer ${manyPassTrips[0].rideMeters} m`
);

// Las esperas desconocidas no deben adelantar a las conocidas.
const straightPath = [
  [0, 0],
  [0, 0.01]
];
const originPoint = { kind: "place", lat: 0, lng: 0, label: "O", type: "Sitio" };
const destinationPoint = { id: "d", name: "D", type: "Sitio", lat: 0, lng: 0.01, aliases: [] };
const knownWait = syntheticRoute({ id: "known", paths: [straightPath] });
const noWait = syntheticRoute({
  id: "no-wait",
  paths: [straightPath],
  weekday: null,
  sunday: null
});
const ordered = findDirectTrips(originPoint, destinationPoint, [noWait, knownWait]);
assert.equal(ordered[0].route.id, "known", "una opción con espera conocida debe ir primero");
assert.equal(ordered[1].waitKnown, false, "la espera desconocida se conserva, pero después");

// El planificador devuelve todas las directas; la interfaz decide cuántas tarjetas mostrar.
const fiveRoutes = [1, 2, 3, 4, 5].map((index) =>
  syntheticRoute({ id: `r${index}`, paths: [straightPath] })
);
assert.equal(
  findDirectTrips(originPoint, destinationPoint, fiveRoutes).length,
  5,
  "no debe recortar a cuatro antes de filtrar los avisos"
);

// Domingo en zona horaria de la ciudad y consulta fuera de horario.
const sundayRoute = syntheticRoute({
  id: "sunday",
  paths: [straightPath],
  weekday: 10,
  sunday: 20,
  start: "05:00",
  end: "22:00"
});
const sundayTrip = findDirectTrips(originPoint, destinationPoint, [sundayRoute], {
  now: new Date("2026-01-04T17:00:00Z"),
  timeZone: "UTC"
});
assert.equal(sundayTrip[0].waitMinutes, 10, "el domingo debe usar la frecuencia dominical");
assert.equal(sundayTrip[0].outsideHours, false, "las 17:00 están dentro del horario");

const lateTrip = findDirectTrips(originPoint, destinationPoint, [sundayRoute], {
  now: new Date("2026-01-04T23:00:00Z"),
  timeZone: "UTC"
});
assert.equal(lateTrip[0].outsideHours, true, "las 23:00 están fuera del horario");

// No avisar de fragmentos si ambos extremos están en el mismo fragmento.
const sameFragment = findSplitRoutes(
  { kind: "place", lat: 0, lng: 0.002, label: "O", type: "Sitio" },
  { id: "d", name: "D", type: "Sitio", lat: 0, lng: 0.008, aliases: [] },
  [
    syntheticRoute({
      id: "same-fragment",
      paths: [
        [
          [0, 0],
          [0, 0.01]
        ],
        [
          [1, 1],
          [1, 1.01]
        ]
      ]
    })
  ]
);
assert.equal(sameFragment.length, 0, "no debe avisar si ambos extremos están en el mismo fragmento");

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
