"""Acquire versioned source files once. Uses HTTPS validation and atomic files."""

import json
import ssl
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

import certifi

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data/raw"
RAW.mkdir(parents=True, exist_ok=True)
CONTEXT = ssl.create_default_context(cafile=certifi.where())


def fetch(url, path):
    if path.exists():
        return
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "ShadyHackathon/0.1 Krakow local dataset preparation"},
    )
    partial = path.with_suffix(path.suffix + ".partial")
    with (
        urllib.request.urlopen(request, context=CONTEXT, timeout=120) as response,
        partial.open("wb") as output,
    ):
        while chunk := response.read(1024 * 1024):
            output.write(chunk)
    partial.replace(path)
    print("Downloaded", path.name, path.stat().st_size, flush=True)


if not (RAW / "boundary.json").exists():
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {
            "city": "Kraków",
            "country": "Poland",
            "format": "jsonv2",
            "polygon_geojson": 1,
            "limit": 10,
        }
    )
    fetch(url, RAW / "boundary-source.json")
    places = json.loads((RAW / "boundary-source.json").read_text())
    city = next(p for p in places if p["osm_type"] == "relation" and int(p["osm_id"]) == 449696)
    (RAW / "boundary.json").write_text(json.dumps(city["geojson"]))
for code in ("1261", "1206", "1219"):
    fetch(
        f"https://opendata.geoportal.gov.pl/InneDane/Budynki3D/LOD1/2024/12/{code}.zip",
        RAW / f"{code}.zip",
    )
    with zipfile.ZipFile(RAW / f"{code}.zip") as archive:
        if archive.testzip():
            raise ValueError("Corrupt building archive: " + code)
fetch(
    "https://download.geofabrik.de/europe/poland/malopolskie-latest.osm.pbf",
    RAW / "malopolskie-latest.osm.pbf",
)
