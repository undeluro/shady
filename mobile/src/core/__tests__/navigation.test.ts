import { walkProgress } from "../navigation";
import type { Route } from "../types";
const route = {
  distance_m: 1112,
  duration_s: 855,
  geometry: {
    type: "LineString",
    coordinates: [
      [19.94, 50.06],
      [19.94, 50.07],
    ],
  },
} as Route;
test("matches walking positions to distance, remaining time and arrival", () => {
  const half = walkProgress(route, {
    latitude: 50.065,
    longitude: 19.94,
    accuracy: 5,
  });
  expect(half?.fraction).toBeCloseTo(0.5);
  expect(half?.remaining_m).toBeCloseTo(556);
  expect(half?.remaining_s).toBeCloseTo(427.5);
  expect(half?.arrived).toBe(false);
  expect(
    walkProgress(route, { latitude: 50.07, longitude: 19.94, accuracy: 5 })
      ?.arrived,
  ).toBe(true);
});
test("off-route fixes never invent arrival and expose distance to the route", () => {
  const p = walkProgress(route, {
    latitude: 50.07,
    longitude: 19.95,
    accuracy: 5,
  });
  expect(p?.offRoute).toBe(true);
  expect(p?.arrived).toBe(false);
  expect(p?.offset_m).toBeGreaterThan(500);
});
test("inaccurate or invalid fixes and unusable geometry do not update progress", () => {
  expect(
    walkProgress(route, { latitude: 50, longitude: 19, accuracy: 100 }),
  ).toBeNull();
  expect(
    walkProgress(route, { latitude: NaN, longitude: 19, accuracy: 5 }),
  ).toBeNull();
  expect(
    walkProgress(route, { latitude: 50, longitude: 19, accuracy: null }),
  ).toBeNull();
  expect(
    walkProgress(route, { latitude: 50, longitude: 19, accuracy: -1 }),
  ).toBeNull();
  expect(
    walkProgress(
      { ...route, geometry: { type: "LineString", coordinates: [] } },
      { latitude: 50, longitude: 19, accuracy: 5 },
    ),
  ).toBeNull();
  expect(
    walkProgress(
      {
        ...route,
        geometry: {
          type: "LineString",
          coordinates: [
            [19, 50],
            [19, 50],
          ],
        },
      },
      { latitude: 50, longitude: 19, accuracy: 5 },
    ),
  ).toBeNull();
});
test("projection clamps to endpoints and handles duplicate points and bent routes", () => {
  expect(
    walkProgress(route, { latitude: 50.0599, longitude: 19.94, accuracy: 5 })
      ?.fraction,
  ).toBe(0);
  expect(
    walkProgress(route, { latitude: 50.0701, longitude: 19.94, accuracy: 5 })
      ?.fraction,
  ).toBe(1);
  const bent = {
    ...route,
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [19.94, 50.06],
        [19.94, 50.06],
        [19.94, 50.065],
        [19.95, 50.065],
      ],
    },
  };
  expect(
    walkProgress(bent, { latitude: 50.065, longitude: 19.945, accuracy: 5 })
      ?.fraction,
  ).toBeGreaterThan(0.5);
});
test("at repeated junctions a fix stays near the previously followed part of the walk", () => {
  const loop = {
    ...route,
    geometry: {
      type: "LineString" as const,
      coordinates: [
        [19.94, 50.06],
        [19.94, 50.065],
        [19.945, 50.065],
        [19.94, 50.065],
        [19.94, 50.07],
      ],
    },
  };
  expect(
    walkProgress(loop, { latitude: 50.065, longitude: 19.94, accuracy: 5 }, 0.7)
      ?.fraction,
  ).toBeGreaterThan(0.5);
});
