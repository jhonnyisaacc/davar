import { Window } from "happy-dom";

const DOM_KEYS = [
	"window",
	"document",
	"navigator",
	"HTMLElement",
	"MutationObserver",
] as const;

export function installTestDom(url: string) {
	const dom = new Window({ url });
	for (const key of DOM_KEYS) {
		Object.defineProperty(globalThis, key, {
			configurable: true,
			writable: true,
			value: key === "window" ? dom : Reflect.get(dom, key),
		});
	}
	Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
		configurable: true,
		writable: true,
		value: true,
	});
	return dom;
}
