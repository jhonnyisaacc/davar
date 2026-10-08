import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost:5300/assemblies" });
for (const key of [
	"window",
	"document",
	"navigator",
	"HTMLElement",
	"HTMLInputElement",
	"Event",
	"MouseEvent",
	"MutationObserver",
	"getComputedStyle",
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
const { act, render, cleanup, fireEvent, waitFor } = await import(
	"@testing-library/react"
);
const { AssembliesWorkspace } = await import(
	"../features/assemblies/AssembliesWorkspace"
);
const { AssembliesEntry } = await import("./AssembliesEntry");
const { productApi } = await import("../services/productApi");
const { ProductApiError } = await import("@davar/shared/productClient");
import type { Account, Assembly } from "@davar/shared/productContracts";

const reader: Account = {
	id: "reader",
	display_name: "QA Reader",
	admitted: true,
	onboarding_complete: true,
	profile: {
		experience: "experienced",
		gender: "female",
		city: "Buenos Aires",
		latitude: -34.6,
		longitude: -58.4,
		answers: Object.fromEntries(
			[1, 2, 3, 4, 5, 6, 7].map((key) => [key, true]),
		),
		visibility_reviewed: true,
	},
	providers: ["email"],
	settings: {},
	settings_version: 0,
	consultations_remaining: 1,
	discoverable: false,
	contact_visible: false,
	leader_verified: false,
	active_assembly_id: null,
};
const local: Assembly = {
	id: "local",
	name: "Local QA",
	kind: "in_person",
	city: "Buenos Aires",
	can_manage: false,
	member_state: "not_member",
	distance_km: 0,
	meeting_url: null,
};
let request = spyOn(productApi, "request");
beforeEach(() => {
	dom.localStorage.setItem("davar.assemblies.splashSeen", "true");
	dom.sessionStorage.clear();
	request = spyOn(productApi, "request").mockImplementation(async (path) => {
		if (path === "/account") return reader as never;
		if (path.includes("/members")) return { memberships: [] } as never;
		return { assemblies: [local], people: [] } as never;
	});
});
afterEach(() => {
	cleanup();
	request.mockRestore();
});
const accountChanged = () => {};

describe("Assemblies discovery and membership UI", () => {
	test("loads local assemblies automatically and translates membership states", async () => {
		const ui = render(
			<AssembliesWorkspace account={reader} onAccount={accountChanged} />,
		);
		await waitFor(() => expect(ui.getByText("Local QA")).toBeTruthy());
		expect(ui.getByText(/Not a member/)).toBeTruthy();
		expect(ui.getByRole("button", { name: "Request to join" })).toBeTruthy();
		expect(request.mock.calls[0][0]).toContain("kind=in_person");
		expect(
			ui.getByLabelText("Share my Telegram contact").hasAttribute("disabled"),
		).toBe(true);
	});
	test("Starting users can browse without an impossible join action", async () => {
		const account = {
			...reader,
			profile: {
				...reader.profile,
				experience: "starting" as const,
				answers: { "1": true, "3": true },
			},
		};
		const ui = render(
			<AssembliesWorkspace account={account} onAccount={accountChanged} />,
		);
		await waitFor(() => expect(ui.getByText("Local QA")).toBeTruthy());
		expect(ui.queryByRole("button", { name: "Request to join" })).toBeNull();
		expect(ui.queryByRole("button", { name: "Leave assembly" })).toBeNull();
	});
	test("members cannot request another assembly or create a second one", async () => {
		const ui = render(
			<AssembliesWorkspace
				account={{
					...reader,
					active_assembly_id: "other",
					leader_verified: true,
				}}
				onAccount={accountChanged}
			/>,
		);
		await waitFor(() => expect(ui.getByText("Local QA")).toBeTruthy());
		expect(ui.queryByRole("button", { name: "Request to join" })).toBeNull();
		expect(ui.queryByText("Create an assembly")).toBeNull();
	});
	test("empty results and failed search give different feedback and retry recovers", async () => {
		request.mockRejectedValueOnce(new TypeError("offline"));
		const ui = render(
			<AssembliesWorkspace account={reader} onAccount={accountChanged} />,
		);
		await waitFor(() =>
			expect(ui.getByRole("alert").textContent).toContain("Unable to connect"),
		);
		expect(ui.queryByText("No assemblies found for this search.")).toBeNull();
		request.mockResolvedValueOnce({ assemblies: [], people: [] } as never);
		fireEvent.click(ui.getByRole("button", { name: "Find assemblies" }));
		await waitFor(() =>
			expect(ui.getByText("No assemblies found for this search.")).toBeTruthy(),
		);
		expect(ui.queryByRole("alert")).toBeNull();
	});
	test("late local results cannot replace the newer online search", async () => {
		let resolveLocal: (value: unknown) => void = () => {};
		request.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveLocal = resolve;
				}) as never,
		);
		const ui = render(
			<AssembliesWorkspace account={reader} onAccount={accountChanged} />,
		);
		request.mockResolvedValueOnce({
			assemblies: [
				{ ...local, id: "online", name: "Online QA", kind: "online" },
			],
			people: [],
		} as never);
		fireEvent.click(ui.getByRole("button", { name: "Online" }));
		await waitFor(() => expect(ui.getByText("Online QA")).toBeTruthy());
		resolveLocal({ assemblies: [local], people: [] });
		await waitFor(() => expect(ui.queryByText("Local QA")).toBeNull());
		expect(ui.getByText("Online QA")).toBeTruthy();
	});
	test("zero coordinates are valid and missing coordinates prompt city selection", async () => {
		const ui = render(
			<AssembliesWorkspace
				account={{
					...reader,
					profile: { ...reader.profile, latitude: 0, longitude: 0 },
				}}
				onAccount={accountChanged}
			/>,
		);
		await waitFor(() => expect(ui.getByText("Local QA")).toBeTruthy());
		expect(request.mock.calls[0][0]).toContain("latitude=0&longitude=0");
		ui.rerender(
			<AssembliesWorkspace
				account={{
					...reader,
					profile: {
						...reader.profile,
						latitude: undefined,
						longitude: undefined,
					},
				}}
				onAccount={accountChanged}
			/>,
		);
		expect(
			ui.getByText("Select your city to search nearby assemblies."),
		).toBeTruthy();
		expect(
			ui
				.getByRole("button", { name: "Find assemblies" })
				.hasAttribute("disabled"),
		).toBe(true);
	});
	test("request to join refreshes the membership state and cancellation remains available", async () => {
		const ui = render(
			<AssembliesWorkspace account={reader} onAccount={accountChanged} />,
		);
		await waitFor(() => expect(ui.getByText("Local QA")).toBeTruthy());
		request.mockImplementation(async (path) => {
			if (path.endsWith("/join")) return { state: "requested" } as never;
			if (path === "/account") return reader as never;
			return {
				assemblies: [{ ...local, member_state: "requested" }],
				people: [],
			} as never;
		});
		fireEvent.click(ui.getByRole("button", { name: "Request to join" }));
		await waitFor(() =>
			expect(ui.getByRole("button", { name: "Cancel request" })).toBeTruthy(),
		);
		expect(ui.getByText(/Request pending/)).toBeTruthy();
	});
	test("rapid repeated join actions send one mutation while it is pending", async () => {
		let finishJoin: (value: unknown) => void = () => {};
		request.mockImplementation(async (path) => {
			if (path.endsWith("/join"))
				return new Promise((resolve) => {
					finishJoin = resolve;
				}) as never;
			if (path === "/account") return reader as never;
			return { assemblies: [local], people: [] } as never;
		});
		const ui = render(
			<AssembliesWorkspace account={reader} onAccount={accountChanged} />,
		);
		await waitFor(() => expect(ui.getByText("Local QA")).toBeTruthy());
		const join = ui.getByRole("button", { name: "Request to join" });
		fireEvent.click(join);
		fireEvent.click(join);
		expect(
			request.mock.calls.filter(([path]) => path.endsWith("/join")),
		).toHaveLength(1);
		expect(join.hasAttribute("disabled")).toBe(true);
		finishJoin({ state: "requested" });
		await waitFor(() => expect(join.hasAttribute("disabled")).toBe(false));
	});
	test("leader management reports invalid links and updates the displayed name on save", async () => {
		const leader = {
			...reader,
			leader_verified: true,
			active_assembly_id: "local",
			profile: { ...reader.profile, gender: "male" as const },
		};
		let assembly = {
			...local,
			can_manage: true,
			member_state: "member" as const,
		};
		request.mockImplementation(async (path, options) => {
			if (path.endsWith("/members")) return { memberships: [] } as never;
			if (options?.method === "PATCH") {
				const body = options.body as { name: string; meeting_url: string };
				if (body.meeting_url === "https://")
					throw new ProductApiError("validation_failed", 422);
				assembly = { ...assembly, ...body };
				return assembly as never;
			}
			return { assemblies: [assembly], people: [] } as never;
		});
		const ui = render(
			<AssembliesWorkspace account={leader} onAccount={accountChanged} />,
		);
		await waitFor(() =>
			expect(ui.getByRole("button", { name: "Manage" })).toBeTruthy(),
		);
		fireEvent.click(ui.getByRole("button", { name: "Manage" }));
		await waitFor(() =>
			expect(ui.getByLabelText("Assembly name")).toBeTruthy(),
		);
		fireEvent.change(ui.getByLabelText("Assembly name"), {
			target: { value: "  Renamed QA  " },
		});
		fireEvent.change(ui.getByLabelText("Meeting link"), {
			target: { value: "https://" },
		});
		fireEvent.click(ui.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(ui.getByRole("alert").textContent).toContain("complete HTTPS"),
		);
		fireEvent.change(ui.getByLabelText("Meeting link"), {
			target: { value: " https://example.test/meeting " },
		});
		fireEvent.click(ui.getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(
				ui.getByRole("heading", { name: "Manage Renamed QA" }),
			).toBeTruthy(),
		);
		expect(
			ui.getByRole("link", { name: "Meeting link" }).getAttribute("href"),
		).toBe("https://example.test/meeting");
		expect(ui.queryByRole("alert")).toBeNull();
	});
	test("nearby discovery exposes a contact action only for an opted-in response", async () => {
		request.mockResolvedValueOnce({
			assemblies: [],
			people: [
				{
					id: "private",
					name: "Private contact",
					area: "Jerusalem",
					contact_url: null,
				},
				{
					id: "shared",
					name: "Shared contact",
					area: "Jerusalem",
					contact_url: "tg://user?id=990000000001",
				},
			],
		} as never);
		const ui = render(
			<AssembliesWorkspace account={reader} onAccount={accountChanged} />,
		);
		await waitFor(() => expect(ui.getByText(/Shared contact/)).toBeTruthy());
		expect(ui.getAllByRole("link", { name: "Contact" })).toHaveLength(1);
		expect(ui.getByRole("link", { name: "Contact" }).getAttribute("href")).toBe(
			"tg://user?id=990000000001",
		);
	});
	test("legacy city without coordinates can still search online", async () => {
		const ui = render(
			<AssembliesWorkspace
				account={{
					...reader,
					profile: {
						...reader.profile,
						latitude: undefined,
						longitude: undefined,
					},
				}}
				onAccount={accountChanged}
			/>,
		);
		expect(request).not.toHaveBeenCalled();
		fireEvent.click(ui.getByRole("button", { name: "Online" }));
		await waitFor(() => expect(request).toHaveBeenCalled());
		expect(request.mock.calls[0][0]).toContain("kind=online");
	});
});

