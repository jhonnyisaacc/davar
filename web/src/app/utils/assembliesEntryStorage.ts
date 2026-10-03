const SPLASH_SEEN_KEY = "davar.assemblies.splashSeen";
const PENDING_CODE_KEY = "davar.assemblies.pendingCode";

export function hasSeenAssembliesSplash() {
	try {
		return window.localStorage.getItem(SPLASH_SEEN_KEY) === "true";
	} catch {
		return false;
	}
}

export function markAssembliesSplashSeen() {
	try {
		window.localStorage.setItem(SPLASH_SEEN_KEY, "true");
	} catch {
		// The entry screen remains usable when persistent storage is unavailable.
	}
}

// Keep the invitation through the authentication callback, then discard it.
export function loadPendingAssemblyCode() {
	try {
		return window.sessionStorage.getItem(PENDING_CODE_KEY);
	} catch {
		return null;
	}
}

export function savePendingAssemblyCode(code: string) {
	window.sessionStorage.setItem(PENDING_CODE_KEY, code);
}

export function clearPendingAssemblyCode() {
	try {
		window.sessionStorage.removeItem(PENDING_CODE_KEY);
	} catch {
		// Storage may be disabled after the code was saved.
	}
}
