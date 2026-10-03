import { exposureColor, shadeFillColor, shadeExplanation } from "../shade";

test("tree estimates have a distinct color and clear source explanation", () => {
  expect(exposureColor("shaded")).toBe("#168575");
  expect(exposureColor("woodland")).toBe("#659F68");
  expect(exposureColor("sunny")).toBe("#FFC857");
  expect(exposureColor("unavailable")).toBe("#577B74");
  expect(shadeFillColor("woodland")).toBe("rgba(101,159,104,0.20)");
  expect(shadeFillColor(undefined)).toBe("rgba(22,133,117,0.24)");
  expect(
    shadeExplanation({
      woodland_status: "leaf_on",
      woodland_weight: 0.5,
      leaf_on_months: [5, 6, 7, 8, 9],
    }),
  ).toBe(
    "Buildings + likely tree shade. Summer foliage estimate; gaps may be sunny.",
  );
  expect(
    shadeExplanation({
      woodland_status: "off_season",
      woodland_weight: 0.5,
      leaf_on_months: [5, 6, 7, 8, 9],
    }),
  ).toBe("Buildings only outside May–September. Tree shade is not estimated.");
  expect(
    shadeExplanation({
      woodland_status: "not_loaded",
      woodland_weight: 0.5,
      leaf_on_months: [5, 6, 7, 8, 9],
    }),
  ).toBe("Buildings only. Tree shade data isn't loaded.");
  expect(shadeExplanation()).toBe("Buildings only. Trees aren't included.");
});

test("night and low sun explanations do not claim available tree shade", () => {
  const model = {
    woodland_status: "leaf_on" as const,
    woodland_weight: 0.5,
    leaf_on_months: [5, 6, 7, 8, 9],
  };
  expect(shadeExplanation(model, "night")).toBe(
    "Shade is unavailable at this departure time.",
  );
  expect(shadeExplanation(model, "low_sun")).toBe(
    "Shade is unavailable at this departure time.",
  );
});