describe("Assemblies invitation UI", () => {
	const entry = (account: Account | null, onAccount = accountChanged) => (
		<AssembliesEntry
			language="en"
			account={account}
			onAccount={onAccount}
			sessionReady
			sessionError=""
			signIn={<button type="button">Sign in</button>}
		>
			<p>Assemblies opened</p>
		</AssembliesEntry>
	);
	test("numeric entry carries the code through sign-in and redeems once", async () => {
		const ui = render(entry(null));
		fireEvent.change(ui.getByRole("textbox", { name: "Access code" }), {
			target: { value: "1234567" },
		});
		await waitFor(() =>
			expect(ui.getByRole("button", { name: "Sign in" })).toBeTruthy(),
		);
		expect(dom.sessionStorage.getItem("davar.assemblies.pendingCode")).toBe(
			"1234567",
		);
		const onAccount = spyOn({ update: accountChanged }, "update");
		request.mockResolvedValueOnce(reader as never);
		ui.rerender(entry({ ...reader, admitted: false }, onAccount));
		await waitFor(() => expect(onAccount).toHaveBeenCalledTimes(1));
		expect(request.mock.calls[0][0]).toBe("/account/admission");
		expect(
			dom.sessionStorage.getItem("davar.assemblies.pendingCode"),
		).toBeNull();
	});
	test("an invalid invitation is explained and a new code can retry", async () => {
		request.mockRejectedValueOnce(new ProductApiError("invalid_code", 403));
		const ui = render(entry({ ...reader, admitted: false }));
		fireEvent.change(ui.getByRole("textbox", { name: "Access code" }), {
			target: { value: "7654321" },
		});
		await waitFor(() => expect(ui.getByRole("alert")).toBeTruthy());
		expect(
			ui
				.getByRole("textbox", { name: "Access code" })
				.getAttribute("aria-invalid"),
		).toBe("true");
		request.mockResolvedValueOnce(reader as never);
		fireEvent.change(ui.getByRole("textbox", { name: "Access code" }), {
			target: { value: "1234567" },
		});
		await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
	});
	test("admitted users open the workspace and Hebrew uses RTL with LTR digits", () => {
		const ui = render(entry(reader));
		expect(ui.getByText("Assemblies opened")).toBeTruthy();
		ui.rerender(
			<AssembliesEntry
				language="he"
				account={null}
				onAccount={accountChanged}
				sessionReady
				sessionError=""
				signIn={<p>Sign in</p>}
			>
				<p>Workspace</p>
			</AssembliesEntry>,
		);
		expect(ui.getByRole("main").getAttribute("dir")).toBe("rtl");
		expect(ui.getByRole("textbox").getAttribute("dir")).toBe("ltr");
	});
	test("signing out clears invitation state and returns to code entry", async () => {
		dom.sessionStorage.setItem("davar.assemblies.pendingCode", "1234567");
		const ui = render(entry(reader));
		expect(ui.getByText("Assemblies opened")).toBeTruthy();
		ui.rerender(entry(null));
		await waitFor(() =>
			expect(ui.getByRole("textbox", { name: "Access code" })).toBeTruthy(),
		);
		expect(
			dom.sessionStorage.getItem("davar.assemblies.pendingCode"),
		).toBeNull();
	});
	test("back clears a pending invitation and does not auto-redeem later", async () => {
		const ui = render(entry(null));
		fireEvent.change(ui.getByRole("textbox"), { target: { value: "1234567" } });
		await waitFor(() =>
			expect(ui.getByRole("button", { name: "Back" })).toBeTruthy(),
		);
		fireEvent.click(ui.getByRole("button", { name: "Back" }));
		expect(
			dom.sessionStorage.getItem("davar.assemblies.pendingCode"),
		).toBeNull();
		ui.rerender(entry({ ...reader, admitted: false }));
		expect(request).not.toHaveBeenCalled();
	});
});

