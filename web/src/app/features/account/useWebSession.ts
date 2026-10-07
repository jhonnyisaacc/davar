import { useEffect, useSyncExternalStore } from "react";
import { webSession } from "../../services/productApi";

export function useWebSession() {
	const state = useSyncExternalStore(
		webSession.subscribe,
		webSession.getSnapshot,
		webSession.getSnapshot,
	);
	useEffect(() => {
		const code = new URLSearchParams(window.location.search).get("code");
		if (code) window.history.replaceState(null, "", window.location.pathname);
		void webSession.restore(code).catch(() => {});
	}, []);
	return state;
}
