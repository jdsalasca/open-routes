// Importa los mapas públicos de UT Mi Ruta (Google My Maps) a cities/tunja.json.
// Uso: node tools/tunja-routes.mjs
// Es un importador de una sola ciudad: para otra ciudad se escribe el JSON a mano
// con el mismo esquema (ver README).
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(root, "tools", ".cache");
const outFile = path.join(root, "api", "src", "main", "resources", "cities", "tunja.json");

const PALETTE = [
  "#D64545", "#1D6FA5", "#2A9D8F", "#E07A1F", "#7B5EA7", "#6A994E",
  "#C2477E", "#3D7EA6", "#B8860B", "#8D5524", "#5B5F97", "#00808A",
  "#C0504D", "#4F7942", "#9C3D54", "#2E5EAA", "#A6631B", "#7A8B3F",
  "#B23A48", "#386641", "#8E6C88", "#1F7A8C", "#A44A3F", "#5C4D7D",
  "#4A7C59", "#B56576"
];

// Metadatos tomados de https://www.utmiruta.com/rutasyramalaesutmiruta (2026).
const ROUTES = [
  { code: "R1", mid: "10vBKVmZezs-g8MMp8_Lpwv58Gu-PrZ8", name: "Arboleda ↔ Terminal de Transporte", weekday: ["05:30", "22:00", 7], sunday: ["05:45", "21:43", 13] },
  { code: "R2", mid: "1bed3U2Cj8p7Xkwr4jhR72JpsSpqqLJ8", name: "Pinos de Oriente ↔ Arboleda", weekday: ["05:30", "22:00", 7], sunday: ["05:50", "22:00", 11] },
  { code: "R3", mid: "1ZhWpAzr1G35lzNaQnV_Hf7Ie1UkKfVE", name: "Arboleda ↔ Santa Inés", weekday: ["05:45", "22:00", 6], sunday: ["05:50", "22:00", 14] },
  { code: "R4", mid: "1J8f6kKxksaNQXKCFI3lwCQ-ryD6Voho", name: "Arboleda ↔ Muiscas", weekday: ["05:33", "22:00", 6], sunday: ["05:50", "22:00", 8] },
  { code: "R5", mid: "12MHFeo6TomE7TOY1hIznu1yVd9IIMIg", name: "Arboleda ↔ Paraíso", weekday: ["05:30", "22:00", 6], sunday: ["05:50", "22:00", 12] },
  { code: "R6", mid: "17U6jmQtSPhVnYQV8cSMSs7wAxAo81MA", name: "Estancia del Roble ↔ Retén Sur", weekday: ["05:30", "22:00", 8], sunday: ["05:50", "22:00", 20] },
  { code: "R7", mid: "1eRJ7qm9i5zXX1mwawixWllXkzTegx70", name: "Estancia del Roble ↔ Florida", weekday: ["05:30", "22:00", 9], sunday: ["05:50", "22:00", null] },
  { code: "R8", mid: "1oqcvw7AEcj7gYIlSX0yN9bBxqL6ygtg", name: "Cooservicios ↔ ESE Santiago de Tunja", weekday: ["05:30", "22:00", 6], sunday: ["05:50", "22:00", 13] },
  { code: "R9", mid: "1oHH34OQE8ohMcAu3vkwyOfE-4npAJLo", name: "Arboleda ↔ La Fuente", weekday: ["05:30", "22:00", 5], sunday: ["05:50", "22:00", 8] },
  { code: "R10", mid: "1m86r9hybxEvg_xqwOnbN2IhrqCJ9aTY", name: "Muiscas ↔ El Triunfo", weekday: ["05:30", "22:00", 7], sunday: ["05:50", "22:00", 16] },
  { code: "R11", mid: "1dtxI10iAsM0rVvCBknohCENcbEa2pgE", name: "Santa Marta ↔ Cooservicios", weekday: ["05:30", "22:00", 6], sunday: ["05:50", "22:00", 7] },
  { code: "R12", mid: "19SJdXxCQgGrukAWBOsqCwd3mnK0_2Ns", name: "Runta ↔ Uniboyacá", weekday: ["05:30", "22:00", 8], sunday: ["05:50", "22:00", null] },
  { code: "R13", mid: "1WOnjL-bUisZRIz1Q3762JFjjKs2DqpY", name: "El Lago ↔ El Triunfo", weekday: ["05:30", "22:00", 6], sunday: ["05:50", "22:00", 11] },
  { code: "R14", mid: "17Wd36tkYxESAtzpPdQgsljXzgNJBEKk", name: "Estancia del Roble ↔ Paraíso", weekday: ["05:30", "22:00", 7], sunday: ["05:50", "22:00", null] },
  { code: "R15", mid: "1DapnoAnXKZZd25gJ2sIiUXJwmRf7ZVM", name: "Cooservicios ↔ Muiscas", weekday: ["05:30", "22:00", 6], sunday: ["05:50", "22:00", 7] },
  { code: "R16", mid: "1vJ_qfc3q9C8LWHMml48kMGiaNq0jSEM", name: "Asís ↔ Florida", weekday: ["05:30", "22:00", 6], sunday: ["05:50", "22:00", 15] },
  { code: "R17", mid: "1RPG3jI5fClpB00o2Ufgp8E5GQkv_ArI", name: "Asís ↔ Altamira", weekday: ["05:30", "22:00", 6], sunday: ["05:50", "22:00", 45] },
  { code: "R18", mid: "1HUeIRiF7ilCRl6YFFffTa-KhZzoslic", name: "El Lago ↔ Prados de San Luis", weekday: ["05:30", "22:00", 6], sunday: ["05:50", "22:00", 12] },
  { code: "R19", mid: "1jtJMmh-HSa9MwyhkPUPXdgT6vEfYGmI", name: "Tunja ↔ Ventaquemada", type: "Intermunicipal", weekday: ["05:30", "22:00", 7], sunday: ["05:50", "22:00", 11] },
  { code: "R20", mid: "1CfhLbzjBVv4OWsrYcN1JqKFeyMzrziU", name: "Pirgua ↔ Terminal de Transporte", weekday: ["05:30", "22:00", 8], sunday: ["05:50", "22:00", 12] },
  { code: "R21", mid: "1ekzmAjoOPCopokongA49rMUlTnhOLfA", name: "Pirgua ↔ Retén Sur", weekday: ["05:30", "22:00", 8], sunday: ["05:50", "22:00", 17] },
  { code: "R22", mid: "1offZUKeO1dtehA9mdaxpbsePh9yUdIY", name: "Asís ↔ La Fuente", weekday: ["05:30", "22:00", 7], sunday: ["05:50", "22:00", 13] },
  { code: "R23", mid: "1U2an2O8xu1MClwkXPTNpcN4gTApTDnk", name: "Arboleda ↔ Uniboyacá", weekday: ["05:30", "22:00", 6], sunday: ["05:50", "22:00", 11] },
  { code: "R24", mid: "1W6rKWrwaU4PYHQPlqwFSpeKLEFmwMW4", name: "Runta ↔ La Fuente (Florencia)", weekday: ["05:30", "22:00", 9], sunday: ["05:50", "22:00", 20] },
  { code: "R25", mid: "1gtbzt4FPTgmbWeKOt119iICn3LS4Ggs", name: "Runta ↔ La Fuente", weekday: ["05:30", "22:00", 8], sunday: ["05:50", "22:00", null] },
  { code: "R26", mid: "18IVMIdC3LDAQs6yHZ8-06GlPAc3zV2s", name: "Muiscas ↔ Antonia Santos", weekday: ["05:30", "22:00", 6], sunday: ["05:50", "22:00", 8] }
];

