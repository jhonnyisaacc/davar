import { DomainError } from "../lib/errors.js";
import { decJson, encJson } from "./fields.js";

export type Profile = Record<string, unknown> & {
	experience?: "starting" | "experienced" | "leader";
	city?: string;
	latitude?: number;
	longitude?: number;
	gender?: "male" | "female";
	answers?: Record<string, boolean>;
	visibility_reviewed?: boolean;
	birth_date?: string | null;
};

export function parseProfile(raw: string | null, secret: string): Promise<Profile>;
export function parseProfile(raw: string | null): Profile;
export function parseProfile(
	raw: string | null,
	secret?: string,
): Profile | Promise<Profile> {
	if (raw === null || raw === undefined) return {};
	if (secret) return decJson<Profile>(raw, secret, {});
	try {
		return (JSON.parse(raw) ?? {}) as Profile;
	} catch {
		return {};
	}
}

export function requiredAnswers(experience: unknown): string[] {
	return experience === "starting"
		? ["1", "3"]
		: ["1", "2", "3", "4", "5", "6", "7"];
}

export function completedOnboarding(profile: Profile): boolean {
	const required = requiredAnswers(profile.experience);
	const answers = (profile.answers ?? {}) as Record<string, boolean>;
	return (
		typeof profile.city === "string" &&
		profile.city.length > 0 &&
		(profile.gender === "male" || profile.gender === "female") &&
		(profile.experience === "starting" ||
			profile.experience === "experienced" ||
			profile.experience === "leader") &&
		Object.keys(answers).sort().join(",") === required.slice().sort().join(",") &&
		profile.visibility_reviewed === true
	);
}

export function doctrinalAgreement(profile: Profile): boolean {
	if (profile.experience === "starting") return false;
	const answers = (profile.answers ?? {}) as Record<string, boolean>;
	return ["1", "2", "3", "4", "5", "6", "7"].every((key) => answers[key] === true);
}

export function ageOf(profile: Profile, today: Date = new Date()): number | null {
	try {
		const raw = profile.birth_date;
		if (typeof raw !== "string") return null;
		const born = new Date(`${raw}T00:00:00Z`);
		if (Number.isNaN(born.getTime()) || born > today) return null;
		let age = today.getUTCFullYear() - born.getUTCFullYear();
		const before =
			today.getUTCMonth() < born.getUTCMonth() ||
			(today.getUTCMonth() === born.getUTCMonth() &&
				today.getUTCDate() < born.getUTCDate());
		if (before) age -= 1;
		return age;
	} catch {
		return null;
	}
}

export async function serializeProfile(
	profile: Profile,
	secret: string,
): Promise<string> {
	return encJson(profile, secret);
}

export function assertValidProfileUpdate(
	oldProfile: Profile,
	update: Record<string, unknown>,
	isLeaderVerified: boolean,
): Profile {
	const next: Profile = { ...oldProfile };
	for (const [key, value] of Object.entries(update)) {
		if (key === "answers") continue;
		(next as Record<string, unknown>)[key] = value;
	}
	const gender = (update.gender ?? oldProfile.gender) as unknown;
	const experience = (update.experience ?? oldProfile.experience) as unknown;
	if (
		gender === "female" &&
		(isLeaderVerified || experience === "leader")
	) {
		throw new DomainError("female_leader_forbidden");
	}
	if (update.answers !== undefined) {
		const answers = update.answers as Record<string, boolean>;
		const allowed =
			(experience === "starting" ? ["1", "3"] : ["1", "2", "3", "4", "5", "6", "7"]);
		const keys = Object.keys(answers ?? {});
		const values = Object.values(answers ?? {});
		if (
			typeof answers !== "object" ||
			answers === null ||
			!keys.every((key) => allowed.includes(key)) ||
			!values.every((value) => value === true || value === false)
		) {
			throw new DomainError("invalid_answers");
		}
		next.answers = answers;
	}
	if (update.gender !== undefined && gender !== "male" && gender !== "female") {
		throw new DomainError("invalid_gender");
	}
	if (
		update.experience !== undefined &&
		experience !== "starting" &&
		experience !== "experienced" &&
		experience !== "leader"
	) {
		throw new DomainError("invalid_experience");
	}
	if (update.birth_date !== undefined) {
		next.birth_date = enforceBirthdate(update.birth_date);
	}
	return next;
}

function enforceBirthdate(value: unknown): string | null {
	if (typeof value !== "string" || value.length > 10) return null;
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
	const date = new Date(`${value}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return null;
	const [year, month, day] = value.split("-").map(Number);
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() + 1 !== month ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	return value;
}
