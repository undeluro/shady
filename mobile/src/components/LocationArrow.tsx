import Svg, { Path } from "react-native-svg";
export function LocationArrow({ color = "#123B35" }: { color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Path
        d="M20.5 3.5 14 21l-3.3-7.7L3 10z"
        fill={color}
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
