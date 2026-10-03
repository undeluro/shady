import React from "react";
import { render, screen, act } from "@testing-library/react-native";
import MapCanvas from "../components/MapCanvas";
import type { MapProps } from "../components/MapCanvas.types";
const mockAnimate = jest.fn();
const mockOverlayOrder: { id: object; color: string }[] = [];
jest.mock("react-native-maps", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest native boundary factory.
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest native boundary factory.
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: React.forwardRef(function MockMap(props: any, ref: any) {
      React.useImperativeHandle(ref, () => ({
        animateToRegion: mockAnimate,
        fitToCoordinates: jest.fn(),
      }));
      return <View {...props} testID="native-map" />;
    }),
    // Model MapKit's documented native add/remove behavior at the renderer boundary.
    // Unchanged values keep their native order; changed geometry/style is re-added on top.
    Polygon: function MockPolygon(props: any) {
      const id = React.useRef({}).current;
      const signature = JSON.stringify([
        props.coordinates,
        props.holes,
        props.fillColor,
      ]);
      React.useEffect(() => {
        mockOverlayOrder.push({ id, color: "shade" });
        return () => {
          const i = mockOverlayOrder.findIndex((v) => v.id === id);
          if (i >= 0) mockOverlayOrder.splice(i, 1);
        };
      }, [id, signature]);
      return <View {...props} testID="shadow-polygon" />;
    },
    Marker: View,
    Polyline: function MockPolyline(props: any) {
      const id = React.useRef({}).current;
      const signature = JSON.stringify([
        props.coordinates,
        props.strokeColor,
        props.strokeWidth,
      ]);
      React.useEffect(() => {
        mockOverlayOrder.push({ id, color: props.strokeColor });
        return () => {
          const i = mockOverlayOrder.findIndex((v) => v.id === id);
          if (i >= 0) mockOverlayOrder.splice(i, 1);
        };
      }, [id, signature, props.strokeColor]);
      return <View {...props} testID="route-line" />;
    },
  };
});
const point = { latitude: 50.06, longitude: 19.94 };
const props: MapProps = {
  origin: point,
  destination: null,
  route: null,
  showShade: true,
  onPin: jest.fn(),
  onRegion: jest.fn(),
  shadows: {
    effective_at: "2026-07-01T11:00:00Z",
    dataset_version: "test",
    detail_available: true,
    shade_status: "available",
    shadows: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [19.94, 50.06],
                [19.941, 50.06],
                [19.941, 50.061],
                [19.94, 50.06],
              ],
            ],
          },
        },
      ],
    },
  },
};
test("shade polygons suppress MapKit default black strokes explicitly", () => {
  render(<MapCanvas {...props} />);
  expect(screen.getByTestId("shadow-polygon").props.strokeColor).toBe(
    "transparent",
  );
  expect(screen.getByTestId("shadow-polygon").props.strokeWidth).toBe(1);
});
test("GPS camera requests wait for readiness and repeat even at the same coordinate", () => {
  const { rerender } = render(
    <MapCanvas {...props} cameraTarget={{ coordinate: point, id: 1 }} />,
  );
  expect(mockAnimate).not.toHaveBeenCalled();
  act(() => screen.getByTestId("native-map").props.onMapReady());
  expect(mockAnimate).toHaveBeenCalledWith(expect.objectContaining(point), 350);
  rerender(
    <MapCanvas
      {...props}
      cameraTarget={{ coordinate: point, id: 2 }}
      reduceMotion
    />,
  );
  expect(mockAnimate).toHaveBeenLastCalledWith(
    expect.objectContaining(point),
    0,
  );
});
test("returning from a saved map waits for the new native map before recentering", () => {
  mockAnimate.mockClear();
  const view = render(
    <MapCanvas {...props} cameraTarget={{ coordinate: point, id: 1 }} />,
  );
  act(() => screen.getByTestId("native-map").props.onMapReady());
  view.rerender(
    <MapCanvas
      {...props}
      demo={{ bounds: [19.9, 50, 20, 50.1], roadsPath: "", buildingsPath: "" }}
    />,
  );
  view.rerender(
    <MapCanvas {...props} cameraTarget={{ coordinate: point, id: 2 }} />,
  );
  expect(mockAnimate).toHaveBeenCalledTimes(1);
  act(() => screen.getByTestId("native-map").props.onMapReady());
  expect(mockAnimate).toHaveBeenCalledTimes(2);
});
test("changing motion preference does not replay an old GPS camera command", () => {
  mockAnimate.mockClear();
  const view = render(
    <MapCanvas {...props} cameraTarget={{ coordinate: point, id: 1 }} />,
  );
  act(() => screen.getByTestId("native-map").props.onMapReady());
  view.rerender(
    <MapCanvas
      {...props}
      cameraTarget={{ coordinate: point, id: 1 }}
      reduceMotion
    />,
  );
  expect(mockAnimate).toHaveBeenCalledTimes(1);
});