const EARTH_RADIUS_M = 6_371_000;
const meters = (a, b) => {
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLng = (b[1] - a[1]) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
};

const clean = (value) => value
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ")
  .trim();

function parseCoordinates(block) {
  return block.trim().split(/\s+/)
    .map((triple) => triple.split(",").slice(0, 2).map(Number))
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
    .map(([lng, lat]) => [Number(lat.toFixed(6)), Number(lng.toFixed(6))]);
}

function parseKml(xml) {
  const folders = [];
  for (const folderMatch of xml.matchAll(/<Folder>([\s\S]*?)<\/Folder>/g)) {
    const body = folderMatch[1];
    const name = clean(/<name>([\s\S]*?)<\/name>/.exec(body)?.[1] ?? "Sin nombre");
    const segments = [];
    const points = [];
    for (const placemark of body.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
      const pm = placemark[1];
      const label = clean(/<name>([\s\S]*?)<\/name>/.exec(pm)?.[1] ?? "");
      if (pm.includes("<LineString>")) {
        const coords = /<coordinates>([\s\S]*?)<\/coordinates>/.exec(pm)?.[1];
        if (coords) {
          const pts = parseCoordinates(coords);
          if (pts.length > 1) segments.push({ street: label, pts });
        }
      } else if (pm.includes("<Point>")) {
        const coords = /<coordinates>([\s\S]*?)<\/coordinates>/.exec(pm)?.[1];
        if (coords) {
          const [pt] = parseCoordinates(coords);
          if (pt) points.push({ name: label, lat: pt[0], lng: pt[1] });
        }
      }
    }
    folders.push({ name, segments, points });
  }
  return folders;
}

