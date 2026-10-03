// Established Qahal questionnaire, preserved from feat/new-redesign.
export const QAHAL_QUESTIONS = [
	"Do you believe that Yeshua is the Messiah of Israel?",
	"Do you believe that we're called to keep the Torah and Yeshua's testimony?",
	"Do you believe that Yeshua is The Prophet?",
	"Do you believe that Elohim is one?",
	"Do you believe that Yeshua is YHWH?",
	"Do you believe that Adonai has made one single people out of Jews and Gentiles?",
	"From now on, will you abstain from what is offered to idols, blood, what is strangled, and sexual inmorality?",
] as const;

const STARTING_QUESTIONS = ["1", "3"] as const;
const EXPERIENCED_QUESTIONS = ["1", "2", "3", "4", "5", "6", "7"] as const;
export function qahalQuestionIds(
	experience: string | undefined,
): readonly string[] {
	return experience === "starting" ? STARTING_QUESTIONS : EXPERIENCED_QUESTIONS;
}

export function qahalOnboardingStep(account: {
	profile: {
		experience?: string;
		answers?: Record<string, boolean>;
		gender?: string;
		city?: string;
	};
	onboarding_complete: boolean;
}) {
	const profile = account.profile;
	if (!profile.experience) return "experience";
	if (
		qahalQuestionIds(profile.experience).some(
			(key) => profile.answers?.[key] === undefined,
		)
	)
		return "questions";
	if (!profile.gender) return "name";
	if (!profile.city) return "city";
	return account.onboarding_complete ? null : "visibility";
}
