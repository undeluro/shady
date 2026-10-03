import { logEvent } from "../diagnostics/logger";
import type { Coordinate } from "./types";
export type WalkingFix = Coordinate & { accuracy: number | null };
type TrackingBoundary = {
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  watch: (
    onFix: (fix: WalkingFix) => void,
    onError: () => void,
  ) => Promise<{ remove: () => void }>;
};
export function startTracking(
  location: TrackingBoundary,
  onFix: (fix: WalkingFix) => void,
  onError: (message: string) => void,
): () => void {
  logEvent("tracking.requested");
  let active = true,
    subscription: { remove: () => void } | undefined;
  const fail = () => {
    if (active) {
      logEvent("tracking.failed", {}, "warn");
      onError(
        "Location is unavailable. Check Location Services and try again.",
      );
    }
  };
  void (async () => {
    try {
      const permission = await location.requestForegroundPermissionsAsync();
      if (!active) return;
      logEvent("tracking.permission", { permission: permission.status });
      if (permission.status !== "granted") {
        onError("Location access is off. Allow location to follow your walk.");
        return;
      }
      const started = await location.watch((fix) => {
        if (active) onFix(fix);
      }, fail);
      if (!active) started.remove();
      else {
        subscription = started;
        logEvent("tracking.started");
      }
    } catch {
      fail();
    }
  })();
  return () => {
    active = false;
    subscription?.remove();
    logEvent("tracking.stopped");
  };
}