// Une segmentos sueltos en cadenas continuas por cercanía entre extremos.
// El KML dibuja por calles, no en orden de recorrido.
function chainSegments(segments) {
  const unused = new Set(segments.keys());
  const chains = [];
  const hasNeighbor = (index, point) => {
    for (const other of unused) {
      if (other === index) continue;
      const pts = segments[other].pts;
      if (meters(point, pts[0]) < 30 || meters(point, pts.at(-1)) < 30) return true;
    }
    return false;
  };

  while (unused.size) {
    let start = -1;
    let reverse = false;
    for (const i of unused) {
      const pts = segments[i].pts;
      const startLinked = hasNeighbor(i, pts[0]);
      const endLinked = hasNeighbor(i, pts.at(-1));
      if (!startLinked || !endLinked) {
        start = i;
        reverse = startLinked;
        break;
      }
    }
    if (start < 0) start = unused.values().next().value;

    const points = reverse ? [...segments[start].pts].reverse() : [...segments[start].pts];
    unused.delete(start);
    let current = points.at(-1);

    while (true) {
      let best = -1;
      let bestReverse = false;
      let bestDistance = Infinity;
      for (const i of unused) {
        const pts = segments[i].pts;
        const toStart = meters(current, pts[0]);
        const toEnd = meters(current, pts.at(-1));
        if (toStart < bestDistance) { bestDistance = toStart; best = i; bestReverse = false; }
        if (toEnd < bestDistance) { bestDistance = toEnd; best = i; bestReverse = true; }
      }
      if (best < 0 || bestDistance > 35) break;
      const next = bestReverse ? [...segments[best].pts].reverse() : segments[best].pts;
      for (const point of next) {
        if (meters(points.at(-1), point) > 2) points.push(point);
      }
      current = points.at(-1);
      unused.delete(best);
    }
    if (points.length > 1) chains.push(points);
  }
  return chains;
}

