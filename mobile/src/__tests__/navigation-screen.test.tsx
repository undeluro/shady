import React from "react";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react-native";
import Navigation from "../app/navigation";
import { WalkSessionProvider, useWalkSession } from "../state/WalkSession";
import * as Location from "expo-location";
import demos from "../data/demo.json";
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));
jest.mock("expo-location", () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("../components/MapCanvas", () => () => null);
function Loaded({ saved = false }: { saved?: boolean }) {
  const { start, session } = useWalkSession();
  React.useEffect(() => {
    const sc = demos.scenarios[1];
    start({
      origin: sc.origin,
      destination: sc.destination,
      destinationLabel: "Wawel",
      route: sc.result.routes[0] as any,
      shadows: sc.shade as any,
      effectiveAt: sc.result.effective_at,
      demo: saved ? demos.map : undefined,
    });
  }, [start, saved]);
  return session ? <Navigation /> : null;
}
beforeEach(() => {
  jest.clearAllMocks();
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
});
test("live walking follows GPS, reports arrival, and removes the watch when stopped", async () => {
  let callback: any;
  const remove = jest.fn();
  (Location.watchPositionAsync as jest.Mock).mockImplementation(
    async (options, cb) => {
      callback = cb;
      return { remove };
    },
  );
  const view = render(
    <WalkSessionProvider>
      <Loaded />
    </WalkSessionProvider>,
  );
  await waitFor(() => expect(Location.watchPositionAsync).toHaveBeenCalled());
  const end = demos.scenarios[1].result.routes[0].geometry.coordinates.at(-1)!;
  act(() =>
    callback({ coords: { latitude: end[1], longitude: end[0], accuracy: 5 } }),
  );
  expect(screen.getByText("You made it.")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Finish walk" }));
  expect(mockBack).toHaveBeenCalled();
  view.unmount();
  expect(remove).toHaveBeenCalledTimes(1);
});
test("saved navigation remains explicitly a preview without requesting GPS", async () => {
  render(
    <WalkSessionProvider>
      <Loaded saved />
    </WalkSessionProvider>,
  );
  await screen.findByText("SAVED WALK PREVIEW");
  expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
});
test("navigation without a session has a usable way back", () => {
  render(
    <WalkSessionProvider>
      <Navigation />
    </WalkSessionProvider>,
  );
  fireEvent.press(screen.getByRole("button", { name: "Back to planning" }));
  expect(mockReplace).toHaveBeenCalledWith("/");
});
test("live navigation reports off-route fixes and inaccurate GPS without inventing progress", async () => {
  let callback: any;
  (Location.watchPositionAsync as jest.Mock).mockImplementation(
    async (options, cb) => {
      callback = cb;
      return { remove: jest.fn() };
    },
  );
  render(
    <WalkSessionProvider>
      <Loaded />
    </WalkSessionProvider>,
  );
  await waitFor(() => expect(Location.watchPositionAsync).toHaveBeenCalled());
  act(() =>
    callback({ coords: { latitude: 50.08, longitude: 19.99, accuracy: 5 } }),
  );
  expect(screen.getByText("You’re away from the path.")).toBeTruthy();
  expect(screen.queryByText("You made it.")).toBeNull();
  act(() =>
    callback({ coords: { latitude: 50.08, longitude: 19.99, accuracy: 100 } }),
  );
  expect(
    screen.getByText("Waiting for a more accurate location…"),
  ).toBeTruthy();
});
