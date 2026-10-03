from shady.network import walk_allowed


def test_private_and_prohibited_ways_are_excluded_but_explicit_foot_permission_is_respected():
    assert not walk_allowed({"highway": "residential", "access": "private"})
    assert not walk_allowed({"highway": "footway", "foot": "no"})
    assert not walk_allowed({"highway": "primary", "sidewalk": "separate"})
    assert not walk_allowed({"highway": "motorway"})
    assert walk_allowed({"highway": "pedestrian"})
    assert walk_allowed({"highway": "service", "access": "no", "foot": "yes"})
    assert not walk_allowed({"highway": "service", "service": "private"})
    assert not walk_allowed({})
    assert not walk_allowed({"highway": "pedestrian", "area": "yes"})
