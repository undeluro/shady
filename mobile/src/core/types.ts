export type Coordinate = { latitude: number; longitude: number };
export type Line = { type: "LineString"; coordinates: number[][] };
export type Polygon = { type: "Polygon"; coordinates: number[][][] };
export type Feature<G> = {
  type: "Feature";
  geometry: G;
  properties: Record<string, unknown>;
};
export type Collection<G> = {
  type: "FeatureCollection";
  features: Feature<G>[];
};
export type Route = {
  profile: "shortest" | "shaded";
  distance_m: number;
  duration_s: number;
  shaded_m: number | null;
  sunny_m: number | null;
  shade_pct: number | null;
  geometry: Line;
  segments: Collection<Line>;
};
export type RouteResult = {
  effective_at: string;
  dataset_version: string;
  shade_status: "available" | "night" | "low_sun";
  routes: Route[];
  recommendation_status: "improved" | "no_improvement";
  added_minutes: number;
  sunny_m_saved: number | null;
  snapped_endpoints: { coordinates: number[]; offset_m: number }[];
};
export type ShadeResult = {
  display_path?: string;
  effective_at: string;
  dataset_version: string;
  detail_available: boolean;
  shade_status: string;
  shadows: Collection<Polygon>;
};
export type SearchResult = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};
export type Metadata = {
  dataset_version: string;
  sources: { name: string; license: string; url: string }[];
  coverage_polygon: Polygon;
  bounds: number[];
  timezone: string;
};
export type MapRegion = Coordinate & {
  latitudeDelta: number;
  longitudeDelta: number;
};
