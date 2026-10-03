import React from "react";
import { render, screen, act } from "@testing-library/react-native";
import MapCanvas from "../components/MapCanvas";
import type { MapProps } from "../components/MapCanvas.types";
const mockAnimate = jest.fn();
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
    Polygon: (props: any) => <View {...props} testID="shadow-polygon" />,
    Marker: View,
    Polyline: View,
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
