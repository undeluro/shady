import type { Coordinate, RouteResult, ShadeResult } from "./types";
export async function apiRequest<T>(
  path: string,
  base: string,
  options: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const response = await fetcher(base + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error?.message ?? "The server could not complete this request.",
    );
  return data as T;
}
type LocationBoundary = {
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: () => Promise<{ coords: Coordinate }>;
};
export async function locateOrigin(
  location: LocationBoundary,
): Promise<Coordinate> {
  let permission;
  try {
    permission = await location.requestForegroundPermissionsAsync();
  } catch {
    throw new Error(
      "Couldn't get your location. Check Location Services, or choose your start on the map.",
    );
  }
  if (permission.status !== "granted")
    throw new Error("Location access is off. Choose your start on the map.");
  try {
    const result = await location.getCurrentPositionAsync();
    return {
      latitude: result.coords.latitude,
      longitude: result.coords.longitude,
    };
  } catch {
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
  if (!compatibleShade(route, shade))
    throw new Error("The map and route snapshots do not match. Try again.");
  return { route, shade, overlayError: null };
}
