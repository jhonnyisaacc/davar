type Pending = {
	resolve: (value: Record<string, unknown>) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
};

export interface CdpPage {
	send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>>;
	close(): void;
}

export async function connectPage(port: number): Promise<CdpPage> {
	const response = await fetch(`http://127.0.0.1:${port}/json/list`);
	if (!response.ok) throw new Error("cdp-list");
	const targets = (await response.json()) as { type?: string; webSocketDebuggerUrl?: string }[];
	const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
	if (!page?.webSocketDebuggerUrl) throw new Error("cdp-no-page");
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise<void>((resolve, reject) => {
		const fail = () => reject(new Error("cdp-socket"));
		ws.addEventListener("open", () => resolve(), { once: true });
		ws.addEventListener("error", fail, { once: true });
	});
	let next = 0;
	const pending = new Map<number, Pending>();
	ws.addEventListener("message", (event) => {
		const message = JSON.parse(String(event.data)) as {
			id?: number;
			result?: Record<string, unknown>;
			error?: { message?: string };
		};
		if (!message.id || !pending.has(message.id)) return;
		const waiter = pending.get(message.id);
		if (!waiter) return;
		pending.delete(message.id);
		clearTimeout(waiter.timer);
		if (message.error) waiter.reject(new Error(message.error.message ?? "cdp-error"));
		else waiter.resolve(message.result ?? {});
	});
	const send = (method: string, params?: Record<string, unknown>) =>
		new Promise<Record<string, unknown>>((resolve, reject) => {
			const id = ++next;
			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`cdp-timeout ${method}`));
			}, 15000);
			pending.set(id, { resolve, reject, timer });
			ws.send(JSON.stringify({ id, method, params }));
		});
	await send("Page.enable");
	await send("Runtime.enable");
	return {
		send,
		close() {
			ws.close();
		},
	};
}

export async function evaluate<T>(page: CdpPage, expression: string): Promise<T> {
	const result = await page.send("Runtime.evaluate", {
		expression,
		returnByValue: true,
		awaitPromise: true,
	});
	if (result.exceptionDetails) throw new Error("cdp-eval");
	const remote = result.result as { value?: T } | undefined;
	return remote?.value as T;
}
