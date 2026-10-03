import { apiRequest, locateOrigin, compatibleShade } from "../client";
import type { RouteResult, ShadeResult } from "../types";
test("server errors remain explicit instead of substituting a demo", async () => {
  const fetcher = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: { message: "No connected path." } }),
  });
  await expect(
    apiRequest("/v1/routes", "http://laptop", {}, fetcher),
  ).rejects.toThrow("No connected path.");
});
test("denied GPS permission permits a manual origin", async () => {
  const location = {
    requestForegroundPermissionsAsync: async () => ({ status: "denied" }),
    getCurrentPositionAsync: jest.fn(),
  };
  await expect(locateOrigin(location)).rejects.toThrow(
    "Choose your start on the map",
  );
  expect(location.getCurrentPositionAsync).not.toHaveBeenCalled();
});
test("shade geometry from a different snapshot cannot accompany a route", () => {
  const route = {
    effective_at: "2026-07-01T10:00:00+00:00",
    dataset_version: "a",
  } as RouteResult;
  const shade = {
    effective_at: "2026-07-01T10:00:00Z",
    dataset_version: "a",
  } as ShadeResult;
  expect(compatibleShade(route, shade)).toBe(true);
  expect(compatibleShade(route, { ...shade, dataset_version: "b" })).toBe(
    false,
  );
});

test("successful API data is returned and the error fallback is usable", async () => {
  const ok = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ ready: true }) });
  expect(await apiRequest("/health", "http://laptop", undefined, ok)).toEqual({
    ready: true,
  });
  const failed = jest
    .fn()
    .mockResolvedValue({ ok: false, json: async () => ({}) });
  await expect(
    apiRequest("/health", "http://laptop", {}, failed),
  ).rejects.toThrow("could not complete");
});
test("granted GPS permission returns coordinates without native metadata", async () => {
  const coordinate = { latitude: 50, longitude: 19 };
  expect(
    await locateOrigin({
      requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
      getCurrentPositionAsync: async () => ({ coords: coordinate }),
    }),
  ).toEqual(coordinate);
});
test("shade at another effective time is not mixed with the displayed route", () => {
  const route = {
    effective_at: "2026-07-01T10:00:00Z",
    dataset_version: "a",
  } as RouteResult;
  expect(
    compatibleShade(route, {
      effective_at: "2026-07-01T10:10:00Z",
      dataset_version: "a",
    } as ShadeResult),
  ).toBe(false);
});

test("the configured fetch boundary is used when no override is supplied", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ ready: true }) });
  try {
    expect(await apiRequest("/health", "http://laptop")).toEqual({
      ready: true,
    });
  } finally {
    globalThis.fetch = previous;
  }
});
