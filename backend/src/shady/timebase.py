from datetime import datetime, timezone
from functools import lru_cache

import pandas as pd
from pvlib.solarposition import get_solarposition


def bucket(at: datetime) -> datetime:
    if at.tzinfo is None or at.utcoffset() is None:
        raise ValueError("Departure time must include a timezone offset.")
    at = at.astimezone(timezone.utc)
    return at.replace(minute=at.minute // 10 * 10, second=0, microsecond=0)


@lru_cache(maxsize=256)
def sun_position(at: datetime) -> tuple[float, float]:
    row = get_solarposition(pd.DatetimeIndex([bucket(at)]), 50.0614, 19.9383).iloc[0]
    return float(row["elevation"]), float(row["azimuth"])
