import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DomainError } from "../lib/errors.js";

let bookIds: Set<string> | null = null;

export function repoRoot(): string {
	const override = process.env.DAVAR_REPO_ROOT;
	if (override) return override;
	let dir = process.cwd();
	for (let depth = 0; depth < 5; depth++) {
		try {
			readFileSync(join(dir, "data", "knowledge", "registries", "books.json"), "utf8");
			return dir;
		} catch {
			dir = join(dir, "..");
		}
	}
	return process.cwd();
}

export function serverPackageRoot(env: NodeJS.ProcessEnv = process.env): string {
	const override = env.DAVAR_SERVER_ROOT?.trim();
	if (override) return override;
	const cwd = process.cwd();
	if (existsSync(join(cwd, "lib", "bore", "bridge.py"))) return cwd;
	return join(repoRoot(), "server");
}

export function loadBookIds(root?: string): Set<string> {
	if (bookIds) return bookIds;
	const raw = readFileSync(
		join(root ?? repoRoot(), "data", "knowledge", "registries", "books.json"),
		"utf8",
	);
	const books = JSON.parse(raw) as Array<{ id: string }>;
	bookIds = new Set(books.map((book) => book.id));
	return bookIds;
}

export function resetBookIds(): void {
	bookIds = null;
}

export interface CommentaryReference {
	system_id?: string;
	kind?: string;
	book_id?: string;
	chapter?: number;
	verse?: number;
}

export interface CommentaryContextInput {
	schema_version?: number;
	kind?: string;
	reference?: CommentaryReference;
	edition_id?: string;
	token_index?: number;
	token_id?: string;
	selected_text?: string;
	[key: string]: unknown;
}

const ALLOWED_KEYS = new Set([
	"schema_version",
	"kind",
	"reference",
	"edition_id",
	"token_index",
	"token_id",
	"selected_text",
]);

export function validateCommentaryContext(
	context: unknown,
	books: Set<string> = loadBookIds(),
): null | CommentaryContextInput {
	if (context === null || context === undefined) return null;
	if (typeof context !== "object" || Array.isArray(context)) {
		throw new DomainError("invalid_context");
	}
	const input = context as CommentaryContextInput;
	if (input.schema_version !== 1 || (input.kind !== "word" && input.kind !== "verse")) {
		throw new DomainError("invalid_context");
	}
	const ref = input.reference;
	const validRef =
		typeof ref === "object" &&
		ref !== null &&
		(ref as CommentaryReference).system_id === "davar-v1" &&
		(ref as CommentaryReference).kind === "verse" &&
		typeof (ref as CommentaryReference).book_id === "string" &&
		books.has((ref as CommentaryReference).book_id as string) &&
		Number.isInteger((ref as CommentaryReference).chapter) &&
		((ref as CommentaryReference).chapter as number) > 0 &&
		Number.isInteger((ref as CommentaryReference).verse) &&
		((ref as CommentaryReference).verse as number) > 0;
	if (!validRef) throw new DomainError("invalid_reference");
	if (
		typeof input.edition_id !== "string" ||
		input.edition_id.length < 1 ||
		input.edition_id.length > 100
	) {
		throw new DomainError("edition_required");
	}
	if (input.kind === "word") {
		if (!Number.isInteger(input.token_index) || (input.token_index as number) < 0) {
			throw new DomainError("invalid_word_reference");
		}
	}
	for (const key of Object.keys(input)) {
		if (!ALLOWED_KEYS.has(key)) throw new DomainError("invalid_context");
	}
	if (Buffer.byteLength(JSON.stringify(input), "utf8") > 4000) {
		throw new DomainError("context_too_large");
	}
	return input;
}
