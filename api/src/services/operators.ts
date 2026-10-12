import { eq } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import { accessCodes, users } from "../db/schema.js";
import { accessCodeDigest } from "./admissions.js";
import { decJson } from "./fields.js";
import { completedOnboarding, type Profile } from "./profiles.js";

const INVITATION_SPAN = 10 ** 7;
const INVITATION_DAYS = 30;
const INVITATION_MAX_USES = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const USER_ID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LEADER_ELIGIBILITY_ERROR = "Eligible male leader onboarding required";

export function invitationCode(value: number): string {
	if (!Number.isInteger(value) || value < 0 || value >= INVITATION_SPAN) {
		throw new Error("Invitation code is out of range");
	}
	return String(value).padStart(7, "0");
}

export function randomInvitationValue(): number {
	const max = 0x1_0000_0000;
	const cutoff = max - (max % INVITATION_SPAN);
	while (true) {
		const sample = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
		if (sample < cutoff) return sample % INVITATION_SPAN;
	}
}

export async function issueInvitation(
	db: DatabaseOrTx,
	input: { now?: Date; value?: number } = {},
): Promise<string> {
	const code = invitationCode(input.value ?? randomInvitationValue());
	const now = input.now ?? new Date();
	await db.insert(accessCodes).values({
		codeDigest: await accessCodeDigest(code),
		expiresAt: new Date(now.getTime() + INVITATION_DAYS * DAY_MS),
		maxUses: INVITATION_MAX_USES,
	});
	return code;
}

function missingUser(userId: string): Error {
	return new Error(`Couldn't find User with 'id'=${userId}`);
}

export async function verifyLeader(
	db: DatabaseOrTx,
	userId: string,
	secrets: string | readonly string[],
): Promise<void> {
	if (!USER_ID_PATTERN.test(userId)) throw missingUser(userId);
	const found = await db.select().from(users).where(eq(users.id, userId)).limit(1);
	const user = found[0];
	if (!user) throw missingUser(userId);
	const profile = await decJson<Profile>(user.profile, secrets, {});
	if (
		!(
			completedOnboarding(profile) &&
			profile.gender === "male" &&
			profile.experience === "leader"
		)
	) {
		throw new Error(LEADER_ELIGIBILITY_ERROR);
	}
	await db
		.update(users)
		.set({ leaderVerified: true, updatedAt: new Date() })
		.where(eq(users.id, user.id));
}
