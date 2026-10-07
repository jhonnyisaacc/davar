import { beforeEach, describe, expect, test } from "bun:test";
import { testDb } from "./helper.js";
import {
	authHeaders,
	createUser,
	makeTestContext,
	READER_PROFILE,
	truncateAll,
} from "./helper.js";
import { resolveAccount } from "../src/services/accounts.js";

const LEADER_PROFILE = {
	...READER_PROFILE,
	experience: "leader",
};

async function identify(userId: string, subject: string): Promise<void> {
	await resolveAccount(testDb().db, {
		provider: "google",
		subject,
		linkingUserId: userId,
		primaryKey: "test-primary-key-for-davar-server-only-0001",
		deterministicKey: "test-deterministic-key-davar-only-0001",
	});
}

async function reader(): Promise<{ id: string; headers: Record<string, string> }> {
	const id = await createUser();
	await identify(id, `reader-${id}`);
	return { id, headers: await authHeaders(id) };
}

async function leader(): Promise<{ id: string; headers: Record<string, string> }> {
	const id = await createUser({ profile: LEADER_PROFILE, leaderVerified: true });
	await identify(id, `leader-${id}`);
	return { id, headers: await authHeaders(id) };
}

beforeEach(truncateAll);

describe("assemblies access", () => {
	test("guests and incomplete onboarding are gated", async () => {
		const { app } = makeTestContext();
		const guest = await createUser({ profile: {}, admittedAt: null });
		const gated = await app.request("/api/v1/assemblies?kind=online", {
			headers: await authHeaders(guest),
		});
		expect(gated.status).toBe(403);
		expect(await gated.json()).toEqual({ error: { code: "registered_account_required" } });

		const fresh = await createUser({ profile: {} });
		await identify(fresh, `fresh-${fresh}`);
		const onboarding = await app.request("/api/v1/assemblies?kind=online", {
			headers: await authHeaders(fresh),
		});
		expect(onboarding.status).toBe(403);
		expect(await onboarding.json()).toEqual({ error: { code: "onboarding_required" } });
	});

	test("online index and validation", async () => {
		const { app } = makeTestContext();
		const { headers } = await reader();
		const empty = await app.request("/api/v1/assemblies?kind=online", { headers });
		expect(empty.status).toBe(200);
		expect(await empty.json()).toEqual({ assemblies: [], people: [] });

		const badKind = await app.request("/api/v1/assemblies?kind=remote", { headers });
		expect(badKind.status).toBe(422);
		expect(await badKind.json()).toEqual({ error: { code: "invalid_kind" } });

		const badArea = await app.request("/api/v1/assemblies?kind=in_person", { headers });
		expect(badArea.status).toBe(422);
		expect(await badArea.json()).toEqual({ error: { code: "invalid_area" } });

		const badRadius = await app.request(
			"/api/v1/assemblies?kind=in_person&latitude=0&longitude=0&radius_km=7",
			{ headers },
		);
		expect(badRadius.status).toBe(422);
	});
});

