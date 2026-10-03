import Svg, { Circle, Path, G } from "react-native-svg";
export function Sun({ size = 50 }: { size?: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      accessibilityLabel="Shady smiling sun"
    >
      <G stroke="#FFC857" strokeWidth={5} strokeLinecap="round">
        <Path d="M40 5v8M40 67v8M5 40h8M67 40h8M15 15l6 6M59 59l6 6M15 65l6-6M59 21l6-6" />
      </G>
      <Circle cx={40} cy={40} r={23} fill="#FFC857" />
      <Path
        d="M29 36v3M49 36v3M31 48q9 9 18 0"
        stroke="#123B35"
        strokeWidth={3}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
