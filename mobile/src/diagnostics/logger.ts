type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, string | number | boolean | null | undefined>;
const ranks = { debug: 0, info: 1, warn: 2, error: 3 };
const allowed = new Set([
  "request_id",
  "path",
  "method",
  "status",
  "duration_ms",
  "reason",
  "code",
  "results",
  "stage",
  "permission",
  "effective_at",
  "dataset_version",
  "profile",
  "mode",
  "enabled",
  "accuracy_m",
  "detail_available",
  "polygons",
  "generation",
]);
export function createDiagnostics({
  level = "info",
  limit = 200,
  sink = (line: string) => console.info(line),
}: {
  level?: Level | "off";
  limit?: number;
  sink?: (line: string) => void;
} = {}) {
  const entries: string[] = [];
  return {
    log(event: string, fields: Fields = {}, severity: Level = "info") {
      if (level === "off" || ranks[severity] < ranks[level]) return;
      const safe = Object.fromEntries(
        Object.entries(fields).filter(
          ([key, value]) => allowed.has(key) && value !== undefined,
        ),
      );
      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        level: severity,
        component: "mobile",
        event,
        ...safe,
      });
      entries.push(line);
      if (entries.length > limit) entries.shift();
      // Diagnostics must never make an otherwise successful action fail.
      try {
        sink(line);
      } catch {
        /* Console unavailable. */
      }
    },
    read: () => [...entries],
  };
}
const configured = process.env.EXPO_PUBLIC_LOG_LEVEL;
const level =
  configured === "off" ||
  configured === "debug" ||
  configured === "info" ||
  configured === "warn" ||
  configured === "error"
    ? configured
    : __DEV__
      ? "info"
      : "warn";
export const diagnostics = createDiagnostics({ level });
export const logEvent = diagnostics.log;
let sequence = 0;
export const requestId = () =>
  `mobile-${Date.now().toString(36)}-${++sequence}`;
