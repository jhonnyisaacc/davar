import type { ProductClient } from "./productClient";

export type ProductCapabilities = {
	flags: {
		ai_provider_connections: boolean;
		ai_shared_openrouter: boolean;
		assemblies: boolean;
	};
	ai: { available: boolean; shared_openrouter: boolean; providers: string[] };
};
export const CLOSED_CAPABILITIES: ProductCapabilities = {
	flags: { ai_provider_connections: false, ai_shared_openrouter: false, assemblies: false },
	ai: { available: false, shared_openrouter: false, providers: [] },
};
export function normalizeCapabilities(value: unknown): ProductCapabilities {
	const input = value as Partial<ProductCapabilities> | null;
	const flags = {
		ai_provider_connections: input?.flags?.ai_provider_connections === true,
		ai_shared_openrouter: input?.flags?.ai_shared_openrouter === true,
		assemblies: input?.flags?.assemblies === true,
	};
	return {
		flags,
		ai: {
			available: (flags.ai_provider_connections || flags.ai_shared_openrouter) && input?.ai?.available === true,
			shared_openrouter: flags.ai_shared_openrouter && input?.ai?.shared_openrouter === true,
			providers: flags.ai_provider_connections && Array.isArray(input?.ai?.providers)
				? input.ai.providers.filter((provider): provider is string => typeof provider === "string") : [],
		},
	};
}

// Capabilities never fall back to yesterday's enabled flags or another account's state.
export function createCapabilitiesStore(api: Pick<ProductClient, "request" | "authenticated">) {
	let owner: string | null = null;
	let version = 0;
	let pending: Promise<void> | null = null;
	let state = { capabilities: CLOSED_CAPABILITIES, ready: false };
	const listeners = new Set<() => void>();
	const publish = (capabilities: ProductCapabilities, ready: boolean) => {
		state = { capabilities, ready };
		for (const listener of listeners) listener();
	};
	function refresh(): Promise<void> {
		if (pending) return pending;
		const requestVersion = version;
		const request = api.request<ProductCapabilities>("/capabilities", { public: !api.authenticated() })
			.then((value) => {
				if (requestVersion === version) publish(normalizeCapabilities(value), true);
			})
			.catch(() => {
				if (requestVersion === version) publish(CLOSED_CAPABILITIES, true);
			})
			.finally(() => { if (pending === request) pending = null; });
		pending = request;
		return request;
	}
	return {
		getSnapshot: () => state,
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => { listeners.delete(listener); };
		},
		refresh,
		setOwner: (next: string | null) => {
			if (next === owner) return;
			owner = next;
			version++;
			pending = null;
			publish(CLOSED_CAPABILITIES, false);
			void refresh();
		},
	};
}