const first = [19.94, 50.06],
  shared = [19.941, 50.061],
  finish = [19.942, 50.062];
function routeFixture(detour = false): NonNullable<MapProps["route"]> {
  const tail = detour ? [shared, [19.942, 50.061], finish] : [shared, finish];
  return {
    profile: detour ? "shaded" : "shortest",
    distance_m: 400,
    duration_s: 300,
    shaded_m: 200,
    sunny_m: 200,
    shade_pct: 50,
    geometry: { type: "LineString", coordinates: [first, ...tail] },
    segments: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [first, shared] },
          properties: { exposure: "shaded" },
        },
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: tail },
          properties: { exposure: "sunny" },
        },
      ],
    },
  };
}
test("switching routes keeps unchanged shared segments above the refreshed outline", () => {
  const view = render(<MapCanvas {...props} route={routeFixture()} />);
  view.rerender(<MapCanvas {...props} route={routeFixture(true)} />);
  const colors = mockOverlayOrder.map((v) => v.color);
  expect(colors).toEqual(["shade", "#F5FAF8", "#168575", "#FFC857"]);
});
test("viewport shade refresh and shade toggles keep polygons below the entire route", () => {
  const route = routeFixture();
  const view = render(<MapCanvas {...props} route={route} />);
  const refreshed = {
    ...props.shadows!,
    shadows: {
      ...props.shadows!.shadows,
      features: props.shadows!.shadows.features.map((f) => ({
        ...f,
        geometry: {
          ...f.geometry,
          coordinates: f.geometry.coordinates.map((ring) =>
            ring.map(([x, y]) => [x + 0.001, y]),
          ),
        },
      })),
    },
  };
  view.rerender(<MapCanvas {...props} route={route} shadows={refreshed} />);
  expect(mockOverlayOrder.map((v) => v.color)).toEqual([
    "shade",
    "#F5FAF8",
    "#168575",
    "#FFC857",
  ]);
  view.rerender(
    <MapCanvas
      {...props}
      route={route}
      shadows={refreshed}
      showShade={false}
    />,
  );
  view.rerender(<MapCanvas {...props} route={route} shadows={refreshed} />);
  expect(mockOverlayOrder.map((v) => v.color)).toEqual([
    "shade",
    "#F5FAF8",
    "#168575",
    "#FFC857",
  ]);
});

test("camera renders preserve both the native map and unchanged overlay coordinates", () => {
  const route = routeFixture();
  const view = render(<MapCanvas {...props} route={route} />);
  const nativeMap = screen.getByTestId("native-map");
  const coordinates = screen
    .getAllByTestId("route-line")
    .map((line) => line.props.coordinates);
  const ids = mockOverlayOrder.map((v) => v.id);
  view.rerender(
    <MapCanvas
      {...props}
      route={route}
      cameraTarget={{ coordinate: point, id: 9 }}
      reduceMotion
    />,
  );
  expect(screen.getByTestId("native-map")).toBe(nativeMap);
  screen
    .getAllByTestId("route-line")
    .forEach((line, i) => expect(line.props.coordinates).toBe(coordinates[i]));
  expect(mockOverlayOrder.map((v) => v.id)).toEqual(ids);
});

test("woodland estimates remain distinct and below the colored walking route", () => {
  const route = routeFixture();
  route.segments.features[0].properties.exposure = "woodland";
  const shadows = {
    ...props.shadows!,
    shadows: {
      ...props.shadows!.shadows,
      features: props.shadows!.shadows.features.map((feature) => ({
        ...feature,
        properties: { source: "woodland" },
      })),
    },
  };
  render(<MapCanvas {...props} shadows={shadows} route={route} />);
  expect(screen.getByTestId("shadow-polygon").props.fillColor).toBe(
    "rgba(101,159,104,0.20)",
  );
  expect(mockOverlayOrder.map((v) => v.color)).toEqual([
    "shade",
    "#F5FAF8",
    "#659F68",
    "#FFC857",
  ]);
});
