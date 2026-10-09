import { afterEach, expect, spyOn, test } from "bun:test";
import { CLOSED_CAPABILITIES } from "@davar/shared/productCapabilities";
import type { Account, Citation } from "@davar/shared/productContracts";
import { Window } from "happy-dom";
import { capabilitiesStore } from "../../hooks/useProductCapabilities";
import { productApi } from "../../services/productApi";
import { CommentaryScreen } from "./CommentaryScreen";

const dom = new Window({ url: "http://localhost:5300/commentary" });
for (const key of [
	"window",
	"document",
	"navigator",
	"HTMLElement",
	"MutationObserver",
]) {
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
const { cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
let request = spyOn(productApi, "request");
afterEach(() => {
	cleanup();
	request.mockRestore();
});
const enabled = {
	flags: {
		ai_provider_connections: false,
		ai_shared_openrouter: true,
		assemblies: false,
		commentary: true,
		account_sign_in: true,
	},
	ai: { available: true, shared_openrouter: true, providers: [] },
};
const account = { id: "reader", providers: ["email"] } as Account;
const props = {
	account,
	busy: false,
	run: async (action: () => Promise<void>) => {
		await action();
	},
	signIn: <p>Sign in</p>,
	prompt: "",
	setPrompt: () => {},
};

test("account changes clear private conversations while retaining citation links on the active account", async () => {
	request = spyOn(productApi, "request").mockImplementation(async (path) => {
		if (path === "/capabilities") return enabled as never;
		if (path === "/provider_connections") return { connections: [] } as never;
		if (path === "/conversations")
			return {
				conversations: [{ id: "saved", title: "Saved consultation" }],
			} as never;
		return {
			id: "saved",
			messages: [
				{
					id: "answer",
					role: "assistant",
					content: "Private answer",
					citations: [
						{
							source_id: "shaul:section",
							source_url: "https://example.test/section",
							title: "Reviewed source",
							section_labels: ["Meaning"],
							revision: "fixture-v1",
							attribution: "Davar test fixture",
						} satisfies Citation,
					],
				},
			],
		} as never;
	});
	await capabilitiesStore.refresh();
	const ui = render(<CommentaryScreen {...props} />);
	fireEvent.click(ui.getByRole("button", { name: "History" }));
	await waitFor(() =>
		expect(ui.getByRole("button", { name: "Saved consultation" })).toBeTruthy(),
	);
	fireEvent.click(ui.getByRole("button", { name: "Saved consultation" }));
	await waitFor(() => expect(ui.getByText("Private answer")).toBeTruthy());
	expect(ui.getByRole("link").getAttribute("href")).toBe(
		"https://example.test/section",
	);
	expect(ui.getByRole("link").textContent).toBe("Reviewed source — Meaning");
	ui.rerender(<CommentaryScreen {...props} account={null} />);
	expect(ui.queryByText("Private answer")).toBeNull();
	expect(ui.queryByRole("button", { name: "Saved consultation" })).toBeNull();
	expect(
		ui.getByRole("heading", { name: "What do you want to understand today?" }),
	).toBeTruthy();
});

test("logout retains public article navigation without fetching the library or runtime again", async () => {
	request = spyOn(productApi, "request").mockImplementation(async (path) => {
		if (path === "/capabilities") return enabled as never;
		if (path === "/provider_connections") return { connections: [] } as never;
		return {
			articles: [
				{
					id: "article",
					title: "Public article",
					attribution: "Required credit",
				},
			],
		} as never;
	});
	await capabilitiesStore.refresh();
	const ui = render(<CommentaryScreen {...props} />);
	fireEvent.click(ui.getByRole("button", { name: "Shaul’s articles" }));
	await waitFor(() => expect(ui.getByText("Public article")).toBeTruthy());
	ui.rerender(<CommentaryScreen {...props} account={null} />);
	expect(ui.getByText("Public article")).toBeTruthy();
	expect(ui.getByText("Required credit")).toBeTruthy();
	expect(ui.getByRole("button", { name: "Return to AI chat" })).toBeTruthy();
	expect(
		request.mock.calls.filter(([path]) => path === "/articles"),
	).toHaveLength(1);
	expect(
		request.mock.calls.filter(([path]) => path === "/capabilities"),
	).toHaveLength(2);
});

test("closed flags show attributed articles and no AI or provider controls", async () => {
	request = spyOn(productApi, "request").mockImplementation(async (path) => {
		if (path === "/capabilities") return CLOSED_CAPABILITIES as never;
		if (path === "/articles")
			return {
				articles: [
					{
						id: "public",
						title: "Public study",
						attribution: "Required credit",
					},
				],
			} as never;
		throw new Error(`Unexpected request ${path}`);
	});
	await capabilitiesStore.refresh();
	const ui = render(<CommentaryScreen {...props} />);
	await waitFor(() => expect(ui.getByText("Public study")).toBeTruthy());
	expect(ui.getByText("Required credit")).toBeTruthy();
	expect(ui.queryByRole("button", { name: "Send" })).toBeNull();
	expect(ui.queryByRole("button", { name: "Return to AI chat" })).toBeNull();
	expect(ui.queryByLabelText("API key")).toBeNull();
	expect(
		request.mock.calls.some(([path]) => path === "/provider_connections"),
	).toBe(false);
});

test("AI errors switch to public articles with useful feedback", async () => {
	request = spyOn(productApi, "request").mockImplementation(async (path) => {
		if (path === "/capabilities") return enabled as never;
		if (path === "/articles")
			return {
				articles: [
					{
						id: "public",
						title: "Public study",
						attribution: "Required credit",
					},
				],
			} as never;
		throw new Error("unavailable");
	});
	await capabilitiesStore.refresh();
	const ui = render(<CommentaryScreen {...props} prompt="Study" />);
	fireEvent.click(ui.getByRole("button", { name: "Send" }));
	await waitFor(() => expect(ui.getByText("Public study")).toBeTruthy());
	expect(ui.getByRole("status").textContent).toContain("AI is unavailable");
	expect(ui.queryByLabelText("Ask Davar")).toBeNull();
});

test("approved API connections remain reachable when shared AI is disabled", async () => {
	const available = {
		flags: {
			ai_provider_connections: true,
			ai_shared_openrouter: false,
			assemblies: false,
			commentary: true,
			account_sign_in: true,
		},
		ai: { available: false, shared_openrouter: false, providers: ["claude"] },
	};
	request = spyOn(productApi, "request").mockImplementation(async (path) => {
		if (path === "/capabilities") return available as never;
		if (path === "/articles") return { articles: [] } as never;
		if (path === "/provider_connections") return { connections: [] } as never;
		throw new Error(`Unexpected request ${path}`);
	});
	await capabilitiesStore.refresh();
	const ui = render(<CommentaryScreen {...props} />);
	await waitFor(() => expect(ui.getByLabelText("AI provider")).toBeTruthy());
	expect(ui.getAllByRole("option").map((option) => option.textContent)).toEqual(
		["claude"],
	);
	expect(
		ui.getByRole("button", { name: "Connect an AI provider" }),
	).toBeTruthy();
	expect(ui.queryByRole("button", { name: "Send" })).toBeNull();
});

test("AI-off articles render Markdown with tables, credits, RTL and safe links", async () => {
	const article = {
		id: "markdown",
		title: "Public study",
		locale: "he",
		attribution: "Original credit",
		source_url: "https://example.test/original",
		body: "# Study heading\n\n**Important**\n\n- First point\n\n| Word | Meaning |\n| --- | --- |\n| One | First |\n\n[Study link](https://example.test/source)\n\n<script>alert('unsafe')</script>\n\n[Unsafe](javascript:alert(1))",
	};
	request = spyOn(productApi, "request").mockImplementation(async (path) => {
		if (path === "/capabilities") return CLOSED_CAPABILITIES as never;
		if (path === "/articles") return { articles: [article] } as never;
		if (path === "/articles/markdown") return article as never;
		throw new Error(`Unexpected request ${path}`);
	});
	await capabilitiesStore.refresh();
	const ui = render(<CommentaryScreen {...props} />);
	await waitFor(() => expect(ui.getByText("Public study")).toBeTruthy());
	fireEvent.click(ui.getByRole("button", { name: "Read" }));
	await waitFor(() =>
		expect(ui.getByRole("heading", { name: "Study heading" })).toBeTruthy(),
	);
	expect(ui.container.querySelector("strong")?.textContent).toBe("Important");
	expect(ui.getByRole("listitem").textContent).toBe("First point");
	expect(ui.getByRole("table")).toBeTruthy();
	expect(ui.getByText("Original credit")).toBeTruthy();
	expect(
		ui
			.getByRole("heading", { name: "Study heading" })
			.parentElement?.getAttribute("dir"),
	).toBe("rtl");
	const link = ui.getByRole("link", { name: "Study link" });
	expect(link.getAttribute("href")).toBe("https://example.test/source");
	expect(link.getAttribute("rel")).toBe("noreferrer");
	expect(ui.container.querySelector("script")).toBeNull();
	expect(ui.getByText("Unsafe").getAttribute("href")).not.toContain(
		"javascript:",
	);
	expect(ui.queryByRole("button", { name: "Send" })).toBeNull();
});
