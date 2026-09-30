import { BOOKS } from "./books";
// Product contracts extend the existing davar-v1 Scripture reference system.
export type ScriptureReference = {
	system_id: "davar-v1";
	kind: "verse";
	book_id: string;
	chapter: number;
	verse: number;
};
export type CommentaryContext = {
	schema_version: 1;
	kind: "verse" | "word";
	reference: ScriptureReference;
	edition_id: string;
	token_index?: number;
	token_id?: string;
	selected_text?: string;
};
export const SIGN_IN_PROVIDERS = [
	"google",
	"apple",
	"facebook",
	"telegram",
	"x",
	"email",
] as const;
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number];
export type Account = {
	consultations_remaining: number;
	id: string;
	display_name: string;
	profile: {
		experience?: "starting" | "experienced" | "leader";
		city?: string;
		latitude?: number;
		longitude?: number;
		gender?: "male" | "female";
		answers?: Record<string, boolean>;
		visibility_reviewed?: boolean;
	};
	settings: Record<string, unknown>;
	settings_version: number;
	discoverable: boolean;
	contact_visible: boolean;
	admitted: boolean;
	leader_verified: boolean;
	onboarding_complete: boolean;
	providers: SignInProvider[];
};
export type Assembly = {
	id: string;
	name: string;
	kind: "in_person" | "online";
	city: string | null;
	member_state: "not_member" | "requested" | "member";
	can_manage: boolean;
	distance_km: number | null;
	meeting_url: string | null;
};
export type MembershipRequest = {
	id: string;
	state: "requested" | "member" | "declined" | "left";
	user: {
		id: string;
		name: string;
		gender: string | null;
		age?: number | null;
		contact_url?: string | null;
	};
};
export type Article = {
	id: string;
	source_id: string;
	title: string;
	locale: string;
	source_url: string;
	attribution: string;
	references: ScriptureReference[];
	revision: string;
	body?: string;
	permissions?: { public_display?: boolean; ai_grounding?: boolean };
};
export type Citation = {
	article_id: string;
	source_id: string;
	source_url: string;
	revision: string;
	attribution: string;
};
export type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	context?: CommentaryContext;
	citations: Citation[] | null;
	state: "pending" | "complete" | "failed";
	generation: {
		provider?: string;
		model?: string;
		prompt_version?: string;
		input_hash?: string;
		material_state?: "generated";
	};
};
export type Conversation = {
	id: string;
	title: string;
	messages: ChatMessage[];
};
export type CalendarDay = {
	civil_date: string;
	biblical: {
		day: number | null;
		month_id: string | null;
		month_ordinal: number | null;
	};
	rabbinic: { day: number; month_id: string; year: number };
	events: string[];
	month_status: string;
	year_start_status: string;
	confirmation_id: string | null;
};
export type CalendarResponse = {
	schema_version: 1;
	days: CalendarDay[];
	year_start_status: string;
};
export type ProviderConnection = {
	id: string;
	provider: string;
	model: string;
};
export function scriptureContext(input: {
	bookId: string;
	chapter: number;
	verse: number;
	edition: string;
	word?: { index: number; text: string };
}): CommentaryContext {
	if (
		!input.edition ||
		!input.bookId ||
		!Number.isInteger(input.chapter) ||
		input.chapter < 1 ||
		!Number.isInteger(input.verse) ||
		input.verse < 1
	)
		throw new Error("Invalid Scripture context");
	if (
		input.word &&
		(!Number.isInteger(input.word.index) || input.word.index < 0)
	)
		throw new Error("Invalid word context");
	const book = BOOKS.find(
		(book) => book.id === input.bookId || book.name === input.bookId,
	);
	if (!book) throw new Error("Unknown Scripture book");
	return {
		schema_version: 1,
		kind: input.word ? "word" : "verse",
		edition_id: input.edition,
		reference: {
			system_id: "davar-v1",
			kind: "verse",
			book_id: book.id,
			chapter: input.chapter,
			verse: input.verse,
		},
		...(input.word
			? { token_index: input.word.index, selected_text: input.word.text }
			: {}),
	};
}
