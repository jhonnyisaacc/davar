import { useEffect, useSyncExternalStore } from "react";
import { createCapabilitiesStore } from "@davar/shared/productCapabilities";
import { productApi, webSession } from "../services/productApi";

export const capabilitiesStore = createCapabilitiesStore(productApi);
capabilitiesStore.setOwner(webSession.getSnapshot().account?.id ?? null);
webSession.subscribe(() =>
	capabilitiesStore.setOwner(webSession.getSnapshot().account?.id ?? null),
);
let consumers = 0;
let interval: ReturnType<typeof setInterval>;
const resume = () => {
	void capabilitiesStore.refresh();
};

export function useProductCapabilities() {
	const state = useSyncExternalStore(
		capabilitiesStore.subscribe,
		capabilitiesStore.getSnapshot,
		capabilitiesStore.getSnapshot,
	);
	useEffect(() => {
		if (consumers++ === 0) {
			resume();
			interval = setInterval(resume, 60000);
			window.addEventListener("focus", resume);
		}
		return () => {
			if (--consumers === 0) {
				clearInterval(interval);
				window.removeEventListener("focus", resume);
			}
		};
	}, []);
	return state;
}
