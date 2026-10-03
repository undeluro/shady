import { prepareSnapshot } from "../client";
const route = {
  effective_at: "2026-07-01T11:00:00+00:00",
  dataset_version: "a",
  routes: [],
};
const shade = {
  effective_at: "2026-07-01T11:00:00Z",
  dataset_version: "a",
  shadows: { features: [] },
};
test("a route is not committed before its matching map snapshot arrives", async () => {
  let release: (value: unknown) => void = () => {};
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => route })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
  let committed = false;
  const pending = prepareSnapshot(
    "http://laptop",
    {
      origin: { latitude: 50, longitude: 19 },
      destination: { latitude: 50.1, longitude: 19 },
      departure_at: "2026-07-01T13:05:00+02:00",
    },
    "19,50,20,51",
    16,
    undefined,
    fetcher,
  ).then(() => {
    committed = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(committed).toBe(false);
  release({ ok: true, json: async () => shade });
  await pending;
  expect(committed).toBe(true);
});
test("incompatible server geometry is rejected and unavailable overlay is explicit", async () => {
  const fetcher = jest
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => route })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...shade, dataset_version: "b" }),
    });
  await expect(
    prepareSnapshot(
      "http://laptop",
      {} as any,
      "19,50,20,51",
      16,
      undefined,
      fetcher,
    ),
  ).rejects.toThrow("snapshots");
  const unavailable = jest
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => route })
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: "Overlay unavailable" } }),
    });
  const result = await prepareSnapshot(
    "http://laptop",
    {} as any,
    "19,50,20,51",
    16,
    undefined,
    unavailable,
  );
  expect(result.route).toEqual(route);
  expect(result.shade).toBeNull();
  expect(result.overlayError).toBe("Overlay unavailable");
});

test("cancelled snapshots are discarded and nonstandard overlay failures have a readable error", async () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = jest
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => route })
    .mockRejectedValueOnce(new Error("Cancelled"));
  await expect(
    prepareSnapshot(
      "http://laptop",
      {} as any,
      "19,50,20,51",
      16,
      controller.signal,
      cancelled,
    ),
  ).rejects.toThrow("Cancelled");
  const failed = jest
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => route })
    .mockRejectedValueOnce("offline");
  expect(
    (
      await prepareSnapshot(
        "http://laptop",
        {} as any,
        "19,50,20,51",
        16,
        undefined,
        failed,
      )
    ).overlayError,
  ).toBe("Shade overlay unavailable.");
});
