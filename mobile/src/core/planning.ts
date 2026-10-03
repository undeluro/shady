import type { RouteResult, ShadeResult } from "./types";
export type PlanningState = {
  status: "idle" | "loading" | "ready" | "error";
  requestId: string | null;
  result: RouteResult | null;
  shade: ShadeResult | null;
  error: string | null;
  selected: "shortest" | "shaded";
};
export const initialPlanning: PlanningState = {
  status: "idle",
  requestId: null,
  result: null,
  shade: null,
  error: null,
  selected: "shaded",
};
export type PlanningEvent =
  | { type: "request"; id: string }
  | {
      type: "success";
      id: string;
      result: RouteResult;
      shade?: ShadeResult | null;
    }
  | { type: "failure"; id: string; message: string }
  | { type: "select"; profile: "shortest" | "shaded" }
  | { type: "reset" };
export function planningReducer(
  state: PlanningState,
  event: PlanningEvent,
): PlanningState {
  switch (event.type) {
    case "request":
      return { ...state, status: "loading", requestId: event.id, error: null };
    case "success":
      return event.id === state.requestId
        ? {
            ...state,
            status: "ready",
            result: event.result,
            shade: event.shade ?? null,
            error: null,
          }
        : state;
    case "failure":
      return event.id === state.requestId
        ? { ...state, status: "error", error: event.message }
        : state;
    case "select":
      return { ...state, selected: event.profile };
    case "reset":
      return initialPlanning;
  }
}
export function timeBucket(timestamp: string): string {
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds) || !/(Z|[+-]\d{2}:\d{2})$/.test(timestamp))
    throw new Error("Choose a time with a timezone.");
  return new Date(Math.floor(milliseconds / 600000) * 600000).toISOString();
}
const warsawParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
export function warsawDeparture(date: string, minutes: number): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isInteger(minutes) ||
    minutes < 0 ||
    minutes >= 1440
  )
    throw new Error("Choose a valid date and time.");
  const midnight = Date.parse(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(midnight) ||
    new Date(midnight).toISOString().slice(0, 10) !== date
  )
    throw new Error("Choose a valid date.");
  const matches = [2, 1]
    .map((offset) => new Date(midnight + (minutes - offset * 60) * 60000))
    .filter((candidate) => {
      const parts = Object.fromEntries(
        warsawParts.formatToParts(candidate).map((p) => [p.type, p.value]),
      );
      return (
        `${parts.year}-${parts.month}-${parts.day}` === date &&
        Number(parts.hour) * 60 + Number(parts.minute) === minutes
      );
    });
  if (!matches.length)
    throw new Error(
      "This time does not exist when clocks change. Choose another time.",
    );
  return matches[0].toISOString();
}
