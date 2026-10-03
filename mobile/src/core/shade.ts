import type { ShadeModel } from "./types";

export const WOODLAND_COLOR = "#659F68";
export function exposureColor(exposure: unknown): string {
  if (exposure === "shaded") return "#168575";
  if (exposure === "woodland") return WOODLAND_COLOR;
  if (exposure === "sunny") return "#FFC857";
  return "#577B74";
}
export function shadeFillColor(source: unknown): string {
  return source === "woodland"
    ? "rgba(101,159,104,0.20)"
    : "rgba(22,133,117,0.24)";
}
export function shadeExplanation(
  model?: ShadeModel,
  status = "available",
): string {
  if (status !== "available")
    return "Shade is unavailable at this departure time.";
  if (!model) return "Buildings only. Trees aren't included.";
  if (model.woodland_status === "leaf_on")
    return "Buildings + likely tree shade. Summer foliage estimate; gaps may be sunny.";
  if (model.woodland_status === "off_season")
    return "Buildings only outside May–September. Tree shade is not estimated.";
  return "Buildings only. Tree shade data isn't loaded.";
}
