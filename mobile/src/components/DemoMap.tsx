import { exposureColor, WOODLAND_COLOR } from "../core/shade";
import { useMemo, useState } from "react";
import { StyleSheet, View, Text, PanResponder, Animated } from "react-native";
import Svg, { Path, Circle, G } from "react-native-svg";
import type { MapProps } from "./MapCanvas.types";
export function DemoMap(props: MapProps) {
  const [size, setSize] = useState({ width: 400, height: 800 });
  const [pan] = useState(() => new Animated.ValueXY());
  const { project, path, scale, offset } = useMemo(() => {
    const [left, bottom, right, top] = props.demo?.bounds ?? [
      19.921, 50.043, 19.952, 50.072,
    ];
    const cosine = Math.cos((((top + bottom) / 2) * Math.PI) / 180);
    const width = (right - left) * cosine * 100000,
      height = (top - bottom) * 100000,
      availableHeight = Math.max(100, size.height * 0.65 - 230);
    const scale = Math.min((size.width - 80) / width, availableHeight / height),
      offset = [
        size.width / 2 - (width * scale) / 2,
        230 + availableHeight / 2 - (height * scale) / 2,
      ];
    const project = ([x, y]: number[]) => [
      (x - left) * cosine * 100000,
      (top - y) * 100000,
    ];
    const path = (coordinates: number[][]) =>
      coordinates
        .map((p, i) => `${i ? "L" : "M"}${project(p).join(" ")}`)
        .join(" ");
    return { project, path, scale, offset };
  }, [props.demo, size.width, size.height]);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) + Math.abs(g.dy) > 6,
        onPanResponderGrant: () => pan.extractOffset(),
        onPanResponderMove: (_, g) => pan.setValue({ x: g.dx, y: g.dy }),
        onPanResponderRelease: () => pan.flattenOffset(),
      }),
    [pan],
  );
  const start = project([props.origin.longitude, props.origin.latitude]),
    end = props.destination
      ? project([props.destination.longitude, props.destination.latitude])
      : null;
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize(e.nativeEvent.layout)}
      {...responder.panHandlers}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: pan.getTranslateTransform() },
        ]}
      >
        <Svg
          width={size.width}
          height={size.height}
          style={{ backgroundColor: "#EAF2EE" }}
          viewBox={`0 0 ${size.width} ${size.height}`}
        >
          <G transform={`translate(${offset[0]} ${offset[1]}) scale(${scale})`}>
            <Path
              d={props.demo?.buildingsPath ?? ""}
              fill="#D9E3DF"
              fillRule="evenodd"
              stroke="#CEDAD4"
              strokeWidth={0.3 / scale}
            />
            <Path
              d={props.demo?.roadsPath ?? ""}
              fill="none"
              stroke="#F9FCFA"
              strokeWidth={1.5 / scale}
            />
            {props.showShade && (
              <Path
                d={props.shadows?.woodland_display_path ?? ""}
                fill={WOODLAND_COLOR}
                fillOpacity={0.2}
                fillRule="evenodd"
              />
            )}
            {props.showShade && (
              <Path
                d={props.shadows?.display_path ?? ""}
                fill="#168575"
                fillOpacity={0.22}
                fillRule="evenodd"
              />
            )}
            {props.route && (
              <Path
                d={path(props.route.geometry.coordinates)}
                fill="none"
                stroke="#F5FAF8"
                strokeWidth={10 / scale}
                strokeLinejoin="round"
              />
            )}
            {props.route?.segments.features.map((f, i) => (
              <Path
                key={i}
                d={path(f.geometry.coordinates)}
                fill="none"
                stroke={exposureColor(f.properties.exposure)}
                strokeWidth={6 / scale}
                strokeLinecap="round"
              />
            ))}
            <Circle
              cx={start[0]}
              cy={start[1]}
              r={8 / scale}
              fill="#168575"
              stroke="white"
              strokeWidth={3 / scale}
            />
            {end && (
              <Circle
                cx={end[0]}
                cy={end[1]}
                r={9 / scale}
                fill="#123B35"
                stroke="white"
                strokeWidth={3 / scale}
              />
            )}
          </G>
        </Svg>
      </Animated.View>
      <Text
        style={{
          position: "absolute",
          top: "58%",
          left: 12,
          fontSize: 9,
          color: "#577B74",
          backgroundColor: "#F5FAF8DD",
          padding: 3,
        }}
      >
        © OpenStreetMap contributors · GUGiK
      </Text>
    </View>
  );
}
