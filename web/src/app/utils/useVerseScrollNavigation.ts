import type { RefObject } from "react";
import { useEffect, useRef } from "react";

interface UseVerseScrollNavigationOptions {
	containerRef: RefObject<HTMLElement | null>;
	isEnabled: boolean;
	isBlocked?: boolean;
	threshold?: number;
	cooldownMs?: number;
	onNavigateNext: () => boolean | Promise<boolean>;
	onNavigatePrevious: () => boolean | Promise<boolean>;
	onNavigateFeedback?: () => void;
}

export function useVerseScrollNavigation({
	containerRef,
	isEnabled,
	isBlocked = false,
	threshold = 36,
	cooldownMs = 500,
	onNavigateNext,
	onNavigatePrevious,
	onNavigateFeedback,
}: UseVerseScrollNavigationOptions) {
	const lastTriggerRef = useRef(0);

	useEffect(() => {
		void containerRef.current;
		if (!isEnabled) return;

		const handleWheel = async (event: WheelEvent) => {
			if (!isEnabled || isBlocked) return;
			if (event.deltaY === 0) return;

			const now = Date.now();
			const page = document.scrollingElement ?? document.documentElement;
			const canScrollPage =
				event.deltaY > 0
					? page.scrollTop + page.clientHeight < page.scrollHeight - 1
					: page.scrollTop > 0;
			if (canScrollPage) {
				// Momentum that carries the page to its edge must not also change the verse.
				lastTriggerRef.current = now;
				return;
			}

			event.preventDefault();

			if (now - lastTriggerRef.current < cooldownMs) return;

			if (Math.abs(event.deltaY) < threshold) return;

			lastTriggerRef.current = now;

			const didNavigate =
				event.deltaY > 0 ? await onNavigateNext() : await onNavigatePrevious();

			if (didNavigate) {
				window.scrollTo({ top: 0, behavior: "instant" });
				onNavigateFeedback?.();
			}
		};

		window.addEventListener("wheel", handleWheel, { passive: false });

		return () => {
			window.removeEventListener("wheel", handleWheel);
		};
	}, [
		containerRef,
		isEnabled,
		isBlocked,
		threshold,
		cooldownMs,
		onNavigateNext,
		onNavigatePrevious,
		onNavigateFeedback,
	]);
}
