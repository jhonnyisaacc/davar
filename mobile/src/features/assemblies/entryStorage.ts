import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SPLASH_SEEN_KEY = "davar.assemblies.splashSeen";
const PENDING_CODE_KEY = "davar.assemblies.pendingCode";

export async function hasSeenAssembliesSplash() {
  return (await AsyncStorage.getItem(SPLASH_SEEN_KEY)) === "true";
}

export async function markAssembliesSplashSeen() {
  await AsyncStorage.setItem(SPLASH_SEEN_KEY, "true");
}

// Keep the invitation through the authentication callback, then discard it.
export async function loadPendingAssemblyCode() {
  return Platform.OS === "web"
    ? sessionStorage.getItem(PENDING_CODE_KEY)
    : SecureStore.getItemAsync(PENDING_CODE_KEY);
}

export async function savePendingAssemblyCode(code: string) {
  if (Platform.OS === "web") sessionStorage.setItem(PENDING_CODE_KEY, code);
  else await SecureStore.setItemAsync(PENDING_CODE_KEY, code);
}

export async function clearPendingAssemblyCode() {
  if (Platform.OS === "web") sessionStorage.removeItem(PENDING_CODE_KEY);
  else await SecureStore.deleteItemAsync(PENDING_CODE_KEY);
}
