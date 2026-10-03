import React from "react";
import {
  render,
  fireEvent,
  screen,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react-native";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import { WalkSessionProvider, useWalkSession } from "../state/WalkSession";
import Home from "../app/index";
import demos from "../data/demo.json";
import * as Location from "expo-location";
jest.mock("react-native-reanimated", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest native boundary factory.
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest native boundary factory.
  const { View } = require("react-native");
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (value: any) => React.useRef({ value }).current,
    useAnimatedStyle: (compute: any) => compute(),
  };
});
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("expo-location", () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
const mockMap = jest.fn();
jest.mock("../components/MapCanvas", () => (props: any) => {
  mockMap(props);
  return null;
});
jest.mock("@react-native-community/slider", () => () => null);
jest.mock("@gorhom/bottom-sheet", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest native boundary factory.
  const React = require("react");
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Mock the native boundary within the factory.
  const { ScrollView } = require("react-native");
  return {
    __esModule: true,
    default: React.forwardRef(function MockBottomSheet(
      { children }: any,
      ref: any,
    ) {
      React.useImperativeHandle(ref, () => ({ snapToIndex: () => {} }));
      return children;
    }),
    BottomSheetScrollView: ScrollView,
    useBottomSheetSpringConfigs: (config: any) => config,
  };
});
const clients: QueryClient[] = [];
const fetchBefore = globalThis.fetch;
beforeAll(() => notifyManager.setNotifyFunction((callback) => act(callback)));
afterAll(() => notifyManager.setNotifyFunction((callback) => callback()));
beforeEach(() => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ sources: [], dataset_version: "test" }),
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  globalThis.fetch = fetchBefore;
});
function mount(observer?: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <WalkSessionProvider>
        <Home />
        {observer}
      </WalkSessionProvider>
    </QueryClientProvider>,
  );
}
test("saved demo visibly labels its mode and supports switching route cards", async () => {
  mount();
  fireEvent.press(screen.getByText("13:00"));
  await waitFor(() => expect(screen.getByText("SAVED DEMO")).toBeTruthy());
  fireEvent.press(screen.getByRole("button", { name: /Shortest,/ }));
  expect(
    screen.getByRole("button", { name: /Shortest,/ }).props.accessibilityState
      .selected,
  ).toBe(true);
  expect(screen.getByText(/Departure estimate/)).toBeTruthy();
});
test("search is submitted explicitly and failures never create a demo", async () => {
  globalThis.fetch = jest.fn().mockImplementation((url: string) =>
    Promise.resolve({
      ok: !url.includes("/search"),
      json: async () =>
        url.includes("/search")
          ? { error: { message: "Search unavailable" } }
          : { sources: [] },
    }),
  );
  mount();
  fireEvent.press(screen.getByRole("button", { name: "Search destination" }));
  fireEvent.changeText(
    screen.getByLabelText("Submitted address search"),
    "Wawel",
  );
  expect(
    (globalThis.fetch as jest.Mock).mock.calls.some(([url]) =>
      url.includes("/search"),
    ),
  ).toBe(false);
  fireEvent.press(screen.getByRole("button", { name: "Search" }));
  await screen.findByText("Search unavailable");
  expect(screen.queryByText("SAVED DEMO")).toBeNull();
});

test("a saved walk works with the backend offline and going live shows its real failure", async () => {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: { message: "Live server offline" } }),
  });
  mount();
  fireEvent.press(screen.getByText("13:00"));
  await screen.findByText("SAVED DEMO");
  expect(
    (globalThis.fetch as jest.Mock).mock.calls.some(([url]) =>
      url.includes("/routes"),
    ),
  ).toBe(false);
  fireEvent.press(
    screen.getByRole("button", { name: "Switch to live planning" }),
  );
  await waitFor(() =>
    expect(screen.getAllByText("Live server offline").length).toBeGreaterThan(
      0,
    ),
  );
  expect(screen.queryByText("SAVED DEMO")).toBeNull();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
