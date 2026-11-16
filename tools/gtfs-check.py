#!/usr/bin/env python3
"""Autoprueba del importador GTFS con el feed mínimo de tools/fixtures.

Genera la ciudad en una carpeta temporal, comprueba el contrato que consume la
API y compara el resultado con la muestra usada por CityValidatorTest.
Con --update reescribe esa muestra (solo cuando el cambio es intencional).
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IMPORTER = ROOT / "tools" / "gtfs-import.py"
FIXTURE = ROOT / "tools" / "fixtures" / "gtfs-mini"
SAMPLE = ROOT / "api" / "src" / "test" / "resources" / "imported-city.json"

BASE_ARGS = [
    "--slug",
    "prueba",
    "--name",
    "Ciudad Prueba",
    "--department",
    "Boyacá",
    "--timezone",
    "America/Bogota",
    "--fare-day",
    "2600",
    "--fare-night",
    "2700",
    "--source-label",
    "Fixture",
    "--source-url",
    "https://example.com",
]


def run(gtfs: Path, output: Path, *extra: str) -> dict:
    command = [
        sys.executable,
        str(IMPORTER),
        "--gtfs",
        str(gtfs),
        *BASE_ARGS,
        "--output",
        str(output),
        *extra,
    ]
    result = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    assert result.returncode == 0, (
        f"el importador falló:\n{result.stdout}\n{result.stderr}"
    )
    return json.loads(output.read_text(encoding="utf-8"))


def check_contract(city: dict) -> None:
    assert city["slug"] == "prueba"
    assert city["country"] == "Colombia"
    assert city["timezone"] == "America/Bogota"
    assert city["fare"] == {
        "day": 2600,
        "night": 2700,
        "currency": "COP",
        "note": city["fare"]["note"],
    }
    assert city["zoom"] == 14, city["zoom"]
    assert city["center"] == {"lat": 5.535, "lng": -73.35775}, city["center"]

    routes = {route["code"]: route for route in city["routes"]}
    assert set(routes) == {"10", "20"}, list(routes)
    assert routes["10"]["color"] == "#1D6FA5"
    assert routes["10"]["type"] == "Urbana"
    assert len(routes["10"]["directions"]) == 2
    assert len(routes["20"]["directions"]) == 1
    assert routes["10"]["directions"][0]["name"] == "Parque Central → Terminal"
    assert routes["10"]["directions"][1]["name"] == "Terminal → Parque Central"
    assert routes["20"]["directions"][0]["name"] == "Mercado → Parque Central"
    assert routes["10"]["weekday"] == {
        "start": "05:30",
        "end": "06:23",
        "frequencyMin": 10,
    }
    assert routes["20"]["weekday"] == {
        "start": "06:00",
        "end": "06:22",
        "frequencyMin": 12,
    }
    assert routes["10"]["directions"][0]["paths"][0][0] == [5.53, -73.36]
    assert all(
        len(path) >= 2
        for route in city["routes"]
        for direction in route["directions"]
        for path in direction["paths"]
    )

    # Ida y vuelta comparten paradas: no deben duplicarse los lugares buscables.
    names = [place["name"] for place in city["places"]]
    assert sorted(names) == [
        "Mercado",
        "Parque Central",
        "Plaza del Norte",
        "Terminal",
        "Universidad",
    ], names
    assert len({place["id"] for place in city["places"]}) == len(city["places"]) == 5
    assert all(
        place["type"] == "Parada" and place["aliases"] == [] for place in city["places"]
    )


def check_center_override(city: dict) -> None:
    assert city["center"] == {"lat": 5.6, "lng": -73.4}
    assert city["zoom"] == 12


def main() -> None:
    with tempfile.TemporaryDirectory() as temporary:
        work = Path(temporary)
        city = run(FIXTURE, work / "folder.json")
        check_contract(city)

        archive = work / "feed.zip"
        with zipfile.ZipFile(archive, "w") as bundle:
            for file in sorted(FIXTURE.iterdir()):
                bundle.write(file, file.name)
        zipped = run(archive, work / "zip.json")
        assert zipped == city, "el zip y la carpeta deben producir la misma ciudad"

        override = run(
            FIXTURE,
            work / "center.json",
            "--center-lat",
            "5.6",
            "--center-lng",
            "-73.4",
            "--zoom",
            "12",
        )
        check_center_override(override)

        serialized = json.dumps(city, ensure_ascii=False, indent=1) + "\n"
        if "--update" in sys.argv:
            SAMPLE.parent.mkdir(parents=True, exist_ok=True)
            SAMPLE.write_text(serialized, encoding="utf-8")
        assert SAMPLE.exists(), f"falta la muestra {SAMPLE}; ejecuta con --update"
        assert SAMPLE.read_text(encoding="utf-8") == serialized, (
            "la muestra para la API quedó desactualizada; "
            "revisa el cambio y ejecuta: python tools/gtfs-check.py --update"
        )

    print("GTFS OK: 2 rutas, 5 lugares, zip/carpeta y centro manual verificados")


if __name__ == "__main__":
    main()
