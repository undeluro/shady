import { useEffect, useRef } from "react";
import MapView, { Marker, Polygon, Polyline } from "react-native-maps";
import { StyleSheet } from "react-native";
import type { MapProps } from "./MapCanvas.types";
import { DemoMap } from "./DemoMap";
const points = (coordinates: number[][]) =>
  coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
export default function MapCanvas(props: MapProps) {
  const map = useRef<MapView>(null);
  const fitted = useRef<string>("");
  useEffect(() => {
    const key = JSON.stringify([
      props.route?.geometry.coordinates[0],
      props.route?.geometry.coordinates.at(-1),
    ]);
    if (props.route && fitted.current !== key) {
      fitted.current = key;
      map.current?.fitToCoordinates(points(props.route.geometry.coordinates), {
        edgePadding: { top: 200, right: 55, bottom: 320, left: 55 },
        animated: !props.reduceMotion,
      });
    }
  }, [props.route, props.reduceMotion]);
  if (props.demo) return <DemoMap {...props} />;
  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={{
        ...props.origin,
        latitudeDelta: 0.018,
        longitudeDelta: 0.018,
      }}
      mapType="standard"
      showsCompass={false}
      showsUserLocation={false}
      rotateEnabled={false}
      onLongPress={(e) => props.onPin(e.nativeEvent.coordinate)}
      onRegionChangeComplete={props.onRegion}
    >
      {props.showShade &&
        props.shadows?.shadows.features.map((f, i) => (
          <Polygon
            key={`shade-${i}`}
            coordinates={points(f.geometry.coordinates[0])}
            holes={f.geometry.coordinates.slice(1).map(points)}
            fillColor="rgba(22,133,117,0.24)"
            strokeWidth={0}
          />
        ))}
      {props.route && (
        <Polyline
          coordinates={points(props.route.geometry.coordinates)}
          strokeColor="#F5FAF8"
          strokeWidth={9}
        />
      )}
      {props.route?.segments.features.map((f, i) => (
        <Polyline
          key={`route-${i}`}
          coordinates={points(f.geometry.coordinates)}
          strokeColor={
            f.properties.exposure === "shaded"
              ? "#168575"
              : f.properties.exposure === "sunny"
                ? "#FFC857"
                : "#577B74"
          }
          strokeWidth={6}
        />
      ))}
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
