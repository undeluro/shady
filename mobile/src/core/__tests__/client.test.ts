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

test("an unavailable native GPS fix becomes a readable manual-start error", async () => {
  await expect(
    locateOrigin({
      requestForegroundPermissionsAsync: async () => ({ status: "granted" }),
      getCurrentPositionAsync: async () => {
        throw new Error("FunctionCallException kCLErrorDomain error 0");
      },
    }),
  ).rejects.toThrow("Couldn't get your location");
});
test("permission API failures do not expose native exception stacks", async () => {
  await expect(
    locateOrigin({
      requestForegroundPermissionsAsync: async () => {
        throw Error("native");
      },
      getCurrentPositionAsync: jest.fn(),
    }),
  ).rejects.toThrow("Couldn't get your location");
});

test("phone diagnostics link a request to server logs without exposing its address", async () => {
  const logs = jest.spyOn(console, "info").mockImplementation(() => {});
  const fetcher = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ results: [] }),
  });
  try {
    await apiRequest(
      "/v1/search?q=Secret%20Street",
      "http://laptop",
      {},
      fetcher,
    );
    const id = new Headers(fetcher.mock.calls[0][1].headers).get(
      "X-Request-ID",
    );
    expect(id).toMatch(/^mobile-/);
    const events = logs.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "http.started",
          request_id: id,
          path: "/v1/search",
        }),
        expect.objectContaining({
          event: "http.completed",
          request_id: id,
          status: 200,
        }),
      ]),
    );
    expect(JSON.stringify(events)).not.toContain("Secret");
    expect(JSON.stringify(events)).not.toContain("http://laptop");
  } finally {
    logs.mockRestore();
  }
});

test("diagnostics classify network and response failures without copying exception text", async () => {
  const logs = jest.spyOn(console, "info").mockImplementation(() => {});
  try {
    await expect(
      apiRequest(
        "/unknown-secret-path",
        "http://laptop",
        {},
        jest.fn().mockRejectedValue(new Error("Secret")),
      ),
    ).rejects.toThrow("Secret");
    await expect(
      apiRequest(
        "/health",
        "http://laptop",
        {},
        jest.fn().mockResolvedValue({
          ok: true,
          json: async () => {
            throw SyntaxError("Secret");
          },
        }),
      ),
    ).rejects.toThrow("Secret");
    const events = logs.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "http.failed",
          path: "other",
          reason: "network",
        }),
        expect.objectContaining({
          event: "http.failed",
          path: "/health",
          reason: "response",
        }),
      ]),
    );
    expect(JSON.stringify(events)).not.toContain("Secret");
  } finally {
    logs.mockRestore();
  }
});
