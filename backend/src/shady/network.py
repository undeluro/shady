"""Public walking access, matching OSMnx walk exclusions with explicit access checks."""

import re

EXCLUDED = re.compile(
    "abandoned|bus_guideway|construction|cycleway|motor|no|planned|platform|proposed|raceway|razed|rest_area|services"
)


def walk_allowed(tags):
    highway = tags.get("highway", "")
    if not highway or EXCLUDED.search(highway) or tags.get("area") == "yes":
        return False
    if tags.get("foot") in {"no", "private"}:
        return False
    if tags.get("access") in {"private", "no"} and tags.get("foot") not in {
        "yes",
        "designated",
        "permissive",
    }:
        return False
    if tags.get("service") == "private":
        return False
    return all(
        tags.get(k) != "separate"
        for k in ("sidewalk", "sidewalk:both", "sidewalk:left", "sidewalk:right")
    )