test("a destination search cannot populate a newly opened origin panel", async () => {
  const old = deferred<any>();
  globalThis.fetch = jest
    .fn()
    .mockImplementation((url: string) =>
      url.includes("/search")
        ? old.promise
        : Promise.resolve({ ok: true, json: async () => ({ sources: [] }) }),
    );
  mount();
  fireEvent.press(screen.getByRole("button", { name: "Search destination" }));
  fireEvent.changeText(
    screen.getByLabelText("Submitted address search"),
    "Wawel",
  );
  fireEvent.press(screen.getByRole("button", { name: "Search" }));
  fireEvent.press(screen.getByRole("button", { name: "Close" }));
  fireEvent.press(
    screen.getByRole("button", { name: "Change starting point" }),
  );
  await act(async () =>
    old.resolve({
      ok: true,
      json: async () => ({
        results: [
          {
            id: "old",
            name: "Old destination result",
            latitude: 50,
            longitude: 20,
          },
        ],
      }),
    }),
  );
  expect(screen.queryByText("Old destination result")).toBeNull();
});
test("late GPS cannot replace a deliberately selected saved walk", async () => {
  const location = deferred<any>();
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockReturnValue(
    location.promise,
  );
  mount();
  fireEvent.press(screen.getByRole("button", { name: "Use my location" }));
  await waitFor(() =>
    expect(Location.getCurrentPositionAsync).toHaveBeenCalled(),
  );
  fireEvent.press(screen.getByText("13:00"));
  await screen.findByText("SAVED DEMO");
  await act(async () =>
    location.resolve({ coords: { latitude: 50.1, longitude: 20 } }),
  );
  expect(screen.getByText("SAVED DEMO")).toBeTruthy();
  expect(screen.queryByText(/From Your location/)).toBeNull();
});

test("a failed replan clears old route cards instead of pairing them with new endpoints", async () => {
  let routes = 0,
    searches = 0;
  const fixture = demos.scenarios[1];
  globalThis.fetch = jest.fn().mockImplementation((url: string) => {
    let data: any = { sources: [] },
      ok = true;
    if (url.includes("/routes")) {
      routes++;
      ok = routes === 1;
      data = ok
        ? fixture.result
        : { error: { message: "New destination has no path" } };
    } else if (url.includes("/shade")) data = fixture.shade;
    else if (url.includes("/search")) {
      searches++;
      data = {
        results: [
          {
            id: String(searches),
            name: searches === 1 ? "First destination B" : "New destination C",
            latitude: searches === 1 ? 50.0542 : 50.1,
            longitude: 19.9356,
          },
        ],
      };
    }
    return Promise.resolve({ ok, json: async () => data });
  });
  mount();
  const chooseDestination = async (name: string) => {
    fireEvent.press(screen.getByRole("button", { name: "Search destination" }));
    fireEvent.changeText(
      screen.getByLabelText("Submitted address search"),
      name,
    );
    fireEvent.press(screen.getByRole("button", { name: "Search" }));
    fireEvent.press(await screen.findByText(name));
  };
  await chooseDestination("First destination B");
  await screen.findByRole("button", { name: /More shade,/ });
  await chooseDestination("New destination C");
  await waitFor(() =>
    expect(
      screen.getAllByText("New destination has no path").length,
    ).toBeGreaterThan(0),
  );
  expect(screen.queryByRole("button", { name: /More shade,/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Shortest,/ })).toBeNull();
  expect(screen.getByText("New destination C")).toBeTruthy();
});

test("the exposure legend appears only for a displayed route", async () => {
  mount();
  expect(screen.queryByText("Shade")).toBeNull();
  expect(screen.queryByText("Sun")).toBeNull();
  fireEvent.press(screen.getByText("13:00"));
  await screen.findByText("SAVED DEMO");
  expect(screen.getByText("Shade")).toBeTruthy();
  expect(screen.getByText("Sun")).toBeTruthy();
});
test("the departure control renders its mixed text children in a text container", () => {
  mount();
  expect(screen.getByText(/Now/)).toBeTruthy();
});
test("starting a saved preview passes the selected route and its effective snapshot to navigation", async () => {
  let selected: any;
  function Observe() {
    selected = useWalkSession().session;
    return null;
  }
  mount(<Observe />);
  fireEvent.press(screen.getByText("13:00"));
  await screen.findByText("SAVED DEMO");
  fireEvent.press(screen.getByRole("button", { name: /Shortest,/ }));
  fireEvent.press(screen.getByRole("button", { name: "Preview saved walk" }));
  expect(selected.route.profile).toBe("shortest");
  expect(selected.effectiveAt).toBe(demos.scenarios[1].result.effective_at);
  expect(selected.demo).toBeTruthy();
  expect(mockPush).toHaveBeenCalledWith("/navigation");
});
test("a successful GPS press moves the camera even if the starting coordinate is unchanged", async () => {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
    status: "granted",
  });
  (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
    coords: { latitude: 50.0617, longitude: 19.9373 },
  });
  mount();
  fireEvent.press(screen.getByRole("button", { name: "Use my location" }));
  await waitFor(() =>
    expect(mockMap.mock.calls.at(-1)![0].cameraTarget?.coordinate).toEqual({
      latitude: 50.0617,
      longitude: 19.9373,
    }),
  );
  const first = mockMap.mock.calls.at(-1)![0].cameraTarget.id;
  fireEvent.press(screen.getByRole("button", { name: "Use my location" }));
  await waitFor(() =>
    expect(mockMap.mock.calls.at(-1)![0].cameraTarget.id).toBeGreaterThan(
      first,
    ),
  );
});
