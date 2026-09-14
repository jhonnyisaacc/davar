import { useEffect, useRef } from "react";

declare global {
	interface Window {
		kofiWidgetOverlay?: {
			draw: (
				username: string,
				options: Record<string, string>,
				containerId?: string,
			) => void;
		};
	}
}

const kofiInlineStyles = `
  #kofi-inline-container .floatingchat-container-wrap,
  #kofi-inline-container .floatingchat-container-wrap-mobi {
    position: static !important;
    left: auto !important;
    right: auto !important;
    bottom: auto !important;
    width: auto !important;
    height: auto !important;
    margin: 0 auto !important;
    opacity: 1 !important;
    overflow: visible !important;
    transform: none !important;
    z-index: auto !important;
  }

  #kofi-inline-container .floatingchat-container,
  #kofi-inline-container .floatingchat-container-mobi {
    position: static !important;
    width: auto !important;
    height: auto !important;
    opacity: 1 !important;
    overflow: visible !important;
    transform: none !important;
  }

  /* Hide the global floating widget that overlay-widget creates outside our container */
  body > .floatingchat-container-wrap,
  body > .floatingchat-container-wrap-mobi {
    display: none !important;
  }
`;

export function KoFiWidget() {
	const drawnRef = useRef(false);

	useEffect(() => {
		if (typeof window === "undefined") return;

		let isActive = true;
		let retryTimer: number | null = null;
		let retries = 0;
		const maxRetries = 30;

		const draw = () => {
			if (!window.kofiWidgetOverlay || drawnRef.current || !isActive)
				return false;
			try {
				window.kofiWidgetOverlay.draw(
					"jhonnyisaacc",
					{
						type: "floating-chat",
						"floating-chat.donateButton.text": "Donate",
						"floating-chat.donateButton.background-color": "#00b9fe",
						"floating-chat.donateButton.text-color": "#fff",
					},
					"kofi-inline-container",
				);
				drawnRef.current = true;
				return true;
			} catch {
				return false;
			}
		};

		const retry = () => {
			if (!isActive || drawnRef.current) return;
			if (retries >= maxRetries) return;
			retries += 1;
			retryTimer = window.setTimeout(() => {
				if (!draw()) retry();
			}, 200);
		};

		if (window.kofiWidgetOverlay && draw()) {
			return () => {
				isActive = false;
			};
		}

		let script = document.getElementById(
			"kofi-overlay-script",
		) as HTMLScriptElement | null;
		if (!script) {
			script = document.createElement("script");
			script.id = "kofi-overlay-script";
			script.src = "https://storage.ko-fi.com/cdn/scripts/overlay-widget.js";
			script.async = true;
			document.head.appendChild(script);
		}

		const onLoad = () => {
			if (!draw()) retry();
		};
		script.addEventListener("load", onLoad);

		return () => {
			isActive = false;
			script?.removeEventListener("load", onLoad);
			if (retryTimer !== null) window.clearTimeout(retryTimer);
		};
	}, []);

	return (
		<>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: Ko-fi widget requires injected CSS overrides for stable inline embedding. */}
			<style dangerouslySetInnerHTML={{ __html: kofiInlineStyles }} />
			<div id="kofi-inline-container" className="flex justify-center" />
		</>
	);
}
