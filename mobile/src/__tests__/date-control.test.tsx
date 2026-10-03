import React from "react";
import { render, fireEvent, screen } from "@testing-library/react-native";
import { Platform } from "react-native";
import DateControl from "../components/DateControl";
jest.mock("@react-native-community/datetimepicker", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Native picker boundary.
  const { View } = require("react-native");
  return function MockPicker(props: any) {
    return <View testID="picker" {...props} />;
  };
});
test("picking a departure date uses the value callback without a deprecation warning", () => {
  const change = jest.fn();
  render(<DateControl date="2026-07-01" onChange={change} />);
  if (Platform.OS !== "ios") fireEvent.press(screen.getByRole("button"));
  const picker = screen.getByTestId("picker");
  expect(picker.props.onChange).toBeUndefined();
  fireEvent(picker, "onValueChange", {}, new Date(2026, 6, 4, 12));
  expect(change).toHaveBeenCalledWith("2026-07-04");
});

test("dismissing the Android picker leaves the selected date unchanged", () => {
  const previous = Platform.OS;
  Object.defineProperty(Platform, "OS", {
    value: "android",
    configurable: true,
  });
  try {
    const change = jest.fn();
    render(<DateControl date="2026-07-01" onChange={change} />);
    fireEvent.press(screen.getByRole("button"));
    fireEvent(screen.getByTestId("picker"), "onDismiss");
    expect(change).not.toHaveBeenCalled();
    expect(screen.queryByTestId("picker")).toBeNull();
  } finally {
    Object.defineProperty(Platform, "OS", {
      value: previous,
      configurable: true,
    });
  }
});
