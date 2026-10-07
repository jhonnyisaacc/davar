import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { createCapabilitiesStore } from "@davar/shared/productCapabilities";
import { productApi, useSession } from "../account/session";

export const capabilitiesStore = createCapabilitiesStore(productApi);
capabilitiesStore.setOwner(useSession.getState().account?.id ?? null);
useSession.subscribe((state) =>
  capabilitiesStore.setOwner(state.account?.id ?? null),
);
let consumers = 0;
let interval: ReturnType<typeof setInterval>;
let subscription: ReturnType<typeof AppState.addEventListener>;
const refresh = () => {
  if (AppState.currentState === "active") void capabilitiesStore.refresh();
};

export function useProductCapabilities() {
  const state = useSyncExternalStore(
    capabilitiesStore.subscribe,
    capabilitiesStore.getSnapshot,
    capabilitiesStore.getSnapshot,
  );
  useEffect(() => {
    if (consumers++ === 0) {
      void capabilitiesStore.refresh();
      interval = setInterval(refresh, 60000);
      subscription = AppState.addEventListener("change", (status) => {
        if (status === "active") void capabilitiesStore.refresh();
      });
    }
    return () => {
      if (--consumers === 0) {
        clearInterval(interval);
        subscription.remove();
      }
    };
  }, []);
  return state;
}
