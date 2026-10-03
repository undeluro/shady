import { exposureColor, WOODLAND_COLOR } from "../core/shade";
import { useEffect, useRef } from "react";
import type * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapProps } from "./MapCanvas.types";
import { DemoMap } from "./DemoMap";
function LiveMap(props: MapProps) {
  const lib = useRef<typeof L | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  }, [props]);
  const layers = useRef<L.LayerGroup | null>(null);
  const lastCamera = useRef<number | undefined>(undefined);
  const fitted = useRef<string>("");
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Defer browser globals until mount.
    const L = require("leaflet") as typeof import("leaflet");
    lib.current = L;
    const m = L.map(root.current!, {
      zoomControl: false,
      attributionControl: false,
    }).setView(
      [latest.current.origin.latitude, latest.current.origin.longitude],
      16,
    );
    map.current = m;
    L.tileLayer(
      process.env.EXPO_PUBLIC_TILE_URL ??
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19 },
    ).addTo(m);
    layers.current = L.layerGroup().addTo(m);
    const region = () => {
      const center = m.getCenter(),
        bounds = m.getBounds();
      latest.current.onRegion({
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: bounds.getNorth() - bounds.getSouth(),
        longitudeDelta: bounds.getEast() - bounds.getWest(),
      });
    };
    m.on("moveend", region);
    m.on("dragstart", () => latest.current.onPan?.());
    m.on("contextmenu", (e) =>
      latest.current.onPin({ latitude: e.latlng.lat, longitude: e.latlng.lng }),
    );
    region();
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const L = lib.current;
    const group = layers.current,
      m = map.current;
    if (!L || !group || !m) return;
    group.clearLayers();
    if (props.showShade && props.shadows)
      L.geoJSON(props.shadows.shadows as GeoJSON.FeatureCollection, {
        style: (feature) => ({
          fillColor:
            feature?.properties?.source === "woodland"
              ? WOODLAND_COLOR
              : "#168575",
          fillOpacity: feature?.properties?.source === "woodland" ? 0.2 : 0.24,
          stroke: false,
        }),
      }).addTo(group);
    if (props.route) {
      L.geoJSON(props.route.geometry as GeoJSON.LineString, {
        style: { color: "#F5FAF8", weight: 10 },
      }).addTo(group);
      props.route.segments.features.forEach((f) =>
        L.geoJSON(f as GeoJSON.Feature, {
          style: {
            color: exposureColor(f.properties.exposure),
            weight: 6,
          },
        }).addTo(group),
      );
      const key = JSON.stringify([
        props.route.geometry.coordinates[0],
        props.route.geometry.coordinates.at(-1),
      ]);
      if (fitted.current !== key) {
        m.fitBounds(
          L.geoJSON(props.route.geometry as GeoJSON.LineString).getBounds(),
          {
            paddingTopLeft: [45, 195],
            paddingBottomRight: [45, 280],
            animate: false,
          },
        );
        fitted.current = key;
      }
    }
    L.circleMarker([props.origin.latitude, props.origin.longitude], {
      radius: 7,
      color: "#FFFFFF",
      weight: 3,
      fillColor: "#168575",
      fillOpacity: 1,
    }).addTo(group);
    if (props.location)
      L.circleMarker([props.location.latitude, props.location.longitude], {
        radius: 8,
        color: "white",
        weight: 3,
        fillColor: "#168575",
        fillOpacity: 1,
      }).addTo(group);
    if (props.destination)
      L.circleMarker(
        [props.destination.latitude, props.destination.longitude],
        {
          radius: 8,
          color: "#FFFFFF",
          weight: 3,
          fillColor: "#123B35",
          fillOpacity: 1,
        },
      ).addTo(group);
  }, [
    props.origin,
    props.location,
    props.destination,
    props.route,
    props.shadows,
    props.showShade,
  ]);
  useEffect(() => {
    if (props.cameraTarget && lastCamera.current !== props.cameraTarget.id) {
      lastCamera.current = props.cameraTarget.id;
      map.current?.setView(
        [
          props.cameraTarget.coordinate.latitude,
          props.cameraTarget.coordinate.longitude,
        ],
        17,
        { animate: !props.reduceMotion },
      );
    }
  }, [props.cameraTarget, props.reduceMotion]);
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
      <div ref={root} style={{ width: "100%", height: "100%" }} />
      <div
        style={{
          position: "absolute",
          top: "58%",
          left: 12,
          fontSize: 9,
          color: "#577B74",
          zIndex: 450,
          background: "#F5FAF8DD",
          padding: 3,
          borderRadius: 4,
        }}
      >
        ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          style={{ color: "inherit" }}
        >
          OpenStreetMap contributors
        </a>{" "}
        · GUGiK
      </div>
    </div>
  );
}
export default function MapCanvas(props: MapProps) {
  return props.demo ? <DemoMap {...props} /> : <LiveMap {...props} />;
}
