import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect } from "react-native-svg";
/** SVG keeps this backdrop available in Expo Go, native builds and web. */
export function TopFade({ height = 235 }: { height?: number }) {
  return (
    <View pointerEvents="none" style={[styles.fade, { height }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="top-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F5FAF8" stopOpacity={0.97} />
            <Stop offset="0.48" stopColor="#F5FAF8" stopOpacity={0.82} />
            <Stop offset="1" stopColor="#F5FAF8" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#top-fade)" />
      </Svg>
    </View>
  );
}
const styles = StyleSheet.create({
  fade: { position: "absolute", top: 0, left: 0, right: 0 },
});
