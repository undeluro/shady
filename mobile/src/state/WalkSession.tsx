import { createContext, useContext, useState, type ReactNode } from "react";
import type { Coordinate, Route, ShadeResult } from "../core/types";
import type { MapProps } from "../components/MapCanvas.types";
export type WalkSession = {
  origin: Coordinate;
  destination: Coordinate;
  destinationLabel: string;
  route: Route;
  shadows: ShadeResult | null;
  effectiveAt: string;
  demo?: MapProps["demo"];
};
const Context = createContext<{
  session: WalkSession | null;
  start: (walk: WalkSession) => void;
}>({ session: null, start: () => {} });
export function WalkSessionProvider({ children }: { children: ReactNode }) {
  const [session, start] = useState<WalkSession | null>(null);
  return (
    <Context.Provider value={{ session, start }}>{children}</Context.Provider>
  );
}
export const useWalkSession = () => useContext(Context);
