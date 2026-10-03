import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import MapCanvas from "../components/MapCanvas";
import { TopFade } from "../components/TopFade";
import { LocationArrow } from "../components/LocationArrow";
import { Sun } from "../components/Sun";
import { useWalkSession } from "../state/WalkSession";
import { walkProgress, type WalkProgress } from "../core/navigation";
import { startTracking, type WalkingFix } from "../core/tracking";
import type { MapProps } from "../components/MapCanvas.types";
export default function Navigation() {
  const { session } = useWalkSession();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [position, setPosition] = useState<WalkingFix | null>(null),
    [progress, setProgress] = useState<WalkProgress | null>(null);
  const previous = useRef(0),
    follow = useRef(true),
    sequence = useRef(0);
  const [following, setFollowing] = useState(true),
    [cameraTarget, setCameraTarget] = useState<MapProps["cameraTarget"]>();
  const [error, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0),
    [reduceMotion, setReduceMotion] = useState(false);
  const [panelHeight, setPanelHeight] = useState(270);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduceMotion(value);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  useEffect(() => {
    if (!session || session.demo) return;
    return startTracking(
      {
        requestForegroundPermissionsAsync:
          Location.requestForegroundPermissionsAsync,
        watch: (onFix, onError) =>
          Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              distanceInterval: 3,
              timeInterval: 2000,
            },
            (fix) => onFix(fix.coords),
            onError,
          ),
      },
      (fix) => {
        const next = walkProgress(session.route, fix, previous.current);
        if (!next) {
          setError("Waiting for a more accurate location…");
          return;
        }
        setError(null);
        setPosition(fix);
        setProgress(next);
        if (!next.offRoute) previous.current = next.fraction;
        if (follow.current)
          setCameraTarget({ coordinate: fix, id: ++sequence.current });
      },
      setError,
    );
  }, [session, retry]);
  if (!session)
    return (
      <View style={[s.empty, { paddingTop: insets.top + 40 }]}>
        <Sun size={64} />
        <Text style={s.title}>Choose a walk first.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to planning"
          style={s.primary}
          onPress={() => router.replace("/")}
        >
          <Text style={s.primaryText}>Back to planning</Text>
        </Pressable>
      </View>
    );
  const saved = !!session.demo,
    arrived = !!progress?.arrived;
  const remaining = progress?.remaining_m ?? session.route.distance_m;
  const minutes = Math.max(
    1,
    Math.round((progress?.remaining_s ?? session.route.duration_s) / 60),
  );
  const stop = () => router.back();
  return (
    <View style={s.root}>
      <MapCanvas
        origin={session.origin}
        destination={session.destination}
        route={session.route}
        shadows={session.shadows}
        showShade
        reduceMotion={reduceMotion}
        demo={session.demo}
        location={position ?? undefined}
        cameraTarget={cameraTarget}
        onPin={() => {}}
        onRegion={() => {}}
        onPan={() => {
          follow.current = false;
          setFollowing(false);
        }}
      />
      <TopFade height={insets.top + 220} />
      <View style={[s.top, { top: insets.top + 12 }]}>
        <View style={s.heading}>
          <Text style={s.brand}>
            shady<Text style={{ color: "#168575" }}>.</Text>
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="End walk"
            style={s.icon}
            onPress={stop}
          >
            <Text style={s.close}>×</Text>
          </Pressable>
        </View>
        <View style={s.guide}>
          <View style={s.guideIcon}>
            <LocationArrow color="#168575" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>
              {saved ? "SAVED WALK PREVIEW" : "YOUR WALK"}
            </Text>
            <Text style={s.title}>
              {arrived
                ? "You made it."
                : progress?.offRoute
                  ? "You’re away from the path."
                  : "Follow the highlighted path."}
            </Text>
            <Text style={s.subtitle}>
              {arrived
                ? session.destinationLabel
                : progress?.offRoute
                  ? `${Math.round(progress.offset_m)} m from your route. Return to the highlighted path.`
                  : `Towards ${session.destinationLabel}`}
            </Text>
          </View>
        </View>
      </View>
      {!saved && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recenter on my location"
          accessibilityState={{ selected: following, disabled: !position }}
          disabled={!position}
          onPress={() => {
            follow.current = true;
            setFollowing(true);
            if (position)
              setCameraTarget({ coordinate: position, id: ++sequence.current });
          }}
          style={[
            s.recenter,
            { bottom: panelHeight + 12 },
            following && { backgroundColor: "#D8EFEA" },
          ]}
        >
          <LocationArrow />
        </Pressable>
      )}
      <View
        onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
        style={[s.panel, { paddingBottom: insets.bottom + 18 }]}
      >
        <ScrollView
          style={{ maxHeight: 300 }}
          contentContainerStyle={{ gap: 14 }}
        >
          <View style={s.metrics}>
            <View>
              <Text style={s.metric}>
                {arrived ? "Arrived" : `${minutes} min`}
              </Text>
              <Text style={s.subtitle}>
                {arrived
                  ? "Enjoy your destination."
                  : `${remaining < 1000 ? `${Math.round(remaining)} m` : `${(remaining / 1000).toFixed(1)} km`} remaining`}
              </Text>
            </View>
            <Sun size={50} />
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Walk progress"
            accessibilityValue={{
              min: 0,
              max: 100,
              now: Math.round((progress?.fraction ?? 0) * 100),
            }}
            style={s.track}
          >
            <View
              style={[
                s.progress,
                { width: `${(progress?.fraction ?? 0) * 100}%` },
              ]}
            />
          </View>
          <Text style={s.subtitle}>
            {saved
              ? "Saved route preview · GPS tracking is off."
              : (error ??
                (!position
                  ? "Waiting for your location…"
                  : following
                    ? "Following your location · keep Shady open."
                    : "Map moved · tap the arrow to follow again."))}
          </Text>
          {error && (
            <Pressable
              accessibilityRole="button"
              style={s.retry}
              onPress={() => setRetry((value) => value + 1)}
            >
              <Text style={s.retryText}>Try location again</Text>
            </Pressable>
          )}
          <View style={s.exposure}>
            <Text style={s.subtitle}>
              <Text style={{ color: "#168575" }}>●</Text> Shade
            </Text>
            <Text style={s.subtitle}>
              <Text style={{ color: "#FFC857" }}>●</Text> Sun
            </Text>
            <Text style={s.subtitle}>
              {session.route.shade_pct === null
                ? "Shade unavailable"
                : `${Math.round(session.route.shade_pct)}% estimated shade`}
            </Text>
          </View>
          <Text style={s.footnote}>
            Building shade at{" "}
            {new Intl.DateTimeFormat("en-GB", {
              timeZone: "Europe/Warsaw",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(session.effectiveAt))}{" "}
            Warsaw. Shade may change during your walk.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              arrived ? "Finish walk" : saved ? "Back to planning" : "End walk"
            }
            style={({ pressed }) => [
              s.primary,
              { opacity: pressed ? 0.75 : 1 },
            ]}
            onPress={stop}
          >
            <Text style={s.primaryText}>
              {arrived
                ? "Finish walk"
                : saved
                  ? "Back to planning"
                  : "End walk"}
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5FAF8" },
  empty: {
    flex: 1,
    backgroundColor: "#F5FAF8",
    padding: 24,
    gap: 24,
    justifyContent: "center",
  },
  top: { position: "absolute", left: 20, right: 20, gap: 12 },
  heading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brand: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: "#123B35",
  },
  icon: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 18,
    backgroundColor: "#F5FAF8",
    alignItems: "center",
    justifyContent: "center",
  },
  close: { fontSize: 28, color: "#123B35" },
  guide: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
    padding: 18,
    borderRadius: 24,
    backgroundColor: "#F5FAF8",
    boxShadow: "0 5px 20px #123B3512",
  },
  guideIcon: {
    width: 44,
    height: 44,
    backgroundColor: "#D8EFEA",
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    color: "#168575",
    marginBottom: 5,
  },
  title: {
    fontSize: 21,
    fontWeight: "700",
    color: "#123B35",
    letterSpacing: -0.4,
  },
  subtitle: { fontSize: 13, lineHeight: 19, color: "#577B74" },
  recenter: {
    position: "absolute",
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5FAF8",
    boxShadow: "0 4px 15px #123B3515",
  },
  panel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 24,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "#F5FAF8",
    boxShadow: "0 -5px 25px #123B350C",
  },
  metrics: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metric: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1,
    color: "#123B35",
  },
  track: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D8EFEA",
    overflow: "hidden",
  },
  progress: { height: 5, backgroundColor: "#168575" },
  exposure: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  footnote: { fontSize: 11, lineHeight: 16, color: "#577B74" },
  primary: {
    minHeight: 50,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: "#168575",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontSize: 16, fontWeight: "600", color: "#F5FAF8" },
  retry: { minHeight: 44, justifyContent: "center" },
  retryText: { fontSize: 14, color: "#168575", fontWeight: "600" },
});
