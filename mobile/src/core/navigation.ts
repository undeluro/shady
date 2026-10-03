import type { Coordinate, Route } from "./types";
export type WalkProgress = {
  fraction: number;
  remaining_m: number;
  remaining_s: number;
  offset_m: number;
  offRoute: boolean;
  arrived: boolean;
};
/** Local metric projection over Kraków; progress is measured along the selected route. */
export function walkProgress(
  route: Route,
  fix: Coordinate & { accuracy: number | null },
  previousFraction = 0,
): WalkProgress | null {
  if (
    !Number.isFinite(fix.latitude) ||
    !Number.isFinite(fix.longitude) ||
    fix.accuracy === null ||
    !Number.isFinite(fix.accuracy) ||
    fix.accuracy < 0 ||
    fix.accuracy > 50 ||
    route.geometry.coordinates.length < 2
  )
    return null;
  const coords = route.geometry.coordinates;
  const yScale = 111195,
    xScale = yScale * Math.cos((coords[0][1] * Math.PI) / 180);
  const metric = ([lon, lat]: number[]) => [
    (lon - coords[0][0]) * xScale,
    (lat - coords[0][1]) * yScale,
  ];
  const points = coords.map(metric),
    p = metric([fix.longitude, fix.latitude]);
  const lengths = points
    .slice(1)
    .map((b, i) => Math.hypot(b[0] - points[i][0], b[1] - points[i][1]));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total) || total === 0) return null;
  let travelled = 0,
    bestDistance = Infinity,
    bestAlong = 0;
  for (let i = 0; i < lengths.length; i++) {
    const a = points[i],
      b = points[i + 1],
      length = lengths[i];
    if (length === 0) continue;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) /
          (length * length),
      ),
    );
    const distance = Math.hypot(
      p[0] - a[0] - t * (b[0] - a[0]),
      p[1] - a[1] - t * (b[1] - a[1]),
    );
    const along = travelled + t * length;
    if (
      distance < bestDistance - 0.001 ||
      (Math.abs(distance - bestDistance) <= 0.001 &&
        Math.abs(along - previousFraction * total) <
          Math.abs(bestAlong - previousFraction * total))
    ) {
      bestDistance = distance;
      bestAlong = along;
    }
    travelled += length;
  }
  const offRoute = bestDistance > 35;
  // Keep remaining metrics anchored to the last reliable route position when off route.
  const fraction = offRoute ? previousFraction : bestAlong / total;
  const last = points[points.length - 1];
  return {
    fraction,
    remaining_m: route.distance_m * (1 - fraction),
    remaining_s: route.duration_s * (1 - fraction),
    offset_m: bestDistance,
    offRoute,
    arrived:
      !offRoute &&
      fraction > 0.98 &&
      Math.hypot(p[0] - last[0], p[1] - last[1]) < 20,
  };
}
