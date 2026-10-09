import { useCallback, useState } from "react";
import { parseRoutePath, type RouteScreen } from "../../utils/routeState";

export function useScreenNavigation() {
	const [currentScreen, setCurrentScreen] = useState<RouteScreen>(() => {
		if (typeof window === "undefined") return "verse";
		const screen =
			parseRoutePath(window.location.pathname)?.screen ?? "notFound";
		return screen === "settings" ? "verse" : screen;
	});
	const [settingsOpen, setSettingsOpen] = useState(
		() =>
			typeof window !== "undefined" &&
			parseRoutePath(window.location.pathname)?.screen === "settings",
	);
	const handleOpenScreen = useCallback((screen: RouteScreen) => {
		setSettingsOpen(screen === "settings");
		if (screen !== "settings") setCurrentScreen(screen);
	}, []);

	return {
		currentScreen,
		setCurrentScreen,
		settingsOpen,
		setSettingsOpen,
		handleOpenScreen,
	};
}
