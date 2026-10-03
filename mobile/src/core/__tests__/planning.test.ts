import {
  planningReducer,
  initialPlanning,
  timeBucket,
  warsawDeparture,
} from "../planning";

test("a late result cannot replace a newer request", () => {
  const state = planningReducer(initialPlanning, {
    type: "request",
    id: "new",
  });
  const next = planningReducer(state, {
    type: "success",
    id: "old",
    result: {} as any,
  });
  expect(next.status).toBe("loading");
  expect(next.result).toBeNull();
});

test("equivalent timezone offsets identify the same shade snapshot", () => {
  expect(timeBucket("2026-07-01T12:09:00+02:00")).toBe(
    "2026-07-01T10:00:00.000Z",
  );
});

test("a new request retains the previous result with an updating state", () => {
  const result = { routes: [] } as any;
  let state = planningReducer(initialPlanning, { type: "request", id: "a" });
  state = planningReducer(state, { type: "success", id: "a", result });
  expect(state.status).toBe("ready");
  state = planningReducer(state, { type: "request", id: "b" });
  expect(state.result).toBe(result);
  expect(state.status).toBe("loading");
  expect(
    planningReducer(state, { type: "failure", id: "a", message: "late" }),
  ).toBe(state);
  state = planningReducer(state, {
    type: "failure",
    id: "b",
    message: "No path",
  });
  expect(state.error).toBe("No path");
  expect(state.status).toBe("error");
  expect(state.result).toBeNull();
  expect(state.shade).toBeNull();
  expect(
    planningReducer(state, { type: "select", profile: "shortest" }).selected,
  ).toBe("shortest");
  expect(planningReducer(state, { type: "reset" })).toEqual(initialPlanning);
});
test.each(["not a date", "2026-07-01T12:00:00"])(
  "invalid or ambiguous time is rejected: %s",
  (timestamp) => {
    expect(() => timeBucket(timestamp)).toThrow("timezone");
  },
);

test("summer and winter departure dates use the Warsaw offset", () => {
  expect(warsawDeparture("2026-07-01", 780)).toBe("2026-07-01T11:00:00.000Z");
  expect(warsawDeparture("2026-01-01", 780)).toBe("2026-01-01T12:00:00.000Z");
});
test("impossible dates and missing daylight-saving times are rejected", () => {
  expect(() => warsawDeparture("2026-02-30", 780)).toThrow("valid");
  expect(() => warsawDeparture("bad", 780)).toThrow("valid");
  expect(() => warsawDeparture("2026-03-29", 150)).toThrow("exist");
  expect(() => warsawDeparture("2026-07-01", -1)).toThrow("valid");
});

test("a matching map is retained with the successful route snapshot", () => {
  const result = {} as any,
    shade = {} as any;
  const loading = planningReducer(initialPlanning, {
    type: "request",
    id: "a",
  });
  const ready = planningReducer(loading, {
    type: "success",
    id: "a",
    result,
    shade,
  });
  expect(ready.shade).toBe(shade);
  expect(planningReducer(ready, { type: "request", id: "b" }).shade).toBe(
    shade,
  );
});
