// Utilidades compartidas por los importadores de lugares de Tunja.
export const normalizeName = (value) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export const slugify = (value) =>
  normalizeName(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "lugar";

const MINOR = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "a"]);

export const titleCase = (value) =>
  value
    .toLowerCase()
    .split(/\s+/)
    .map((word, index) =>
      index > 0 && MINOR.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");

/**
 * Mezcla lugares por nombre normalizado. Los datos oficiales mandan en las
 * coordenadas; los nombres y alias curados se conservan.
 */
export function mergePlaces(base, extra) {
  const byName = new Map(base.map((place) => [normalizeName(place.name), place]));
  const usedIds = new Set(base.map((place) => place.id));

  for (const place of extra) {
    const key = normalizeName(place.name);
    const current = byName.get(key);
    if (current) {
      current.lat = place.lat;
      current.lng = place.lng;
      if (place.type === "Barrio" || place.type === "Vereda") current.type = place.type;
      current.aliases = [...new Set([...(current.aliases ?? []), ...(place.aliases ?? [])])];
      continue;
    }

    let id = place.id;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${place.id}-${suffix}`;
      suffix += 1;
    }
    const created = { ...place, id };
    base.push(created);
    usedIds.add(id);
    byName.set(key, created);
  }
  return base;
}