test("Starting onboarding preserves negative answers and progresses through name, city and visibility", async () => {
	let current: Account = {
		...reader,
		display_name: "Reader",
		profile: {},
		onboarding_complete: false,
	};
	const ui = render(
		<AssembliesWorkspace account={current} onAccount={updated} />,
	);
	function updated(account: Account) {
		current = account;
		ui.rerender(<AssembliesWorkspace account={current} onAccount={updated} />);
	}
	request.mockImplementation(async (path, options) => {
		if (path !== "/account") throw new Error("Unexpected request");
		const body = options?.body as Partial<Account>;
		return {
			...current,
			...body,
			profile: { ...current.profile, ...body.profile },
		} as never;
	});
	fireEvent.click(ui.getByRole("button", { name: "Starting" }));
	await waitFor(() =>
		expect(ui.getByText("Question 1 of 2 · Progress saved")).toBeTruthy(),
	);
	fireEvent.click(ui.getByRole("button", { name: "No" }));
	await waitFor(() =>
		expect(ui.getByText("Question 2 of 2 · Progress saved")).toBeTruthy(),
	);
	expect(current.profile.answers?.["1"]).toBe(false);
	fireEvent.click(ui.getByRole("button", { name: "Yes" }));
	await waitFor(() =>
		expect(ui.getByRole("button", { name: "Male" })).toBeTruthy(),
	);
	fireEvent.change(ui.getByRole("textbox", { name: "Your name" }), {
		target: { value: "New Reader" },
	});
	fireEvent.click(ui.getByRole("button", { name: "Male" }));
	await waitFor(() =>
		expect(
			ui.getByText("Choose your city. Discovery uses an approximate area."),
		).toBeTruthy(),
	);
	act(() =>
		updated({
			...current,
			profile: { ...current.profile, city: "Buenos Aires" },
		}),
	);
	expect(ui.getByText("Hidden by default")).toBeTruthy();
	fireEvent.click(ui.getByRole("button", { name: "Continue" }));
	await waitFor(() => expect(current.profile.visibility_reviewed).toBe(true));
	expect(current.profile.answers).toEqual({ "1": false, "3": true });
});

