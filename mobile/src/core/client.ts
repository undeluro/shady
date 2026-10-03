import { logEvent, requestId } from "../diagnostics/logger";
import type { Coordinate, RouteResult, ShadeResult } from "./types";
export async function apiRequest<T>(
  path: string,
  base: string,
  options: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const id = requestId(),
    started = Date.now();
  const endpoint = path.split("?")[0];
  const loggedPath = [
    "/health",
    "/v1/metadata",
    "/v1/search",
    "/v1/routes",
    "/v1/shade",
  ].includes(endpoint)
    ? endpoint
    : "other";
  const method = options.method ?? "GET";
  const fields = { request_id: id, path: loggedPath, method };
  logEvent("http.started", fields);
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Request-ID", id);
  let stage = "network";
  try {
    const response = await fetcher(base + path, { ...options, headers });
    stage = "response";
    const data = await response.json();
    const correlation = response.headers?.get("X-Request-ID") ?? id;
    logEvent(
      "http.completed",
      {
        ...fields,
        request_id: correlation,
        status: response.status,
        duration_ms: Date.now() - started,
      },
      response.ok ? "info" : "warn",
    );
    stage = "http";
    if (!response.ok)
      throw new Error(
        data.error?.message ?? "The server could not complete this request.",
      );
    return data as T;
  } catch (error) {
    logEvent(
      options.signal?.aborted ? "http.cancelled" : "http.failed",
      {
        ...fields,
        reason: stage,
        duration_ms: Date.now() - started,
      },
      options.signal?.aborted ? "debug" : "warn",
    );
    throw error;
  }
}
type LocationBoundary = {
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: () => Promise<{ coords: Coordinate }>;
};
export async function locateOrigin(
  location: LocationBoundary,
): Promise<Coordinate> {
  logEvent("location.requested");
  let permission;
  try {
    permission = await location.requestForegroundPermissionsAsync();
  } catch {
    logEvent("location.failed", { stage: "permission" }, "warn");
    throw new Error(
      "Couldn't get your location. Check Location Services, or choose your start on the map.",
    );
  }
  logEvent("location.permission", { permission: permission.status });
  if (permission.status !== "granted")
    throw new Error("Location access is off. Choose your start on the map.");
  try {
    const result = await location.getCurrentPositionAsync();
    logEvent("location.acquired");
    return {
      latitude: result.coords.latitude,
      longitude: result.coords.longitude,
    };
  } catch {
    logEvent("location.failed", { stage: "fix" }, "warn");
    throw new Error(
      "Couldn't get your location. Check Location Services, or choose your start on the map.",
    );
  }
}
export function compatibleShade(
  route: RouteResult,
  shade: ShadeResult,
): boolean {
  return (
    route.dataset_version === shade.dataset_version &&
    Date.parse(route.effective_at) === Date.parse(shade.effective_at)
  );
}
export type Snapshot = {
  route: RouteResult;
  shade: ShadeResult | null;
  overlayError: string | null;
};
export async function prepareSnapshot(
  base: string,
  request: {
    origin: Coordinate;
    destination: Coordinate;
    departure_at: string;
  },
  bbox: string,
  zoom: number,
  signal?: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Snapshot> {
  const route = await apiRequest<RouteResult>(
    "/v1/routes",
    base,
    { method: "POST", body: JSON.stringify(request), signal },
    fetcher,
  );
  let shade: ShadeResult;
  try {
    shade = await apiRequest<ShadeResult>(
      `/v1/shade?bbox=${bbox}&departure_at=${encodeURIComponent(route.effective_at)}&zoom=${zoom}`,
      base,
      { signal },
      fetcher,
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      route,
      shade: null,
      overlayError:
        error instanceof Error ? error.message : "Shade overlay unavailable.",
    };
  }
  if (!compatibleShade(route, shade)) {
    logEvent("snapshot.mismatch", {}, "error");
    throw new Error("The map and route snapshots do not match. Try again.");
  }
  logEvent("snapshot.ready", {
    effective_at: route.effective_at,
    dataset_version: route.dataset_version,
  });
  return { route, shade, overlayError: null };
}
