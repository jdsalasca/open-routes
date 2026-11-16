#!/usr/bin/env python3
"""Convierte un feed GTFS (zip o carpeta) al JSON de ciudad de open-routes.

Uso mínimo:
  python tools/gtfs-import.py --gtfs feed.zip --slug mi-ciudad \
    --name "Mi Ciudad" --department "Boyacá" --timezone America/Bogota \
    --fare-day 2600 --fare-night 2700 --output cities/mi-ciudad.json

El feed debe traer routes.txt, trips.txt, shapes.txt, stops.txt y stop_times.txt.
El horario se deriva de los viajes y se puede ajustar con --weekday-* y --sunday-*.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from itertools import pairwise
from pathlib import Path

PALETTE = [
    "#D64545",
    "#1D6FA5",
    "#2A9D8F",
    "#E07A1F",
    "#7B5EA7",
    "#6A994E",
    "#C2477E",
    "#3D7EA6",
    "#B8860B",
    "#8D5524",
    "#5B5F97",
    "#00808A",
    "#C0504D",
    "#4F7942",
    "#9C3D54",
    "#2E5EAA",
    "#A6631B",
    "#7A8B3F",
    "#B23A48",
    "#386641",
    "#8E6C88",
    "#1F7A8C",
    "#A44A3F",
    "#5C4D7D",
    "#4A7C59",
    "#B56576",
]

TYPE_NAMES = {
    "0": "Tranvía",
    "1": "Metro",
    "2": "Tren",
    "3": "Urbana",
    "4": "Ferry",
    "11": "Trolebús",
}


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "ruta"


def read_table(source: Path, name: str) -> list[dict[str, str]]:
    if source.is_dir():
        path = source / name
        if not path.exists():
            return []
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            return [
                {key.strip(): (value or "").strip() for key, value in row.items()}
                for row in csv.DictReader(handle)
            ]
    with zipfile.ZipFile(source) as archive:
        members = [
            member
            for member in archive.namelist()
            if Path(member).name.lower() == name.lower()
        ]
        if not members:
            return []
        text = archive.read(members[0]).decode("utf-8-sig")
        return [
            {key.strip(): (value or "").strip() for key, value in row.items()}
            for row in csv.DictReader(io.StringIO(text))
        ]


def as_int(value: str | None) -> int:
    try:
        return int(value or 0)
    except ValueError:
        return 0


def parse_time(value: str) -> int | None:
    if not value:
        return None
    parts = value.split(":")
    if len(parts) < 2:
        return None
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return None


def format_time(minutes: int) -> str:
    minutes %= 24 * 60
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def simplify(
    points: list[tuple[float, float]], tolerance: float = 0.00004
) -> list[tuple[float, float]]:
    if len(points) < 3:
        return points
    squared = tolerance * tolerance

    def segment_distance(point, start, end) -> float:
        x, y = start
        dx, dy = end[0] - x, end[1] - y
        if dx or dy:
            t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy)
            if t > 1:
                x, y = end
            elif t > 0:
                x += dx * t
                y += dy * t
        return (point[0] - x) ** 2 + (point[1] - y) ** 2

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        best, index = 0.0, 0
        for i in range(first + 1, last):
            distance = segment_distance(points[i], points[first], points[last])
            if distance > best:
                best, index = distance, i
        if best > squared:
            keep[index] = True
            stack.extend([(first, index), (index, last)])
    return [point for point, selected in zip(points, keep) if selected]


def build_city(args: argparse.Namespace) -> dict:
    routes = read_table(args.gtfs, "routes.txt")
    trips = read_table(args.gtfs, "trips.txt")
    shapes_raw = read_table(args.gtfs, "shapes.txt")
    stops_raw = read_table(args.gtfs, "stops.txt")
    stop_times = read_table(args.gtfs, "stop_times.txt")

    if not routes or not trips:
        raise SystemExit("El feed no tiene routes.txt o trips.txt")

    stops = {
        row["stop_id"]: row
        for row in stops_raw
        if row.get("stop_id") and row.get("stop_lat") and row.get("stop_lon")
    }
    stop_times_by_trip: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in stop_times:
        stop_times_by_trip[row.get("trip_id", "")].append(row)
    for rows in stop_times_by_trip.values():
        rows.sort(key=lambda row: as_int(row.get("stop_sequence")))

    shapes: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    for row in shapes_raw:
        try:
            shapes[row["shape_id"]].append(
                (
                    int(row["shape_pt_sequence"]),
                    float(row["shape_pt_lat"]),
                    float(row["shape_pt_lon"]),
                )
            )
        except (KeyError, ValueError):
            continue
    shape_paths = {
        shape_id: simplify([(lat, lon) for _, lat, lon in sorted(points)])
        for shape_id, points in shapes.items()
    }

    trips_by_route: dict[str, list[dict[str, str]]] = defaultdict(list)
    for trip in trips:
        trips_by_route[trip.get("route_id", "")].append(trip)

    city_routes = []
    used_codes: set[str] = set()
    used_ids: set[str] = set()
    used_place_ids: set[str] = set()
    places_by_name: dict[str, list[dict]] = defaultdict(list)
    places: dict[str, dict] = {}
    all_points: list[tuple[float, float]] = []

    for index, route in enumerate(routes):
        route_id = route.get("route_id", "")
        route_trips = trips_by_route.get(route_id, [])
        if not route_trips:
            print(f"  aviso: {route_id} no tiene viajes", file=sys.stderr)
            continue

        code = route.get("route_short_name") or route_id or f"R{index + 1}"
        base_code = code
        suffix = 2
        while code in used_codes:
            code = f"{base_code}-{suffix}"
            suffix += 1
        used_codes.add(code)

        route_slug = slugify(route_id or code)
        base_slug = route_slug
        suffix = 2
        while route_slug in used_ids:
            route_slug = f"{base_slug}-{suffix}"
            suffix += 1
        used_ids.add(route_slug)

        groups: dict[str, list[dict[str, str]]] = defaultdict(list)
        for trip in route_trips:
            key = trip.get("direction_id") or trip.get("shape_id") or "0"
            groups[key].append(trip)
        selected_groups = sorted(
            groups.items(), key=lambda item: len(item[1]), reverse=True
        )[:2]

        directions = []
        for direction_index, (_, group) in enumerate(selected_groups):
            shape_counts = Counter(
                trip.get("shape_id") for trip in group if trip.get("shape_id")
            )
            shape_id = shape_counts.most_common(1)[0][0] if shape_counts else None
            representative = next(
                (trip for trip in group if trip.get("shape_id") == shape_id), group[0]
            )
            trip_stop_times = stop_times_by_trip.get(
                representative.get("trip_id", ""), []
            )

            trip_stops = []
            seen_stops = set()
            for row in trip_stop_times:
                stop = stops.get(row.get("stop_id", ""))
                if not stop or stop["stop_id"] in seen_stops:
                    continue
                seen_stops.add(stop["stop_id"])
                trip_stops.append(
                    {
                        "name": stop.get("stop_name") or f"Parada {stop['stop_id']}",
                        "lat": float(stop["stop_lat"]),
                        "lng": float(stop["stop_lon"]),
                    }
                )

            path = shape_paths.get(shape_id) if shape_id else None
            if not path or len(path) < 2:
                path = [(stop["lat"], stop["lng"]) for stop in trip_stops]
            if len(path) < 2:
                continue

            all_points.extend(path)
            for stop in trip_stops:
                # La misma parada aparece en ida y vuelta: se reutiliza el lugar
                # si coincide el nombre y está a menos de ~110 m.
                known = places_by_name[stop["name"].casefold()]
                existing = next(
                    (
                        place
                        for place in known
                        if abs(place["lat"] - stop["lat"]) < 0.001
                        and abs(place["lng"] - stop["lng"]) < 0.001
                    ),
                    None,
                )
                if existing is not None:
                    continue

                place_id = slugify(stop["name"])
                base_place = place_id
                place_suffix = 2
                while place_id in used_place_ids:
                    place_id = f"{base_place}-{place_suffix}"
                    place_suffix += 1
                used_place_ids.add(place_id)
                place = {
                    "id": place_id,
                    "name": stop["name"],
                    "type": "Parada",
                    "lat": stop["lat"],
                    "lng": stop["lng"],
                    "aliases": [],
                }
                places[place_id] = place
                known.append(place)

            if trip_stops:
                direction_name = f"{trip_stops[0]['name']} → {trip_stops[-1]['name']}"
            else:
                direction_name = "Ida" if direction_index == 0 else "Vuelta"

            directions.append(
                {
                    "name": direction_name,
                    "streets": [],
                    "paths": [[[round(lat, 6), round(lng, 6)] for lat, lng in path]],
                    "stops": trip_stops,
                }
            )

        if not directions:
            print(f"  aviso: {route_id} no tiene trazados utilizables", file=sys.stderr)
            continue

        # Horario aproximado a partir de todos los viajes de la ruta.
        firsts, lasts = [], []
        for trip in route_trips:
            times = [
                parse_time(row.get("departure_time") or row.get("arrival_time", ""))
                for row in stop_times_by_trip.get(trip.get("trip_id", ""), [])
            ]
            times = [time for time in times if time is not None]
            if times:
                firsts.append(min(times))
                lasts.append(max(times))
        if firsts:
            start = min(firsts)
            end = max(lasts)
            firsts.sort()
            gaps = [b - a for a, b in pairwise(firsts) if b > a]
            headway = round(sum(gaps) / len(gaps)) if gaps else 10
            headway = max(3, min(headway, 90))
        else:
            start, end, headway = 5 * 60 + 30, 22 * 60, 10

        weekday = {
            "start": args.weekday_start or format_time(start),
            "end": args.weekday_end or format_time(end),
            "frequencyMin": args.weekday_frequency or headway,
        }
        sunday = {
            "start": args.sunday_start or weekday["start"],
            "end": args.sunday_end or weekday["end"],
            "frequencyMin": args.sunday_frequency or weekday["frequencyMin"],
        }

        color = (route.get("route_color") or "").lstrip("#")
        color = (
            f"#{color.upper()}"
            if re.fullmatch(r"[0-9A-Fa-f]{6}", color)
            else PALETTE[index % len(PALETTE)]
        )
        route_name = (
            route.get("route_long_name") or route.get("route_short_name") or route_id
        )

        city_routes.append(
            {
                "id": route_slug,
                "code": code,
                "name": route_name,
                "color": color,
                "type": TYPE_NAMES.get(route.get("route_type", ""), "Transporte"),
                "description": route.get("route_desc") or f"Recorrido {code}.",
                "weekday": weekday,
                "sunday": sunday,
                "operator": args.operator or args.source_label,
                "sourceUrl": args.source_url,
                "circular": False,
                "directions": directions,
            }
        )

    if not city_routes:
        raise SystemExit("No se pudo construir ninguna ruta a partir del feed")
    if not places:
        raise SystemExit("El feed no tiene paradas utilizables")

    zoom = None
    if args.center_lat is not None and args.center_lng is not None:
        center = {"lat": args.center_lat, "lng": args.center_lng}
    else:
        lats = [point[0] for point in all_points]
        lngs = [point[1] for point in all_points]
        center = {
            "lat": round((min(lats) + max(lats)) / 2, 6),
            "lng": round((min(lngs) + max(lngs)) / 2, 6),
        }
        span = max(max(lats) - min(lats), max(lngs) - min(lngs))
        zoom = (
            15
            if span < 0.02
            else 14
            if span < 0.06
            else 13
            if span < 0.12
            else 12
            if span < 0.2
            else 11
        )
    zoom = args.zoom or zoom

    return {
        "slug": args.slug,
        "name": args.name,
        "department": args.department,
        "country": args.country,
        "timezone": args.timezone,
        "center": center,
        "zoom": zoom,
        "description": args.description
        or f"Rutas de transporte público de {args.name}, importadas desde GTFS.",
        "sources": [{"label": args.source_label, "url": args.source_url}],
        "fare": {
            "day": args.fare_day,
            "night": args.fare_night,
            "currency": args.currency,
            "note": "Tarifa configurada al importar el feed; verifica el valor vigente con el operador.",
        },
        "places": list(places.values()),
        "routes": city_routes,
    }


def validate_city(city: dict) -> None:
    if not re.fullmatch(r"[a-z0-9-]+", city["slug"]):
        raise SystemExit("slug inválido")
    if not city["places"] or not city["routes"]:
        raise SystemExit("la ciudad necesita lugares y rutas")
    for route in city["routes"]:
        if not re.fullmatch(r"#[0-9A-Fa-f]{6}", route["color"]):
            raise SystemExit(f"color inválido en {route['code']}")
        if not route["directions"]:
            raise SystemExit(f"ruta sin sentidos: {route['code']}")
        for direction in route["directions"]:
            for path in direction["paths"]:
                if len(path) < 2:
                    raise SystemExit(f"trazado vacío en {route['code']}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gtfs", required=True, type=Path, help="zip o carpeta GTFS")
    parser.add_argument("--slug", required=True)
    parser.add_argument("--name", required=True)
    parser.add_argument("--department", required=True)
    parser.add_argument("--country", default="Colombia")
    parser.add_argument(
        "--timezone", required=True, help="zona IANA, p. ej. America/Bogota"
    )
    parser.add_argument("--fare-day", required=True, type=int)
    parser.add_argument("--fare-night", required=True, type=int)
    parser.add_argument("--currency", default="COP")
    parser.add_argument("--source-label", default="GTFS")
    parser.add_argument("--source-url", default="")
    parser.add_argument("--operator", default=None)
    parser.add_argument("--description", default=None)
    parser.add_argument("--center-lat", type=float)
    parser.add_argument("--center-lng", type=float)
    parser.add_argument("--zoom", type=int)
    parser.add_argument("--weekday-start")
    parser.add_argument("--weekday-end")
    parser.add_argument("--weekday-frequency", type=int)
    parser.add_argument("--sunday-start")
    parser.add_argument("--sunday-end")
    parser.add_argument("--sunday-frequency", type=int)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    city = build_city(args)
    validate_city(city)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(city, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(
        f"OK: {len(city['routes'])} rutas, {len(city['places'])} lugares -> {args.output}"
    )


if __name__ == "__main__":
    main()