test("leading-zero invitations remain seven-digit strings through persistence and redemption", async () => {
	const entry = (account: Account | null) => (
		<AssembliesEntry
			language="en"
			account={account}
			onAccount={accountChanged}
			sessionReady
			sessionError=""
			signIn={<button type="button">Sign in</button>}
		>
			<p>Assemblies opened</p>
		</AssembliesEntry>
	);
	const ui = render(entry(null));
	fireEvent.change(ui.getByRole("textbox", { name: "Access code" }), {
		target: { value: "0000427" },
	});
	await waitFor(() =>
		expect(ui.getByRole("button", { name: "Sign in" })).toBeTruthy(),
	);
	expect(dom.sessionStorage.getItem("davar.assemblies.pendingCode")).toBe(
		"0000427",
	);
	request.mockResolvedValueOnce(reader as never);
	ui.rerender(entry({ ...reader, admitted: false }));
	await waitFor(() => expect(request.mock.calls).toHaveLength(1));
	expect(request.mock.calls[0][0]).toBe("/account/admission");
	expect(request.mock.calls[0][1]?.body).toEqual({ code: "0000427" });
	await waitFor(() =>
		expect(
			dom.sessionStorage.getItem("davar.assemblies.pendingCode"),
		).toBeNull(),
	);
});
