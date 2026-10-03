export interface CacheStorage {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
	remove(key: string): Promise<void>;
}
export function createMemoryCacheStorage(): CacheStorage {
	const values = new Map<string, string>();
	return {
		get: async (key) => values.get(key) ?? null,
		set: async (key, value) => {
			values.set(key, value);
		},
		remove: async (key) => {
			values.delete(key);
		},
	};
}
export class ProductApiError extends Error {
	constructor(
		public code: string,
		public status: number,
	) {
		super(code);
	}
}
export type ProductTransport = (
	url: string,
	init?: RequestInit,
) => Promise<Response>;
export class ProductClient {
	private token: string | null = null;
	private owner: string | null = null;
	private generation = 0;
	private keys = new Set<string>();
	constructor(
		private baseUrl: string,
		private storage: CacheStorage,
		private transport: ProductTransport = (url, init) =>
			globalThis.fetch(url, init),
	) {
		if (!/^https?:\/\//.test(baseUrl)) throw new Error("Invalid API URL");
	}
	authenticated() {
		return !!this.token && !!this.owner;
	}
	async setSession(token: string | null, owner: string | null) {
		this.generation++;
		this.token = token;
		this.owner = owner;
		await this.clearCache();
	}
	async clearCache() {
		const keys = [...this.keys];
		this.keys.clear();
		await Promise.all(keys.map((key) => this.storage.remove(key)));
	}
	async request<T>(
		path: string,
		options: {
			method?: string;
			body?: unknown;
			cache?: boolean;
			public?: boolean;
			cacheKey?: string;
		} = {},
	): Promise<T> {
		const method = options.method || "GET";
		if (!path.startsWith("/") || path.startsWith("//"))
			throw new Error("Invalid API path");
		const generation = this.generation;
		const token = this.token;
		const owner = options.public ? "public" : this.owner;
		if (!options.public && (!token || !owner))
			throw new ProductApiError("authentication_required", 401);
		const key = `davar-v2-cache/${owner}/${options.cacheKey || path}`;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 35000);
		try {
			const response = await this.transport(
				`${this.baseUrl.replace(/\/$/, "")}/api/v1${path}`,
				{
					method,
					headers: {
						"Content-Type": "application/json",
						...(!options.public && token
							? { Authorization: `Bearer ${token}` }
							: {}),
					},
					...(options.body !== undefined
						? { body: JSON.stringify(options.body) }
						: {}),
					signal: controller.signal,
				},
			);
			if (generation !== this.generation)
				throw new ProductApiError("session_changed", 409);
			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				throw new ProductApiError(
					payload?.error?.code || "request_failed",
					response.status,
				);
			}
			if (method !== "GET") await this.clearCache();
			const result =
				response.status === 204 ? undefined : await response.json();
			if (options.cache && method === "GET") {
				this.keys.add(key);
				await this.storage.set(
					key,
					JSON.stringify({ saved_at: Date.now(), data: result }),
				);
			}
			return result as T;
		} catch (error) {
			// Authorization and validation failures never fall back to cached private data.
			if (
				options.cache &&
				generation === this.generation &&
				!(error instanceof ProductApiError)
			) {
				const stored = await this.storage.get(key);
				if (stored) {
					const entry = JSON.parse(stored);
					if (Date.now() - entry.saved_at <= 24 * 60 * 60 * 1000)
						return entry.data as T;
				}
			}
			throw error;
		} finally {
			clearTimeout(timeout);
		}
	}
}
