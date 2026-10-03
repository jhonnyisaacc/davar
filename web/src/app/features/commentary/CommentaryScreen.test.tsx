import { afterEach, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import { CommentaryScreen } from "./CommentaryScreen";
import { productApi } from "../../services/productApi";
import type { Account, Citation } from "@davar/shared/productContracts";
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
const account = { id: "reader" } as Account;
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
		if (path === "/auth/providers") return {} as never;
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
		if (path === "/auth/providers") return {} as never;
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
	const ui = render(<CommentaryScreen {...props} />);
	fireEvent.click(ui.getByRole("button", { name: "▤ Articles" }));
	await waitFor(() => expect(ui.getByText("Public article")).toBeTruthy());
	ui.rerender(<CommentaryScreen {...props} account={null} />);
	expect(ui.getByText("Public article")).toBeTruthy();
	expect(ui.getByText("Required credit")).toBeTruthy();
	expect(ui.getByRole("button", { name: "Return to AI chat" })).toBeTruthy();
	expect(
		request.mock.calls.filter(([path]) => path === "/articles"),
	).toHaveLength(1);
	expect(
		request.mock.calls.filter(([path]) => path === "/auth/providers"),
	).toHaveLength(1);
});
