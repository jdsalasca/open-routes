// Importa los barrios y veredas oficiales de Tunja (Datos Abiertos Colombia,
// Alcaldía de Tunja, CC BY-SA 4.0) y los mezcla con los lugares curados.
// Uso: node tools/tunja-places.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergePlaces, normalizeName, slugify, titleCase } from "./lib/places.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cityFile = path.join(root, "api", "src", "main", "resources", "cities", "tunja.json");
const dataFile = path.join(root, "tools", "data", "tunja-barrios.json");
const DATASET = "https://www.datos.gov.co/resource/4ryc-k7fx.json?$limit=500";

// La fuente oficial viene en mayúsculas y sin tildes; se corrigen los nombres
// visibles sin cambiar su clave de búsqueda (que ignora tildes).
const NAME_FIXES = new Map([
  ["baron", "Barón"],
  ["bolivar", "Bolívar"],
  ["jorge eliecer gaitan", "Jorge Eliécer Gaitán"],
  ["jose antonio galan", "José Antonio Galán"],
  ["jose joaquin camacho", "José Joaquín Camacho"],
  ["la maria", "La María"],
  ["las americas", "Las Américas"],
  ["nueva santa barbara", "Nueva Santa Bárbara"],
  ["santa barbara", "Santa Bárbara"],
  ["parque de los martires", "Parque de los Mártires"],
  ["rincon de la pradera", "Rincón de la Pradera"],
  ["prados de alcala", "Prados de Alcalá"],
  ["altos de san martin", "Altos de San Martín"],
  ["belalcazar", "Belalcázar"],
  ["caminitos de oicata", "Caminitos de Oicatá"],
  ["lombardia", "Lombardía"],
  ["suarez", "Suárez"],
  ["villa bachue", "Villa Bachué"],
  ["jordan", "Jordán"],
  ["aquimin", "Aquimín"],
  ["asis boyacense", "Asís Boyacense"],
  ["barrio asis", "Barrio Asís"]
]);

const properName = (raw) => {
  const name = titleCase(raw);
  return NAME_FIXES.get(normalizeName(name)) ?? name;
};

const response = await fetch(DATASET, {
  headers: { "User-Agent": "open-routes/0.1 (+https://open-routes.eridu.top)" }
});
if (!response.ok) {
  throw new Error(`Datos Abiertos respondió ${response.status}`);
}
const rows = await response.json();

const barrios = rows.map((row) => {
  const vereda = Boolean(row.esvereda);
  const raw = String(row.barrio ?? "").replace(/^vereda\s+/i, "").trim();
  const name = properName(raw);
  const aliases = [
    normalizeName(name),
    `${vereda ? "vereda" : "barrio"} ${normalizeName(name)}`
  ];
  if (!vereda && Number(row.sector) > 0) aliases.push(`comuna ${row.sector}`);
  return {
    id: slugify(name),
    name,
    type: vereda ? "Vereda" : "Barrio",
    lat: Number(row.latitud),
    lng: Number(row.longitud),
    aliases: [...new Set(aliases)]
  };
});

if (barrios.length < 100) {
  throw new Error(`Solo llegaron ${barrios.length} barrios; se esperaban más de 100`);
}
if (barrios.some((place) => !Number.isFinite(place.lat) || !Number.isFinite(place.lng))) {
  throw new Error("La fuente trae barrios sin coordenadas válidas");
}

await fs.mkdir(path.dirname(dataFile), { recursive: true });
await fs.writeFile(dataFile, JSON.stringify(barrios, null, 1) + "\n");

const city = JSON.parse(await fs.readFile(cityFile, "utf8"));
city.places = mergePlaces(city.places, barrios);
for (const place of city.places) {
  const fixed = NAME_FIXES.get(normalizeName(place.name));
  if (fixed) place.name = fixed;
  if (place.type === "Vereda") {
    place.aliases = place.aliases.filter((alias) => !/^comuna\s+\d+$/.test(alias));
  }
}
const source = {
  label: "Barrios y veredas de Tunja (Alcaldía de Tunja, CC BY-SA 4.0)",
  url: "https://www.datos.gov.co/Vivienda-Ciudad-y-Territorio/Informaci-n-Barrios-y-veredas-de-Municipio-de-Tunja/4ryc-k7fx"
};
if (!city.sources.some((item) => item.url === source.url)) {
  city.sources.push(source);
}
await fs.writeFile(cityFile, JSON.stringify(city, null, 1) + "\n");
console.log(`OK: ${barrios.length} barrios/veredas oficiales -> ${city.places.length} lugares`);
