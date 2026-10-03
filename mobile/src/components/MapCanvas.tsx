import { exposureColor, shadeFillColor } from "../core/shade";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import MapView, { Marker, Polygon, Polyline } from "react-native-maps";
import { StyleSheet, View } from "react-native";
import type { MapProps } from "./MapCanvas.types";
import { DemoMap } from "./DemoMap";
const points = (coordinates: number[][]) =>
  coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
function LiveMap(props: MapProps) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const lastCamera = useRef<number | undefined>(undefined);
  const fitted = useRef<string>("");
  useEffect(() => {
    const key = JSON.stringify([
      props.route?.geometry.coordinates[0],
      props.route?.geometry.coordinates.at(-1),
    ]);
    if (ready && props.route && fitted.current !== key) {
      fitted.current = key;
      map.current?.fitToCoordinates(points(props.route.geometry.coordinates), {
        edgePadding: { top: 200, right: 55, bottom: 320, left: 55 },
        animated: !props.reduceMotion,
      });
    }
  }, [props.route, props.reduceMotion, ready]);
  useEffect(() => {
    if (
      ready &&
      props.cameraTarget &&
      lastCamera.current !== props.cameraTarget.id
    ) {
      lastCamera.current = props.cameraTarget.id;
      map.current?.animateToRegion(
        {
          ...props.cameraTarget.coordinate,
          latitudeDelta: 0.006,
          longitudeDelta: 0.006,
        },
        props.reduceMotion ? 0 : 350,
      );
    }
  }, [props.cameraTarget, props.reduceMotion, ready]);
  const overlays = useMemo(() => {
    const shadows = props.showShade ? props.shadows?.shadows : null;
    // MapKit re-adds updated overlays above unchanged ones, regardless of JSX order.
    // Replace the complete overlay snapshot together, without remounting the map:
    // shade first, then casing, then every exposure segment (including shared paths).
    // Memoized elements also avoid native coordinate/style updates during camera/UI renders.
    const snapshot = JSON.stringify([shadows, props.route]);
    return (
      <Fragment key={snapshot}>
        {shadows?.features.map((f, i) => (
          <Polygon
            key={`shade-${i}`}
            coordinates={points(f.geometry.coordinates[0])}
            holes={f.geometry.coordinates.slice(1).map(points)}
            fillColor={shadeFillColor(f.properties.source)}
            strokeColor="transparent"
            strokeWidth={1}
            zIndex={0}
          />
        ))}
        {props.route && (
          <Polyline
            coordinates={points(props.route.geometry.coordinates)}
            strokeColor="#F5FAF8"
            strokeWidth={9}
            zIndex={1}
          />
        )}
        {props.route?.segments.features.map((f, i) => (
          <Polyline
            key={`route-${i}`}
            coordinates={points(f.geometry.coordinates)}
            strokeColor={exposureColor(f.properties.exposure)}
            strokeWidth={6}
            zIndex={2}
          />
        ))}
      </Fragment>
    );
  }, [props.showShade, props.shadows, props.route]);
  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={{
        ...props.origin,
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      }}
      onMapReady={() => setReady(true)}
      onPanDrag={props.onPan}
      userInterfaceStyle="light"
      mapType="standard"
      showsCompass={false}
      showsUserLocation={false}
      rotateEnabled={false}
      onLongPress={(e) => props.onPin(e.nativeEvent.coordinate)}
      onRegionChangeComplete={props.onRegion}
    >
      {overlays}
      {props.location && (
        <Marker
          coordinate={props.location}
          title="Your location"
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: "#168575",
              borderWidth: 3,
              borderColor: "white",
            }}
          />
        </Marker>
      )}
      <Marker coordinate={props.origin} title="Start" pinColor="#168575" />
      {props.destination && (
        <Marker
          coordinate={props.destination}
          title="Destination"
          pinColor="#123B35"
        />
      )}
    </MapView>
  );
}

export default function MapCanvas(props: MapProps) {
  return props.demo ? <DemoMap {...props} /> : <LiveMap {...props} />;
}
