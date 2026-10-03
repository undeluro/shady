from datetime import datetime

import pytest

from shady.timebase import bucket, sun_position


def test_equivalent_offsets_share_a_ten_minute_bucket():
    assert (
        bucket(datetime.fromisoformat("2026-07-01T12:09:59+02:00")).isoformat()
        == "2026-07-01T10:00:00+00:00"
    )
    assert (
        bucket(datetime.fromisoformat("2026-07-01T10:01:00+00:00")).isoformat()
        == "2026-07-01T10:00:00+00:00"
    )


def test_ambiguous_naive_time_is_rejected():
    with pytest.raises(ValueError):
        bucket(datetime(2026, 10, 25, 2, 30))


def test_krakow_summer_noon_has_high_southerly_sun():
    elevation, azimuth = sun_position(datetime.fromisoformat("2026-07-01T11:00:00+00:00"))
    assert 60 < elevation < 65
    assert 170 < azimuth < 190