// Douglas-Peucker: conserva la forma y reduce el JSON.
function simplify(points, tolerance = 0.000035) {
  if (points.length < 3) return points;
  const sqTolerance = tolerance * tolerance;
  const sqDistToSegment = (p, a, b) => {
    let x = a[0], y = a[1];
    let dx = b[0] - x, dy = b[1] - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) { x = b[0]; y = b[1]; }
      else if (t > 0) { x += dx * t; y += dy * t; }
    }
    dx = p[0] - x; dy = p[1] - y;
    return dx * dx + dy * dy;
  };
  const sqSegDist = (start, end, result) => {
    let maxSq = 0;
    for (let i = start + 1; i < end; i++) {
      const sq = sqDistToSegment(points[i], points[start], points[end]);
      if (sq > maxSq) { maxSq = sq; result.index = i; }
    }
    return maxSq;
  };
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const result = { index: 0 };
    if (sqSegDist(first, last, result) > sqTolerance) {
      keep[result.index] = 1;
      stack.push([first, result.index], [result.index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

async function download(kmlUrl, cacheFile) {
  try {
    return await fs.readFile(cacheFile, "utf8");
  } catch {
    const response = await fetch(kmlUrl, { headers: { "user-agent": "open-routes/0.1 (importador de datos)" } });
    if (!response.ok) throw new Error(`KML ${response.status}: ${kmlUrl}`);
    const xml = await response.text();
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(cacheFile, xml);
    return xml;
  }
}

function schedule([start, end, frequencyMin]) {
  return { start, end, frequencyMin };
}

async function main() {
  const routes = [];
  for (const [index, meta] of ROUTES.entries()) {
    const kmlUrl = `https://www.google.com/maps/d/kml?mid=${meta.mid}&forcekml=1`;
    console.log(`${meta.code} ${meta.name}`);
    const xml = await download(kmlUrl, path.join(cacheDir, `${meta.code}.kml`));
    const folders = parseKml(xml);
    const dispatch = folders.find((folder) => /despacho/i.test(folder.name));
    const directions = folders
      .filter((folder) => folder !== dispatch && folder.segments.length)
      .map((folder) => {
        const chains = chainSegments(folder.segments);
        const streets = [...new Set(folder.segments.map((segment) => segment.street).filter(Boolean))];
        return {
          name: folder.name,
          streets,
          paths: chains.map((chain) => simplify(chain)),
          stops: dispatch?.points ?? []
        };
      });
    if (!directions.length) throw new Error(`Sin trazados para ${meta.code}`);

    const allStreets = directions.flatMap((direction) => direction.streets);
    routes.push({
      id: meta.code.toLowerCase(),
      code: meta.code,
      name: meta.name,
      color: PALETTE[index % PALETTE.length],
      type: meta.type ?? "Urbana",
      description: `Recorrido por ${[...new Set(allStreets)].slice(0, 3).join(", ").toLowerCase() || "las vías de Tunja"}.`,
      weekday: schedule(meta.weekday),
      sunday: schedule(meta.sunday),
      operator: "UT Mi Ruta",
      sourceUrl: `https://www.google.com/maps/d/viewer?mid=${meta.mid}`,
      directions
    });
  }

  const city = {
    slug: "tunja",
    name: "Tunja",
    department: "Boyacá",
    country: "Colombia",
    center: { lat: 5.536, lng: -73.356 },
    zoom: 14,
    description: "Capital de Boyacá. Rutas urbanas e intermunicipales de la UT Mi Ruta, trazadas sobre el mapa oficial de cada recorrido.",
    sources: [
      { label: "UT Mi Ruta · Rutas y ramales", url: "https://www.utmiruta.com/rutasyramalaesutmiruta" }
    ],
    fare: {
      day: 2600,
      night: 2700,
      currency: "COP",
      note: "Tarifa 2026 (Decreto 0006 de 2026). Diurno 06:00–19:00; nocturno, domingos y festivos 19:01–05:59."
    },
    routes
  };

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(city, null, 1) + "\n");
  const points = routes.flatMap((route) => route.directions.flatMap((direction) => direction.paths.flat()));
  const longest = Math.max(...routes.map((route) => route.directions.flatMap((direction) => direction.paths).flat().length));
  console.log(`\n${routes.length} rutas, ${points.length} puntos, ruta más larga ${longest} pts`);
  console.log(`Escrito: ${outFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
