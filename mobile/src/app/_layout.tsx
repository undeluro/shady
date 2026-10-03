import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalkSessionProvider } from "../state/WalkSession";
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 600000 } },
});
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <StatusBar style="dark" />
          <WalkSessionProvider>
            <Stack screenOptions={{ headerShown: false }} />
          </WalkSessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