describe("assembly discovery parity", () => {
	test("online index returns id order", async () => {
		const { app } = makeTestContext();
		const first = await leader();
		const second = await leader();
		for (const lead of [first, second]) {
			const created = await app.request("/api/v1/assemblies", {
				method: "POST",
				headers: lead.headers,
				body: JSON.stringify({ name: `Online ${lead.id}`, kind: "online" }),
			});
			expect(created.status).toBe(201);
		}
		const { headers } = await reader();
		const response = await app.request("/api/v1/assemblies?kind=online", { headers });
		const body = (await response.json()) as { assemblies: Array<{ id: string }> };
		const ids = body.assemblies.map((item) => item.id);
		expect(ids).toEqual([...ids].sort());
	});

	test("in-person discovery maps leader and meeting fields", async () => {
		const { app } = makeTestContext();
		const lead = await leader();
		const created = await app.request("/api/v1/assemblies", {
			method: "POST",
			headers: lead.headers,
			body: JSON.stringify({
				name: "Local Qahal",
				kind: "in_person",
				meeting_url: "https://example.test/room",
			}),
		});
		expect(created.status).toBe(201);
		const res = await app.request(
			"/api/v1/assemblies?kind=in_person&latitude=-34.6&longitude=-58.4&radius_km=10",
			{ headers: lead.headers },
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			assemblies: Array<{
				member_state: string;
				can_manage: boolean;
				meeting_url: string | null;
			}>;
		};
		expect(body.assemblies).toHaveLength(1);
		expect(body.assemblies[0]?.member_state).toBe("member");
		expect(body.assemblies[0]?.can_manage).toBe(true);
		expect(body.assemblies[0]?.meeting_url).toBe("https://example.test/room");
	});

	test("people fallback requires identities and admission", async () => {
		const { app } = makeTestContext();
		const { headers } = await reader();
		const nearOrigin = { ...READER_PROFILE, latitude: 0.05, longitude: 0.05 };
		const noIdentity = await createUser({ profile: nearOrigin, discoverable: true });
		const unadmitted = await createUser({
			profile: nearOrigin,
			discoverable: true,
			admittedAt: null,
		});
		await identify(unadmitted, `unadmitted-${unadmitted}`);
		const admitted = await createUser({ profile: nearOrigin, discoverable: true });
		await identify(admitted, `admitted-${admitted}`);

		const response = await app.request(
			"/api/v1/assemblies?kind=in_person&latitude=0&longitude=0&radius_km=10",
			{ headers },
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { people: Array<{ id: string }> };
		const ids = body.people.map((item) => item.id);
		expect(ids).not.toContain(noIdentity);
		expect(ids).not.toContain(unadmitted);
		expect(ids).toContain(admitted);
	});

	test("account carries the active assembly id", async () => {
		const { app } = makeTestContext();
		const lead = await leader();
		const created = await app.request("/api/v1/assemblies", {
			method: "POST",
			headers: lead.headers,
			body: JSON.stringify({ name: "Qahal", kind: "online" }),
		});
		const assembly = (await created.json()) as { id: string };
		const mine = (await (
			await app.request("/api/v1/account", { headers: lead.headers })
		).json()) as { active_assembly_id: string | null };
		expect(mine.active_assembly_id).toBe(assembly.id);

		const { headers } = await reader();
		const other = (await (
			await app.request("/api/v1/account", { headers })
		).json()) as { active_assembly_id: unknown };
		expect(other.active_assembly_id).toBe(null);
	});

	test("assembly update validates meeting_url like Rails", async () => {
		const { app } = makeTestContext();
		const lead = await leader();
		const created = await app.request("/api/v1/assemblies", {
			method: "POST",
			headers: lead.headers,
			body: JSON.stringify({ name: "Qahal", kind: "online" }),
		});
		const assembly = (await created.json()) as { id: string };

		for (const meeting_url of ["not-a-url", "https://"]) {
			const bad = await app.request(`/api/v1/assemblies/${assembly.id}`, {
				method: "PATCH",
				headers: lead.headers,
				body: JSON.stringify({ meeting_url }),
			});
			expect(bad.status).toBe(422);
			expect(await bad.json()).toEqual({
				error: { code: "validation_failed", details: expect.anything() },
			});
		}

		const good = await app.request(`/api/v1/assemblies/${assembly.id}`, {
			method: "PATCH",
			headers: lead.headers,
			body: JSON.stringify({ meeting_url: "https://example.test/room" }),
		});
		expect(good.status).toBe(200);
		expect(((await good.json()) as { meeting_url: unknown }).meeting_url).toBe(
			"https://example.test/room",
		);
	});
});

describe("assembly lifecycle", () => {
	test("creation is policy-gated and reuses the leader location", async () => {
		const { app } = makeTestContext();
		const { headers } = await reader();
		const denied = await app.request("/api/v1/assemblies", {
			method: "POST",
			headers,
			body: JSON.stringify({ name: "Nope", kind: "online" }),
		});
		expect(denied.status).toBe(403);
		expect(await denied.json()).toEqual({ error: { code: "leader_verification_required" } });

		const lead = await leader();
		const created = await app.request("/api/v1/assemblies", {
			method: "POST",
			headers: lead.headers,
			body: JSON.stringify({ name: "Buenos Aires", kind: "in_person" }),
		});
		expect(created.status).toBe(201);
		const body = (await created.json()) as {
			city: string;
			member_state: string;
			can_manage: boolean;
			meeting_url: null;
		};
		expect(body.city).toBe("Buenos Aires");
		expect(body.member_state).toBe("member");
		expect(body.can_manage).toBe(true);
		expect(body.meeting_url).toBe(null);

		const second = await app.request("/api/v1/assemblies", {
			method: "POST",
			headers: lead.headers,
			body: JSON.stringify({ name: "Second", kind: "online" }),
		});
		expect(second.status).toBe(409);
		expect(await second.json()).toEqual({ error: { code: "already_member_elsewhere" } });
	});

	test("join, members, decide and leave follow the policy", async () => {
		const { app } = makeTestContext();
		const lead = await leader();
		const created = await app.request("/api/v1/assemblies", {
			method: "POST",
			headers: lead.headers,
			body: JSON.stringify({ name: "Qahal", kind: "online", meeting_url: "https://example.test/m" }),
		});
		const assembly = (await created.json()) as { id: string };
		const other = await reader();

		const join = await app.request(`/api/v1/assemblies/${assembly.id}/join`, {
			method: "POST",
			headers: other.headers,
		});
		expect(join.status).toBe(200);
		expect(await join.json()).toEqual({
			id: expect.any(String),
			state: "requested",
		});

		const again = await app.request(`/api/v1/assemblies/${assembly.id}/join`, {
			method: "POST",
			headers: other.headers,
		});
		expect((await again.json()) as { state: string }).toMatchObject({ state: "requested" });

		const members = await app.request(`/api/v1/assemblies/${assembly.id}/members`, {
			headers: lead.headers,
		});
		expect(members.status).toBe(200);
		const list = ((await members.json()) as { memberships: Array<{ id: string; state: string; user: { gender: string; age: unknown; contact_url: unknown } }> }).memberships;
		const requested = list.find((item) => item.state === "requested");
		expect(requested?.user.gender).toBe("male");
		// Contact links stay private unless the member opted into visibility,
		// even when they own a Telegram identity.
		const { resolveAccount } = await import("../src/services/accounts.js");
		const { testDb } = await import("./helper.js");
		await resolveAccount(testDb().db, {
			provider: "telegram",
			subject: "telegram-contact-1",
			linkingUserId: other.id,
			primaryKey: "test-primary-key-for-davar-server-only-0001",
			deterministicKey: "test-deterministic-key-davar-only-0001",
		});
		const hidden = (await (
			await app.request(`/api/v1/assemblies/${assembly.id}/members`, {
				headers: lead.headers,
			})
		).json()) as { memberships: Array<{ state: string; user: { contact_url: unknown } }> };
		expect(hidden.memberships.find((item) => item.state === "requested")?.user.contact_url).toBe(
			null,
		);
		const { db } = makeTestContext().deps;
		const { users } = await import("../src/db/schema.js");
		const { eq } = await import("drizzle-orm");
		await db.update(users).set({ contactVisible: true }).where(eq(users.id, other.id));
		const visible = (await (
			await app.request(`/api/v1/assemblies/${assembly.id}/members`, {
				headers: lead.headers,
			})
		).json()) as { memberships: Array<{ state: string; user: { contact_url: unknown } }> };
		expect(
			visible.memberships.find((item) => item.state === "requested")?.user.contact_url,
		).toBe("tg://user?id=telegram-contact-1");

		const stranger = await reader();
		const forbidden = await app.request(`/api/v1/assemblies/${assembly.id}/members`, {
			headers: stranger.headers,
		});
		expect(forbidden.status).toBe(404);

		const decide = await app.request(
			`/api/v1/assemblies/${assembly.id}/memberships/${requested?.id}/decision`,
			{ method: "POST", headers: lead.headers, body: JSON.stringify({ decision: "accepted" }) },
		);
		expect(decide.status).toBe(200);
		expect(await decide.json()).toEqual({ id: requested?.id, state: "member" });

		const badDecision = await app.request(
			`/api/v1/assemblies/${assembly.id}/memberships/${requested?.id}/decision`,
			{ method: "POST", headers: lead.headers, body: JSON.stringify({ decision: "maybe" }) },
		);
		expect(badDecision.status).toBe(422);
		expect(await badDecision.json()).toEqual({ error: { code: "invalid_decision" } });

		const leaderLeave = await app.request(`/api/v1/assemblies/${assembly.id}/leave`, {
			method: "DELETE",
			headers: lead.headers,
		});
		expect(leaderLeave.status).toBe(409);

		const leave = await app.request(`/api/v1/assemblies/${assembly.id}/leave`, {
			method: "DELETE",
			headers: other.headers,
		});
		expect(leave.status).toBe(204);
	});

	test("starting users cannot join and second acceptances conflict", async () => {
		const { app } = makeTestContext();
		const lead = await leader();
		const one = (await (
			await app.request("/api/v1/assemblies", {
				method: "POST",
				headers: lead.headers,
				body: JSON.stringify({ name: "One", kind: "online" }),
			})
		).json()) as { id: string };

		const starting = await createUser({
			profile: {
				experience: "starting",
				city: "City",
				gender: "male",
				visibility_reviewed: true,
				answers: { "1": true, "3": true },
			},
		});
		await identify(starting, `starting-${starting}`);
		const blocked = await app.request(`/api/v1/assemblies/${one.id}/join`, {
			method: "POST",
			headers: await authHeaders(starting),
		});
		expect(blocked.status).toBe(403);
		expect(await blocked.json()).toEqual({ error: { code: "starting_cannot_join" } });
	});

	test("updates are leader-scoped and ignore location fields", async () => {
		const { app } = makeTestContext();
		const lead = await leader();
		const created = (await (
			await app.request("/api/v1/assemblies", {
				method: "POST",
				headers: lead.headers,
				body: JSON.stringify({ name: "Original", kind: "online" }),
			})
		).json()) as { id: string };
		const other = await reader();
		const missing = await app.request(`/api/v1/assemblies/${created.id}`, {
			method: "PATCH",
			headers: other.headers,
			body: JSON.stringify({ name: "Hijack" }),
		});
		expect(missing.status).toBe(404);
		const renamed = await app.request(`/api/v1/assemblies/${created.id}`, {
			method: "PATCH",
			headers: lead.headers,
			body: JSON.stringify({ name: "Renamed", kind: "in_person", city: "Nowhere" }),
		});
		expect(renamed.status).toBe(200);
		const body = (await renamed.json()) as { name: string; kind: string; city: null };
		expect(body.name).toBe("Renamed");
		expect(body.kind).toBe("online");
		expect(body.city).toBe(null);
	});

	test("leaders directory filters by name", async () => {
		const { app } = makeTestContext();
		const lead = await leader();
		const { headers } = await reader();
		const all = await app.request("/api/v1/assemblies/leaders", { headers });
		expect(all.status).toBe(200);
		const leaders = ((await all.json()) as { leaders: Array<{ id: string; name: string }> }).leaders;
		expect(leaders.map((item) => item.id)).toContain(lead.id);
		const filtered = await app.request("/api/v1/assemblies/leaders?q=zzz-no-such-name", {
			headers,
		});
		expect(((await filtered.json()) as { leaders: unknown[] }).leaders).toEqual([]);
		const tooLong = await app.request(`/api/v1/assemblies/leaders?q=${"x".repeat(101)}`, {
			headers,
		});
		expect(tooLong.status).toBe(422);
	});
});

describe("endorsements", () => {
	test("two acceptances verify the applicant and declines need support", async () => {
		const { app } = makeTestContext();
		const applicant = await createUser({
			profile: { ...READER_PROFILE, experience: "leader" },
		});
		await identify(applicant, `applicant-${applicant}`);
		const applicantHeaders = await authHeaders(applicant);
		const first = await leader();
		const second = await leader();

		const invalid = await app.request("/api/v1/endorsements", {
			method: "POST",
			headers: applicantHeaders,
			body: JSON.stringify({ leader_id: applicant }),
		});
		expect(invalid.status).toBe(422);
		expect(await invalid.json()).toEqual({ error: { code: "invalid_endorser" } });

		for (const endorser of [first, second]) {
			const created = await app.request("/api/v1/endorsements", {
				method: "POST",
				headers: applicantHeaders,
				body: JSON.stringify({ leader_id: endorser.id }),
			});
			expect(created.status).toBe(201);
		}
		const third = await leader();
		const capped = await app.request("/api/v1/endorsements", {
			method: "POST",
			headers: applicantHeaders,
			body: JSON.stringify({ leader_id: third.id }),
		});
		expect(capped.status).toBe(409);
		expect(await capped.json()).toEqual({ error: { code: "two_endorsers_maximum" } });

		const index = await app.request("/api/v1/endorsements", { headers: first.headers });
		const items = ((await index.json()) as {
			endorsements: Array<{ id: string; state: string; can_decide: boolean }>;
		}).endorsements;
		expect(items).toHaveLength(1);
		expect(items[0]?.can_decide).toBe(true);

		for (const endorser of [first, second]) {
			const item = (
				(await (
					await app.request("/api/v1/endorsements", { headers: endorser.headers })
				).json()) as { endorsements: Array<{ id: string }> }
			).endorsements[0];
			const accepted = await app.request(`/api/v1/endorsements/${item?.id}`, {
				method: "PATCH",
				headers: endorser.headers,
				body: JSON.stringify({ state: "accepted" }),
			});
			expect(accepted.status).toBe(200);
		}
		const me = await app.request("/api/v1/account", { headers: applicantHeaders });
		expect(((await me.json()) as { leader_verified: boolean }).leader_verified).toBe(true);

		const stranger = await app.request(`/api/v1/endorsements/${items[0]?.id}`, {
			method: "PATCH",
			headers: applicantHeaders,
			body: JSON.stringify({ state: "accepted" }),
		});
		expect(stranger.status).toBe(404);
	});
});
