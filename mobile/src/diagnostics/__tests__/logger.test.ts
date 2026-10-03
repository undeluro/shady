import { createDiagnostics } from "../logger";
test("diagnostics retain bounded, independent copies and omit private fields", () => {
  const sink = jest.fn();
  const logs = createDiagnostics({ level: "debug", limit: 2, sink });
  logs.log("first", {
    latitude: 50,
    address: "Secret",
    request_id: "safe",
    status: undefined,
  });
  expect(JSON.parse(sink.mock.calls[0][0])).toEqual(
    expect.objectContaining({ request_id: "safe", event: "first" }),
  );
  expect(sink.mock.calls[0][0]).not.toContain("Secret");
  expect(sink.mock.calls[0][0]).not.toContain("latitude");
  logs.log("second", {}, "debug");
  logs.log("third", {}, "warn");
  const copy = logs.read();
  copy.pop();
  expect(logs.read().map((line) => JSON.parse(line).event)).toEqual([
    "second",
    "third",
  ]);
});
test("level controls suppress noise and logger sink failure never interrupts the app", () => {
  const sink = jest.fn();
  const off = createDiagnostics({ level: "off", sink });
  off.log("ignored", {}, "error");
  const warnings = createDiagnostics({ level: "warn", sink });
  warnings.log("ignored");
  warnings.log("kept", {}, "error");
  expect(sink).toHaveBeenCalledTimes(1);
  const broken = createDiagnostics({
    sink: () => {
      throw Error("console offline");
    },
  });
  expect(() => broken.log("still works")).not.toThrow();
  expect(broken.read()).toHaveLength(1);
});
