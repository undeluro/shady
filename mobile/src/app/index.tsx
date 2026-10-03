import { logEvent } from "../diagnostics/logger";
import { isValidElement, useEffect, useReducer, useRef, useState } from "react";
import {
  ActivityIndicator,
  AccessibilityInfo,
  Linking,
  KeyboardAvoidingView,
  useWindowDimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useWalkSession } from "../state/WalkSession";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BottomSheet, {
  BottomSheetScrollView,
  useBottomSheetSpringConfigs,
} from "@gorhom/bottom-sheet";
import Slider from "@react-native-community/slider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import MapCanvas from "../components/MapCanvas";
import DateControl from "../components/DateControl";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";
import { TopFade } from "../components/TopFade";
import { LocationArrow } from "../components/LocationArrow";
import { Sun } from "../components/Sun";
import {
  apiRequest,
  compatibleShade,
  locateOrigin,
  prepareSnapshot,
} from "../core/client";
import {
  initialPlanning,
  planningReducer,
  timeBucket,
  warsawDeparture,
} from "../core/planning";
import type {
  Coordinate,
  MapRegion,
  Metadata,
  Route,
  RouteResult,
  SearchResult,
  ShadeResult,
} from "../core/types";
import demoData from "../data/demo.json";
import type { MapProps } from "../components/MapCanvas.types";
const SNAP_POINTS = ["15%", "35%", "70%"];
const C = {
  bg: "#F5FAF8",
  ink: "#123B35",
  teal: "#168575",
  soft: "#D8EFEA",
  sun: "#FFC857",
  muted: "#577B74",
};
const BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  `http://${Constants.expoConfig?.hostUri?.split(":")[0] ?? "localhost"}:8000`;
const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  day: "numeric",
  month: "short",
});
type Scenario = {
  id: string;
  title: string;
  origin: Coordinate;
  destination: Coordinate;
  departure_at: string;
  result: RouteResult;
  shade: ShadeResult;
  map: NonNullable<MapProps["demo"]>;
};
const scenarios = demoData.scenarios.map((scenario) => ({
  ...scenario,
  map: demoData.map,
})) as unknown as Scenario[];
function Button({
  label,
  onPress,
  children,
  selected = false,
}: {
  label: string;
  onPress: () => void;
  children?: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        selected && { backgroundColor: C.soft },
        pressed && { opacity: 0.7 },
      ]}
    >
      {isValidElement(children) ? (
        children
      ) : (
        <Text style={s.buttonText}>{children ?? label}</Text>
      )}
    </Pressable>
  );
}
export default function Home() {
  const router = useRouter();
  const { start: startWalk } = useWalkSession();
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const [retry, setRetry] = useState(0);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const sheetPosition = useSharedValue(height * 0.65);
  const legendStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetPosition.value - 44 }],
  }));
  const [cameraTarget, setCameraTarget] = useState<MapProps["cameraTarget"]>();
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(planningReducer, initialPlanning);
  const [origin, setOrigin] = useState<Coordinate>({
    latitude: 50.0617,
    longitude: 19.9373,
  });
  const [originLabel, setOriginLabel] = useState("Rynek Główny");
  const [destination, setDestination] = useState<Coordinate | null>(null);
  const [destinationLabel, setDestinationLabel] = useState(
    "Where shall we walk?",
  );
  const [departure, setDeparture] = useState(new Date().toISOString());
  const [draftMinutes, setDraftMinutes] = useState(780);
  const [dateText, setDateText] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const regionRef = useRef<MapRegion>({
    ...origin,
    latitudeDelta: 0.018,
    longitudeDelta: 0.018,
  });
  const [region, setRegion] = useState<MapRegion>({
    ...origin,
    latitudeDelta: 0.018,
    longitudeDelta: 0.018,
  });
  useEffect(() => {
    regionRef.current = region;
  }, [region]);
  const [showShade, setShowShade] = useState(true);
  const [panel, setPanel] = useState<"search" | "time" | "about" | null>(null);
  const [searchTarget, setSearchTarget] = useState<"origin" | "destination">(
    "destination",
  );
  const [query, setQuery] = useState("");
  const [places, setPlaces] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<Scenario | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  const sheet = useRef<BottomSheet>(null);
  const sequence = useRef(0);
  const searchGeneration = useRef(0);
  const locationGeneration = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const invalidateOperations = () => {
    searchGeneration.current++;
    locationGeneration.current++;
    searchController.current?.abort();
    setSearching(false);
  };
  const changePanel = (next: typeof panel) => {
    invalidateOperations();
    setPanel(next);
  };
  useEffect(
    () => () => {
      searchGeneration.current++;
      locationGeneration.current++;
      searchController.current?.abort();
    },
    [],
  );

  const animationConfigs = useBottomSheetSpringConfigs({
    damping: 40,
    stiffness: 400,
    mass: 1,
    overshootClamping: false,
  });
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => sub.remove();
  }, []);
  const metadata = useQuery({
    queryKey: ["metadata", BASE],
    queryFn: () => apiRequest<Metadata>("/v1/metadata", BASE),
    retry: false,
  });
  useEffect(() => {
    if (saved || !destination) return;
    const id = String(++sequence.current);
    const controller = new AbortController();
    logEvent("planning.requested", { generation: id });
    dispatch({ type: "request", id });
    queryClient
      .fetchQuery({
        queryKey: ["route", origin, destination, timeBucket(departure), retry],
        queryFn: () => {
          const view = regionRef.current;
          const bounds = [
            view.longitude - view.longitudeDelta / 2,
            view.latitude - view.latitudeDelta / 2,
            view.longitude + view.longitudeDelta / 2,
            view.latitude + view.latitudeDelta / 2,
          ].join(",");
          return prepareSnapshot(
            BASE,
            { origin, destination, departure_at: departure },
            bounds,
            Math.log2(360 / view.longitudeDelta),
            controller.signal,
          );
        },
        staleTime: 600000,
        retry: false,
      })
      .then((snapshot) => {
        if (!controller.signal.aborted) {
          logEvent("planning.committed", {
            generation: id,
            effective_at: snapshot.route.effective_at,
          });
          dispatch({
            type: "success",
            id,
            result: snapshot.route,
            shade: snapshot.shade,
          });
          if (snapshot.overlayError) setNotice(snapshot.overlayError);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          dispatch({
            type: "failure",
            id,
            message:
              error instanceof Error
                ? error.message
                : "Could not plan this walk.",
          });
      });
    return () => {
      logEvent("planning.cancelled", { generation: id }, "debug");
      controller.abort();
      void queryClient.cancelQueries({
        queryKey: ["route", origin, destination, timeBucket(departure), retry],
        exact: true,
      });
    };
  }, [origin, destination, departure, saved, queryClient, retry]);
  const result = saved?.result ?? state.result;
  const route =
    result?.routes.find((r) => r.profile === state.selected) ?? null;
  const bbox = [
    region.longitude - region.longitudeDelta / 2,
    region.latitude - region.latitudeDelta / 2,
    region.longitude + region.longitudeDelta / 2,
    region.latitude + region.latitudeDelta / 2,
  ]
    .map((n) => n.toFixed(5))
    .join(",");
  const zoom = Math.log2(360 / region.longitudeDelta);
  const shade = useQuery({
    queryKey: ["shade", bbox, result?.effective_at, result?.dataset_version],
    enabled: !saved && !!result && showShade && state.status !== "loading",
    queryFn: () =>
      apiRequest<ShadeResult>(
        `/v1/shade?bbox=${bbox}&departure_at=${encodeURIComponent(result!.effective_at)}&zoom=${zoom}`,
        BASE,
      ),
    retry: false,
  });
  const currentShade = shade.data ?? state.shade;
  const visibleShade =
    saved?.shade ??
    (result && currentShade && compatibleShade(result, currentShade)
      ? currentShade
      : null);
  const feedback = () => {
    if (!reduceMotion && Platform.OS !== "web") void Haptics.selectionAsync();
  };
  const choose = (profile: "shortest" | "shaded") => {
    feedback();
    logEvent("route.selected", { profile });
    dispatch({ type: "select", profile });
  };
  const openSearch = (target: "origin" | "destination") => {
    setSearchTarget(target);
    setQuery("");
    setPlaces([]);
    setNotice(null);
    changePanel("search");
  };
  const choosePlace = (place: SearchResult) => {
    invalidateOperations();
    setSaved(null);
    if (searchTarget === "origin") {
      setOrigin(place);
      setOriginLabel(place.name.split(",")[0]);
    } else {
      setDestination(place);
      setDestinationLabel(place.name.split(",")[0]);
    }
    changePanel(null);
    feedback();
  };
  const search = async () => {
    if (query.trim().length < 2) return;
    invalidateOperations();
    const id = searchGeneration.current;
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setNotice(null);
    try {
      const r = await apiRequest<{ results: SearchResult[] }>(
        `/v1/search?q=${encodeURIComponent(query.trim())}`,
        BASE,
        { signal: controller.signal },
      );
      if (id !== searchGeneration.current) return;
      setPlaces(r.results);
      if (!r.results.length)
        setNotice("No places found inside Kraków. Try a map pin.");
    } catch (e) {
      if (id === searchGeneration.current)
        setNotice(e instanceof Error ? e.message : "Search unavailable.");
    } finally {
      if (id === searchGeneration.current) setSearching(false);
    }
  };
  const gps = async () => {
    invalidateOperations();
    const id = locationGeneration.current;
    setNotice(null);
    try {
      const point = await locateOrigin(Location);
      if (id !== locationGeneration.current) return;
      invalidateOperations();
      setSaved(null);
      setOrigin(point);
      setCameraTarget({ coordinate: point, id });
      setOriginLabel("Your location");
      feedback();
    } catch (e) {
      if (id !== locationGeneration.current) return;
      setNotice(
        e instanceof Error
          ? e.message
          : "Location unavailable. Choose a start manually.",
      );
    }
  };
  const selectDemo = (scenario: Scenario) => {
    invalidateOperations();
    sequence.current++;
    dispatch({ type: "reset" });
    setCameraTarget(undefined);
    logEvent("mode.changed", {
      mode: "saved",
      effective_at: scenario.result.effective_at,
    });
    setSaved(scenario);
    setOrigin(scenario.origin);
    setOriginLabel(scenario.title.split(" → ")[0]);
    setDestination(scenario.destination);
    setDestinationLabel(scenario.title.split(" → ")[1] ?? "Saved walk");
    setDeparture(scenario.departure_at);
    changePanel(null);
    setNotice(null);
    sheet.current?.snapToIndex(1);
    feedback();
  };
  const commitTime = (minutes = draftMinutes, close = true) => {
    try {
      const at = warsawDeparture(dateText, minutes);
      logEvent("time.committed", { effective_at: timeBucket(at) });
      setDeparture(at);
      invalidateOperations();
      setSaved(null);
      if (close) changePanel(null);
      setNotice(null);
      feedback();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Choose a valid date.");
    }
  };
  return (
    <View style={s.container}>
      <MapCanvas
        cameraTarget={cameraTarget}
        origin={origin}
        reduceMotion={reduceMotion}
        destination={destination}
        route={route}
        shadows={visibleShade}
        showShade={showShade}
        onPin={(point) => {
          invalidateOperations();
          setSaved(null);
          if (searchTarget === "origin") {
            setOrigin(point);
            setOriginLabel("Map start");
          } else {
            setDestination(point);
            setDestinationLabel("Map destination");
          }
          feedback();
        }}
        onRegion={setRegion}
        demo={saved?.map}
      />
      <TopFade height={insets.top + 190} />
      <View pointerEvents="box-none" style={[s.top, { top: insets.top + 10 }]}>
        <View style={s.brandRow}>
          <View style={s.brand}>
            <Sun size={38} />
            <Text style={s.wordmark}>
              shady<Text style={{ color: C.teal }}>.</Text>
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            {saved && (
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: C.bg,
                  backgroundColor: C.ink,
                  padding: 8,
                  borderRadius: 10,
                }}
              >
                SAVED DEMO
              </Text>
            )}
            <Button label="About Shady" onPress={() => changePanel("about")}>
              ⓘ
            </Button>
          </View>
        </View>
        <View style={s.searchRow}>
          <Pressable
            style={[s.searchBox, { flex: 1 }]}
            onPress={() => openSearch("destination")}
            accessibilityRole="button"
            accessibilityLabel="Search destination"
          >
            <Text style={{ fontSize: 20, color: C.teal }}>⌕</Text>
            <Text numberOfLines={1} style={s.searchText}>
              {destinationLabel}
            </Text>
          </Pressable>
          <Button
            label="Choose departure time"
            onPress={() => {
              setDraftMinutes(
                Number(timeFormatter.format(new Date(departure)).slice(0, 2)) *
                  60 +
                  Number(timeFormatter.format(new Date(departure)).slice(3)),
              );
              setDateText(
                new Intl.DateTimeFormat("en-CA", {
                  timeZone: "Europe/Warsaw",
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }).format(new Date(departure)),
              );
              setNotice(null);
              changePanel("time");
            }}
          >
            {Math.abs(clock - Date.parse(departure)) < 600000
              ? "Now"
              : timeFormatter.format(new Date(departure))}
          </Button>
        </View>
        <Pressable
          onPress={() => openSearch("origin")}
          style={s.origin}
          accessibilityRole="button"
          accessibilityLabel="Change starting point"
        >
          <Text style={s.small}>● From {originLabel} · change</Text>
        </Pressable>
        {saved && (
          <Pressable
            style={s.demoBadge}
            accessibilityRole="button"
            accessibilityLabel="Switch to live planning"
            onPress={() => {
              invalidateOperations();
              setSaved(null);
              dispatch({ type: "reset" });
            }}
          >
            <Text style={s.badgeText}>
              SAVED DEMO · {dateFormatter.format(new Date(departure))} ·{" "}
              {timeFormatter.format(new Date(departure))}
            </Text>
            <Text style={s.badgeText}>Go live ↗</Text>
          </Pressable>
        )}
      </View>
      <View style={[s.mapTools, { top: insets.top + 205 }]}>
        <Button label="Use my location" onPress={gps}>
          <LocationArrow />
        </Button>
        <Button
          label={showShade ? "Hide shade overlay" : "Show shade overlay"}
          selected={showShade}
          onPress={() => {
            setShowShade((v) => !v);
            feedback();
          }}
        >
          ◐
        </Button>
      </View>
      {(notice || state.error) && !panel && (
        <Pressable
          style={[s.notice, { top: insets.top + 212 }]}
          onPress={() => {
            setNotice(null);
          }}
        >
          <Text style={s.small}>{notice ?? state.error}</Text>
        </Pressable>
      )}
      {route && (
        <Animated.View pointerEvents="none" style={[s.legend, legendStyle]}>
          <View style={[s.dot, { backgroundColor: C.teal }]} />
          <Text style={s.small}>Shade</Text>
          <View style={[s.dot, { backgroundColor: C.sun }]} />
          <Text style={s.small}>Sun</Text>
        </Animated.View>
      )}
      {!saved &&
        showShade &&
        (!visibleShade?.detail_available || shade.isError) && (
          <View style={s.mapHint}>
            <Text style={s.small}>
              {shade.isError
                ? "Shade overlay unavailable"
                : zoom < 14
                  ? "Zoom in to see shade"
                  : "Building shade estimate"}
            </Text>
          </View>
        )}
      <BottomSheet
        animatedPosition={sheetPosition}
        ref={sheet}
        index={1}
        snapPoints={SNAP_POINTS}
        animateOnMount={false}
        enableDynamicSizing={false}
        animationConfigs={animationConfigs}
        backgroundStyle={s.sheet}
        handleIndicatorStyle={{ backgroundColor: "#B3CDC5", width: 36 }}
        keyboardBehavior="interactive"
        enablePanDownToClose={false}
      >
        <BottomSheetScrollView
          contentContainerStyle={{
            padding: 22,
            paddingTop: 5,
            paddingBottom: insets.bottom + 28,
          }}
        >
          <View style={s.sheetHeading}>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>
                {saved ? "A LITTLE SUMMER PREVIEW" : "TAKE THE COOLER WAY"}
              </Text>
              <Text style={s.title}>
                {result
                  ? "A little shade goes a long way."
                  : "Hello, sunshine."}
              </Text>
            </View>
            <Sun size={57} />
          </View>
          <Text style={s.description}>
            {destination
              ? "Compare your walk, then choose your shade."
              : "Pick a destination. We’ll find a walk with a little less sun."}
          </Text>
          {state.status === "loading" && !saved && (
            <View style={s.statusRow}>
              <ActivityIndicator color={C.teal} />
              <Text style={s.small}>
                {result
                  ? "Updating your walk…"
                  : "Finding shade along your walk…"}
              </Text>
            </View>
          )}
          {result && (
            <View
              style={
                state.status === "loading" && !saved
                  ? { opacity: 0.55 }
                  : undefined
              }
            >
              {result.routes.map((r) => (
                <RouteCard
                  key={r.profile}
                  route={r}
                  selected={state.selected === r.profile}
                  onPress={() => choose(r.profile)}
                  added={result.added_minutes}
                  savedSun={result.sunny_m_saved}
                />
              ))}
              {route &&
                destination &&
                (saved || state.status !== "loading") && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      saved ? "Preview saved walk" : "Start walk"
                    }
                    style={{
                      minHeight: 50,
                      backgroundColor: C.teal,
                      borderRadius: 18,
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: 12,
                    }}
                    onPress={() => {
                      logEvent("navigation.opened", {
                        mode: saved ? "saved" : "live",
                        profile: route.profile,
                      });
                      startWalk({
                        origin,
                        destination,
                        destinationLabel,
                        route,
                        shadows: visibleShade,
                        effectiveAt: result.effective_at,
                        demo: saved?.map,
                      });
                      feedback();
                      router.push("/navigation");
                    }}
                  >
                    <Text
                      style={{ fontSize: 16, fontWeight: "600", color: C.bg }}
                    >
                      {saved ? "Preview saved walk" : "Start walk"} ↗
                    </Text>
                  </Pressable>
                )}
              <Text style={s.footnote}>
                {result.shade_status === "night"
                  ? "The sun is below the horizon. Showing walking distance; shade percentage is unavailable."
                  : result.shade_status === "low_sun"
                    ? "The sun is too low for a reliable shade estimate. Showing the shortest walk."
                    : result.recommendation_status === "no_improvement"
                      ? "These paths have similar shade. The shortest walk is a good choice."
                      : "More shade stays within 25% extra distance."}
              </Text>
              <Text style={s.footnote}>
                Departure estimate ·{" "}
                {timeFormatter.format(new Date(result.effective_at))} Warsaw ·
                Buildings only. Trees, clouds and changing shade during your
                walk aren’t included.
              </Text>
              {result.snapped_endpoints.some((e) => e.offset_m > 1) && (
                <Text style={s.footnote}>
                  Pins connected to mapped paths:{" "}
                  {result.snapped_endpoints
                    .map((e) => `${Math.round(e.offset_m)} m`)
                    .join(" / ")}
                  . Check the access on the ground.
                </Text>
              )}
            </View>
          )}
          {!destination && (
            <Text style={s.footnote}>
              Long press the map to drop a destination pin. Change “From” to
              choose a start.
            </Text>
          )}
          {state.error && !saved && (
            <View style={s.error}>
              <Text style={s.small}>{state.error}</Text>
              <Button
                label="Try again"
                onPress={() => setRetry((v) => v + 1)}
              />
            </View>
          )}
          <View style={s.divider} />
          <Text style={s.eyebrow}>TRY A SAVED WALK</Text>
          <Text style={s.footnote}>
            Real summer routes. Available offline after the app loads.
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingTop: 12 }}
          >
            {scenarios.map((sc) => (
              <Pressable
                key={sc.id}
                accessibilityRole="button"
                onPress={() => selectDemo(sc)}
                style={s.demoCard}
              >
                <Text style={s.demoTime}>
                  {timeFormatter.format(new Date(sc.departure_at))}
                </Text>
                <Text style={s.small}>{sc.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {!scenarios.length && (
            <Text style={s.footnote}>
              Saved walks are generated from the prepared city dataset.
            </Text>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
      <Modal
        visible={panel !== null}
        transparent
        animationType={reduceMotion ? "none" : "fade"}
        onRequestClose={() => changePanel(null)}
      >
        <KeyboardAvoidingView
          style={s.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={[s.modal, { paddingBottom: insets.bottom + 24 }]}>
            <View style={s.modalHeading}>
              <Text style={s.title}>
                {panel === "search"
                  ? searchTarget === "origin"
                    ? "Start your walk"
                    : "Find your destination"
                  : panel === "time"
                    ? "Chase a little shade"
                    : "Meet Shady."}
              </Text>
              <Button label="Close" onPress={() => changePanel(null)}>
                ×
              </Button>
            </View>
            {panel === "search" && (
              <>
                <View style={s.searchRow}>
                  <TextInput
                    accessibilityLabel="Submitted address search"
                    value={query}
                    onChangeText={setQuery}
                    placeholder="A place or address in Kraków"
                    placeholderTextColor={C.muted}
                    style={[s.input, { flex: 1 }]}
                    returnKeyType="search"
                    onSubmitEditing={search}
                    autoFocus
                  />
                  <Button label="Search" onPress={search} />
                </View>
                <Text style={s.footnote}>
                  Press Search to look it up. © OpenStreetMap contributors.
                </Text>
                {searching && <ActivityIndicator color={C.teal} />}
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 300 }}
                >
                  {places.map((p) => (
                    <Pressable
                      key={p.id}
                      style={s.place}
                      onPress={() => choosePlace(p)}
                    >
                      <Text style={s.searchText}>{p.name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <Button
                  label="Choose on map"
                  onPress={() => {
                    changePanel(null);
                    setNotice(
                      `Long press the map to choose your ${searchTarget === "origin" ? "start" : "destination"}.`,
                    );
                  }}
                />
              </>
            )}
            {panel === "time" && (
              <>
                <Text style={s.description}>
                  Shade shifts with the sun. Pick your departure in Warsaw time.
                </Text>
                <DateControl date={dateText} onChange={setDateText} />
                <Text style={s.timeDisplay}>
                  {String(Math.floor(draftMinutes / 60)).padStart(2, "0")}:
                  {String(draftMinutes % 60).padStart(2, "0")}
                </Text>
                <Slider
                  accessibilityLabel="Departure time"
                  minimumValue={0}
                  maximumValue={1430}
                  step={10}
                  value={draftMinutes}
                  onValueChange={setDraftMinutes}
                  onSlidingComplete={(value) => commitTime(value, false)}
                  minimumTrackTintColor={C.teal}
                  maximumTrackTintColor={C.soft}
                  thumbTintColor={C.teal}
                />
                <View style={s.searchRow}>
                  <Button
                    label="Now"
                    onPress={() => {
                      invalidateOperations();
                      setSaved(null);
                      setDeparture(new Date().toISOString());
                      changePanel(null);
                    }}
                  />
                  <Button label="Show this time" onPress={() => commitTime()} />
                </View>
                <Text style={s.footnote}>
                  The label follows your finger. Your walk and shade update
                  together when you release.
                </Text>
              </>
            )}
            {panel === "about" && (
              <ScrollView style={{ maxHeight: 430 }}>
                <View style={{ alignItems: "center", padding: 20 }}>
                  <Sun size={90} />
                </View>
                <Text style={s.description}>
                  A gentler way to explore Kraków. Walking routes, a little
                  extra shade, and room to wander.
                </Text>
                <Text style={s.footnote}>
                  Live planning covers connected public walking paths inside
                  Kraków’s city boundary. More shade is a candidate-based
                  estimate with up to 25% extra distance.
                </Text>
                <Text style={s.footnote}>
                  2024 GUGiK buildings over flat ground. No tree, cloud or
                  terrain shading. Shade is estimated at departure in ten-minute
                  snapshots. Night and very low sun have no shade percentage.
                </Text>
                {(metadata.data?.sources ?? demoData.sources).map((source) => (
                  <Pressable
                    key={source.name}
                    onPress={() => Linking.openURL(source.url)}
                    style={s.place}
                  >
                    <Text style={s.searchText}>{source.name} ↗</Text>
                    <Text style={s.footnote}>{source.license}</Text>
                  </Pressable>
                ))}
                <Text style={s.footnote}>
                  {metadata.data
                    ? `Dataset: ${metadata.data.dataset_version}`
                    : "Live server unavailable. Saved demo stays available."}
                </Text>
                <Text style={s.footnote}>
                  Saved demo is always labeled. It never replaces a failed live
                  request.
                </Text>
              </ScrollView>
            )}
            {notice && <Text style={s.error}>{notice}</Text>}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
function RouteCard({
  route,
  selected,
  onPress,
  added,
  savedSun,
}: {
  route: Route;
  selected: boolean;
  onPress: () => void;
  added: number;
  savedSun: number | null;
}) {
  const shaded = route.profile === "shaded";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${shaded ? "More shade" : "Shortest"}, ${Math.round(route.duration_s / 60)} minutes`}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        s.routeCard,
        selected && s.routeSelected,
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={s.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>
            {shaded ? "◐  More shade" : "↗  Shortest"}
          </Text>
          <Text style={s.small}>
            {shaded
              ? `+${added > 0 && added < 1 ? "<1" : Math.ceil(added)} min · ${savedSun === null ? "Shade unavailable" : `${Math.round(savedSun)} m less sun`}`
              : "The most direct way there"}
          </Text>
        </View>
        <Text style={s.duration}>
          {Math.round(route.duration_s / 60)}
          <Text style={s.unit}> min</Text>
        </Text>
      </View>
      <View
        style={[
          s.meter,
          route.shade_pct === null && { backgroundColor: "#DDE9E3" },
        ]}
      >
        <View
          style={{
            height: 5,
            width: `${route.shade_pct ?? 0}%`,
            backgroundColor: C.teal,
          }}
        />
      </View>
      <View style={s.cardTop}>
        <Text style={s.small}>{(route.distance_m / 1000).toFixed(2)} km</Text>
        <Text style={s.small}>
          {route.shade_pct === null
            ? "Shade estimate unavailable"
            : `${Math.round(route.shade_pct)}% in shade`}
        </Text>
      </View>
    </Pressable>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  top: { position: "absolute", left: 20, right: 20, gap: 9 },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 6 },
  wordmark: {
    fontSize: 35,
    fontWeight: "800",
    letterSpacing: -1.8,
    color: C.ink,
  },
  button: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 15,
    borderRadius: 19,
    backgroundColor: C.bg,
    justifyContent: "center",
    alignItems: "center",
    boxShadow: "0 3px 18px #123B3510",
  },
  buttonText: { fontSize: 16, fontWeight: "600", color: C.ink },
  searchRow: { flexDirection: "row", gap: 9, alignItems: "center" },
  searchBox: {
    backgroundColor: C.bg,
    borderRadius: 20,
    minHeight: 54,
    paddingHorizontal: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    boxShadow: "0 5px 20px #123B3512",
  },
  searchText: { fontSize: 16, color: C.ink, fontWeight: "500" },
  origin: {
    alignSelf: "flex-start",
    backgroundColor: C.bg,
    paddingHorizontal: 13,
    minHeight: 44,
    borderRadius: 15,
    justifyContent: "center",
  },
  small: { fontSize: 13, color: C.muted, lineHeight: 19 },
  mapTools: { position: "absolute", right: 20, gap: 10 },
  notice: {
    position: "absolute",
    left: 20,
    right: 80,
    padding: 14,
    borderRadius: 18,
    backgroundColor: C.bg,
  },
  legend: {
    position: "absolute",
    left: 20,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: C.bg,
    borderRadius: 18,
    padding: 10,
  },
  dot: { width: 9, height: 9, borderRadius: 5 },
  mapHint: {
    position: "absolute",
    right: 20,
    bottom: "38%",
    padding: 10,
    borderRadius: 18,
    backgroundColor: C.bg,
  },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    boxShadow: "0 -5px 25px #123B350C",
  },
  sheetHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    color: C.teal,
    marginBottom: 8,
  },
  title: {
    fontSize: 25,
    fontWeight: "700",
    letterSpacing: -0.8,
    lineHeight: 30,
    color: C.ink,
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
    color: C.muted,
    marginTop: 9,
    marginBottom: 17,
  },
  statusRow: { flexDirection: "row", gap: 10, paddingVertical: 10 },
  routeCard: {
    padding: 17,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#DDE9E3",
    marginBottom: 12,
    backgroundColor: "#FFFFFF",
  },
  routeSelected: {
    borderColor: C.teal,
    borderWidth: 2,
    backgroundColor: "#EAF5F1",
    padding: 16,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: { fontSize: 18, fontWeight: "600", color: C.ink, marginBottom: 5 },
  duration: {
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: -1,
    color: C.ink,
  },
  unit: { fontSize: 13, fontWeight: "500", letterSpacing: 0 },
  meter: {
    height: 5,
    backgroundColor: C.sun,
    borderRadius: 5,
    overflow: "hidden",
    marginVertical: 13,
  },
  footnote: { fontSize: 12, lineHeight: 18, color: C.muted, marginTop: 8 },
  divider: { height: 1, backgroundColor: "#DDE9E3", marginVertical: 23 },
  demoCard: {
    borderRadius: 18,
    backgroundColor: C.soft,
    padding: 14,
    minWidth: 125,
    maxWidth: 210,
  },
  demoTime: { fontSize: 20, fontWeight: "700", color: C.ink, marginBottom: 5 },
  demoBadge: {
    minHeight: 44,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: C.ink,
    borderRadius: 14,
    padding: 11,
    gap: 5,
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: C.bg },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "#123B3544",
    justifyContent: "flex-end",
  },
  modal: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    gap: 12,
    maxHeight: "85%",
  },
  modalHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#CADFD5",
    padding: 14,
    fontSize: 16,
    color: C.ink,
    backgroundColor: "#FFF",
  },
  place: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: "#DDE9E3",
    minHeight: 48,
  },
  timeDisplay: {
    fontSize: 48,
    fontWeight: "700",
    letterSpacing: -2,
    textAlign: "center",
    color: C.ink,
    marginVertical: 10,
  },
  error: {
    padding: 12,
    backgroundColor: "#FFF1CE",
    borderRadius: 12,
    color: C.ink,
  },
});
