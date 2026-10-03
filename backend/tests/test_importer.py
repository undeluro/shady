import io

from shady.importer import read_citygml

XML = b"""<core:CityModel xmlns:core="http://www.opengis.net/citygml/2.0" xmlns:b="http://www.opengis.net/citygml/building/2.0" xmlns:g="http://www.opengis.net/gml"><core:cityObjectMember><b:Building g:id="one"><b:measuredHeight>10</b:measuredHeight><b:lod1Solid><g:Solid><g:exterior><g:CompositeSurface><g:surfaceMember><g:Polygon><g:exterior><g:LinearRing><g:posList>560000 240000 200 560010 240000 200 560010 240010 200 560000 240010 200 560000 240000 200</g:posList></g:LinearRing></g:exterior></g:Polygon></g:surfaceMember></g:CompositeSurface></g:exterior></g:Solid></b:lod1Solid></b:Building></core:cityObjectMember></core:CityModel>"""


def test_reads_meter_footprint_and_measured_height():
    buildings = list(read_citygml(io.BytesIO(XML)))
    assert buildings[0].height == 10
    assert buildings[0].geometry.bounds == (560000, 240000, 560010, 240010)
    assert buildings[0].geometry.area == 100


def test_missing_height_rejects_flat_shell_and_records_invalid_heights():
    stats = {}
    assert (
        list(
            read_citygml(
                io.BytesIO(XML.replace(b"<b:measuredHeight>10</b:measuredHeight>", b"")), stats
            )
        )
        == []
    )
    assert stats["rejected"] == 1
    assert (
        list(
            read_citygml(
                io.BytesIO(XML.replace(b">10</b:measuredHeight>", b">-1</b:measuredHeight>"))
            )
        )
        == []
    )


def test_non_horizontal_and_short_surfaces_do_not_become_footprints():
    invalid = XML.replace(b"560010 240000 200", b"560010 240000 205")
    assert list(read_citygml(io.BytesIO(invalid))) == []
    short = XML.replace(b"560010 240010 200 560000 240010 200 560000 240000 200", b"")
    assert list(read_citygml(io.BytesIO(short))) == []
