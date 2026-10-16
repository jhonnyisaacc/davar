import { afterEach, expect, type Mock, spyOn, test } from "bun:test";
import type { Article } from "@davar/shared/productContracts";
import { translate } from "../hooks/useTranslation";
import { productApi } from "../services/productApi";
import { installTestDom } from "../testDom";
import { CommentarySourcesScreen } from "./CommentarySourcesScreen";
import { DonationPage } from "./DonationPage";
import { SupportScreen } from "./SupportScreen";

installTestDom("http://localhost:5300/donate");
const { cleanup, render } = await import("@testing-library/react");

let request: Mock<typeof productApi.request> | null = null;

afterEach(() => {
	cleanup();
	request?.mockRestore();
	request = null;
});

const article: Article = {
	id: "note",
	source_id: "shaul",
	title: "A note",
	locale: "en",
	source_url: "https://shaul.vercel.app/a",
	attribution: "Shaul",
	references: [],
	revision: "1",
};

test("donate is a flat list of giving links", () => {
	const ui = render(<DonationPage language="en" onBack={() => {}} />);
	expect(ui.getByRole("heading", { name: "Donate" })).toBeTruthy();
	expect(
		ui.getByText(
			"Davar is free to read, without ads. If it serves your study, you can help keep it going.",
		),
	).toBeTruthy();
	expect(ui.getByRole("link", { name: /Ko-fi/ }).getAttribute("href")).toBe(
		"https://ko-fi.com/jhonnyisaacc",
	);
	expect(
		ui.getByRole("link", { name: /GitHub Sponsors/ }).getAttribute("href"),
	).toBe("https://github.com/sponsors/jhonnyisaacc");
	expect(
		ui.getByRole("link", { name: /@jhonnyisaacc/ }).getAttribute("href"),
	).toBe("https://t.me/jhonnyisaacc");
	expect(
		ui
			.getByRole("link", { name: "Get it on Google Play" })
			.getAttribute("href"),
	).toBe("https://play.google.com/store/apps/details?id=bible.davar");
	expect(ui.container.querySelector("#kofi-inline-container")).toBeNull();
});

test("resource copy is translated in Spanish and Hebrew", () => {
	for (const language of ["es", "he"] as const) {
		for (const key of [
			"donate.intro",
			"donate.give",
			"support.copyAddress",
			"support.telegramLead",
			"commentarySources.open",
			"commentarySources.read",
		]) {
			expect(translate(language, key)).not.toBe(key);
		}
	}
});

test("support focuses the email and keeps telegram quiet", async () => {
	const ui = render(<SupportScreen language="en" onBack={() => {}} />);
	expect(ui.getByRole("heading", { name: "Support" })).toBeTruthy();
	expect(ui.getByText("hi@davar.bible")).toBeTruthy();
	expect(
		ui.getByRole("link", { name: "Email support" }).getAttribute("href"),
	).toBe("mailto:hi@davar.bible");
	const copy = ui.getByRole("button", { name: "Copy address" });
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: async () => {} },
	});
	document.execCommand = () => false;
	copy.click();
	expect(await ui.findByRole("button", { name: "Copied" })).toBeTruthy();
	cleanup();
	const fallback = render(<SupportScreen language="en" onBack={() => {}} />);
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: {
			writeText: async () => {
				throw new Error("denied");
			},
		},
	});
	document.execCommand = () => true;
	fallback.getByRole("button", { name: "Copy address" }).click();
	expect(await fallback.findByRole("button", { name: "Copied" })).toBeTruthy();
	expect(
		ui.getByText("Prefer chat? Message the developer on Telegram"),
	).toBeTruthy();
	expect(
		ui.getByRole("link", { name: "@jhonnyisaacc" }).getAttribute("href"),
	).toBe("https://t.me/jhonnyisaacc");
});

test("commentary lists the source and a published article", async () => {
	request = spyOn(productApi, "request").mockResolvedValue({
		articles: [article],
	});
	const ui = render(
		<CommentarySourcesScreen language="en" onBack={() => {}} />,
	);
	expect(ui.getByRole("heading", { name: "Commentary Sources" })).toBeTruthy();
	expect(ui.getByRole("link", { name: /Shaul/ }).getAttribute("href")).toBe(
		"https://shaul.vercel.app/",
	);
	const note = await ui.findByRole("link", { name: /A note/ });
	expect(note.getAttribute("href")).toBe("https://shaul.vercel.app/a");
	expect(note.textContent).toContain("Read");
});

test("commentary offers retry when the catalog fails", async () => {
	request = spyOn(productApi, "request").mockRejectedValue(new Error("down"));
	const ui = render(
		<CommentarySourcesScreen language="en" onBack={() => {}} />,
	);
	expect(await ui.findByRole("button", { name: "Retry" })).toBeTruthy();
	expect(
		ui.getByText(
			"The article catalog is unavailable. You can still visit the source above.",
		),
	).toBeTruthy();
});
