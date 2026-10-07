import type { Profile } from "./profiles.js";
import { completedOnboarding } from "./profiles.js";

export function canManageAssembly(userId: string, leaderId: string): boolean {
	return leaderId === userId;
}

export function canCreateAssembly(input: {
	leaderVerified: boolean;
	profile: Profile;
}): boolean {
	return (
		input.leaderVerified &&
		completedOnboarding(input.profile) &&
		input.profile.gender === "male"
	);
}

export function canJoinAssembly(profile: Profile): boolean {
	return completedOnboarding(profile) && profile.experience !== "starting";
}
