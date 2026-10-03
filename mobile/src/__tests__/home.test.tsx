import React from "react";
import {
  render,
  fireEvent,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Home from "../app/index";
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("../components/MapCanvas", () => () => null);
jest.mock("@react-native-community/slider", () => () => null);
jest.mock("@gorhom/bottom-sheet", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Jest factories run before imports.
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
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <Home />
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
  globalThis.fetch = jest
    .fn()
    .mockResolvedValue({
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
