import type { Coordinate, MapRegion, Route, ShadeResult } from "../core/types";
export type MapProps = {
  reduceMotion?: boolean;
  cameraTarget?: { coordinate: Coordinate; id: number };
  location?: Coordinate;
  onPan?: () => void;
  origin: Coordinate;
  destination: Coordinate | null;
  route: Route | null;
  shadows: ShadeResult | null;
  showShade: boolean;
  onPin: (p: Coordinate) => void;
  onRegion: (r: MapRegion) => void;
  demo?: {
    bounds: number[];
    roadsPath: string;
    buildingsPath: string;
  };
};
