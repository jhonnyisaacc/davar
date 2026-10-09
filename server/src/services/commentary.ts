import { and, desc, eq, sql } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import {
	articles,
	conversations,
	messages,
	providerConnections,
	users,
} from "../db/schema.js";
import { sha256Hex } from "../lib/crypto.js";
import { DomainError } from "../lib/errors.js";
import { validateCommentaryContext, type CommentaryContextInput } from "./context.js";
import { dec, decJson, decryptionRing, enc, encJson, type PreviousKeys } from "./fields.js";
import { evaluateFlags, type FlagSet } from "./flags.js";
import { generateCompletion } from "./provider.js";
import {
	availableProviders,
	developmentOpenrouter,
	sharedModel,
	sharedOpenrouter,
} from "./provider.js";
import { sandboxEnabled, sandboxGenerate } from "./sandbox.js";
import { reserveShared } from "./capabilities.js";
import {
	answerInputHash,
	COMMENTARY_PROMPT_VERSION,
	COMMENTARY_SYSTEM_PROMPT,
	coverageResponse,
	normalizeText,
	parseGroundedAnswer,
	responseSchema,
	searchTerms,
} from "./commentaryText.js";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

export interface AnswerShape {
	id: string;
	role: string;
	content: string;
	context: CommentaryContextInput | null;
	citations: unknown[] | null;
	state: string;
	generation: Record<string, unknown>;
	createdAt: Date;
}

export interface AskDeps {
	env?: NodeJS.ProcessEnv;
	nodeEnv?: string;
	flags?: FlagSet | null;
	http?: import("./oauth.js").ProviderHttp;
	generator?: (input: {
		provider: string;
		credential: string;
		model: string;
		system: string;
		messages: Array<{ role: string; content: string }>;
		responseSchema?: Record<string, unknown>;
	}) => Promise<string>;
}

async function toAnswer(row: {
	id: string;
	role: string;
	content: string | null;
	context: string | null;
	citations: string | null;
	state: string;
	generation: Record<string, unknown>;
	createdAt: Date;
}, keys: readonly string[]): Promise<AnswerShape> {
	return {
		id: row.id,
		role: row.role,
		content: (await dec(row.content, keys)) ?? "",
		context: await decJson<CommentaryContextInput | null>(row.context, keys, null),
		citations: await decJson<unknown[] | null>(row.citations, keys, null),
		state: row.state,
		generation: row.generation ?? {},
		createdAt: row.createdAt,
	};
}

export interface EvidenceItem {
	source_id: string;
	article_id: string;
	title: string;
	revision: string;
	sha256: string;
	attribution: string;
	source_url: string;
	text: string;
	citation: { article_id: string; source_id: string; source_url: string; revision: string; attribution: string };
}

function referenceEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

export async function searchArticles(
	db: DatabaseOrTx,
	input: { question: string; reference: unknown; primaryKey: string } & PreviousKeys,
): Promise<EvidenceItem[]> {
	const keys = decryptionRing(input.primaryKey, input.previousKeys);
	const keywords = searchTerms(input.question);
	const rows = await db
		.select()
		.from(articles)
		.where(
			sql`publication_state = 'published' AND permissions @> ${JSON.stringify({ public_display: true, ai_grounding: true })}::jsonb`,
		);
	const scored: Array<{ score: number; item: EvidenceItem }> = [];
	for (const article of rows) {
		const body = (await dec(article.body, keys)) ?? "";
		const exact =
			!!input.reference &&
			(Array.isArray(article.references) ? article.references : []).some((ref) =>
				referenceEqual(ref, input.reference),
			);
		const hits = keywords.filter((term) =>
			normalizeText(`${article.title} ${body}`).split(" ").includes(term),
		);
		if (!(exact || (keywords.length > 0 && hits.length >= Math.min(keywords.length, 2)))) {
			continue;
		}
		const text = body;
		scored.push({
			score: exact ? 1000 : 50,
			item: {
				source_id: article.sourceId,
				article_id: article.id,
				title: article.title,
				revision: article.revision,
				sha256: await sha256Hex(text),
				attribution: article.attribution,
				source_url: article.sourceUrl,
				text,
				citation: {
					article_id: article.id,
					source_id: article.sourceId,
					source_url: article.sourceUrl,
					revision: article.revision,
					attribution: article.attribution,
				},
			},
		});
	}
	scored.sort((a, b) => b.score - a.score || (a.item.source_id < b.item.source_id ? -1 : 1));
	const budgetRaw = Number(process.env.COMMENTARY_EVIDENCE_BYTES ?? "32768");
	if (!Number.isInteger(budgetRaw) || budgetRaw < 1024 || budgetRaw > 131072) {
		throw new DomainError("invalid_evidence_budget", 503);
	}
	const picked = scored.slice(0, 3);
	const perItem = Math.max(1024, Math.floor(budgetRaw / 3));
	return picked.map((entry) => ({
		...entry.item,
		text: entry.item.text.slice(0, perItem),
	}));
}

export async function askCommentary(
	db: DatabaseOrTx,
	input: {
		conversationId: string;
		userId: string;
		content: unknown;
		context: unknown;
		requestId: unknown;
		provider?: string | null;
		primaryKey: string;
	} & PreviousKeys,
	deps: AskDeps = {},
): Promise<AnswerShape> {
	const env = deps.env ?? process.env;
	const keys = decryptionRing(input.primaryKey, input.previousKeys);
	const nodeEnv = deps.nodeEnv ?? env.NODE_ENV ?? "development";
	if (typeof input.requestId !== "string" || !REQUEST_ID_PATTERN.test(input.requestId)) {
		throw new DomainError("request_id_required");
	}
	if (
		typeof input.content !== "string" ||
		input.content.length < 1 ||
		input.content.length > 16000
	) {
		throw new DomainError("invalid_message");
	}
	const context = validateCommentaryContext(
		input.context as Record<string, unknown> | null,
	);
	const flags = await evaluateFlags(input.userId, {
		env,
		http: deps.http,
		flags: deps.flags,
	});
	const sandbox = sandboxEnabled(env, nodeEnv);
	const development = flags.ai_shared_openrouter && developmentOpenrouter(env, nodeEnv);
	const sharedAvailable = flags.ai_shared_openrouter && sharedOpenrouter(env) && !development;
	const simulation = flags.ai_shared_openrouter && sandbox && !development;
	const state: {
		answerId: string;
		sponsored: boolean;
		shared: boolean;
		connection: { provider: string; credential: string | null; model: string } | null;
	} = { answerId: "", sponsored: false, shared: false, connection: null };

	await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE`);
		const convo = await tx.execute(
			sql`SELECT id FROM conversations WHERE id = ${input.conversationId} AND user_id = ${input.userId} FOR UPDATE`,
		);
		if (!convo[0]) throw new DomainError("not_found", 404);
		const prior = await tx
			.select()
			.from(messages)
			.where(
				and(
					eq(messages.conversationId, input.conversationId),
					eq(messages.requestId, input.requestId as string),
				),
			)
			.limit(1);
		if (prior[0]) {
			state.answerId = prior[0].id;
			return;
		}
		const pending = await tx
			.select({ id: messages.id })
			.from(messages)
			.where(
				and(
					eq(messages.conversationId, input.conversationId),
					eq(messages.role, "assistant"),
					eq(messages.state, "pending"),
				),
			)
			.limit(1);
		if (pending[0]) throw new DomainError("conversation_busy", 409);
		const approved =
			flags.ai_provider_connections && !development ? availableProviders(env) : [];
		const owned = await tx
			.select()
			.from(providerConnections)
			.where(eq(providerConnections.userId, input.userId));
		const match = input.provider
			? owned.find((row) => row.provider === input.provider && approved.includes(row.provider))
			: owned.find((row) => approved.includes(row.provider));
		state.connection = match
			? {
					provider: match.provider,
					credential: await dec(match.credential, keys),
					model: match.model,
				}
			: null;
		const connection = state.connection;
		const shared = sharedAvailable && !connection;
		state.shared = shared;
		if (!connection && !development && !shared && !simulation) {
			throw new DomainError("ai_unavailable", 503);
		}
		const sponsored = simulation && !connection;
		state.sponsored = sponsored;
		if (sponsored) {
			const owner = await tx
				.select({ freeConsultations: users.freeConsultations })
				.from(users)
				.where(eq(users.id, input.userId))
				.limit(1);
			if ((owner[0]?.freeConsultations ?? 0) >= 1) {
				throw new DomainError("provider_connection_required", 402);
			}
		}
		await tx.insert(messages).values({
			conversationId: input.conversationId,
			role: "user",
			content: await enc(input.content as string, input.primaryKey),
			context: input.context ? await encJson(input.context, input.primaryKey) : null,
			state: "complete",
		});
		const created = await tx
			.insert(messages)
			.values({
				conversationId: input.conversationId,
				role: "assistant",
				content: await enc("Pending", input.primaryKey),
				requestId: input.requestId as string,
				state: "pending",
				generation: { sponsored },
			})
			.returning({ id: messages.id });
		const row = created[0];
		if (!row) throw new Error("Message insert failed");
		state.answerId = row.id;
		if (sponsored) {
			await tx.execute(
				sql`UPDATE users SET free_consultations = free_consultations + 1, updated_at = now() WHERE id = ${input.userId}`,
			);
		}
	});

	const answerId = state.answerId;
	const connection = state.connection;
	const sponsored = state.sponsored;
	const shared = state.shared;
	if (answerId) {
		const existing = await db
			.select()
			.from(messages)
			.where(eq(messages.id, answerId))
			.limit(1);
		const row = existing[0];
		if (row && row.state !== "pending") {
			return toAnswer(row, keys);
		}
	}

	try {
		const ref = (context as CommentaryContextInput | null)?.reference ?? null;
		const evidence = await searchArticles(db, {
			question: input.content as string,
			reference: ref,
			primaryKey: input.primaryKey,
			previousKeys: input.previousKeys,
		});
		let system =
			`${COMMENTARY_SYSTEM_PROMPT}\n\nAuthorized evidence:\n` +
			JSON.stringify(
				evidence.map((item) => ({
					source_id: item.source_id,
					text: item.text,
					revision: item.revision,
					attribution: item.attribution,
				})),
			);
		if (context) {
			system += `\nSelected Scripture context (navigation metadata, not source evidence): ${JSON.stringify(context)}`;
		}
		const convoRow = await db
			.select({ memory: conversations.memory })
			.from(conversations)
			.where(eq(conversations.id, input.conversationId))
			.limit(1);
		const memory = await dec(convoRow[0]?.memory, keys);
		if (memory) system += `\nPrior conversation summary (untrusted): ${memory}`;
		const historyRows = await db
			.select()
			.from(messages)
			.where(and(eq(messages.conversationId, input.conversationId), eq(messages.state, "complete")))
			.orderBy(desc(messages.createdAt), desc(messages.id))
			.limit(20);
		const history = await Promise.all(
			historyRows.reverse().map(async (message) => ({
				role: message.role,
				content: (await dec(message.content, keys)) ?? "",
			})),
		);
		let providerId: string;
		let model: string;
		let credential: string;
		if (development) {
			providerId = "openrouter";
			model = env.OPENROUTER_MODEL ?? "";
			credential = env.OPENROUTER_API_KEY ?? "";
		} else if (connection) {
			providerId = connection.provider;
			model = connection.model;
			credential = connection.credential ?? "";
		} else if (simulation) {
			providerId = "chatgpt";
			model = "development-fixture-v1";
			credential = "development-only";
		} else {
			providerId = "openrouter";
			model = sharedModel(env);
			credential = env.OPENROUTER_API_KEY ?? "";
		}
		const missing = evidence.length === 0 && !simulation;
		let text: string;
		let citedIds: string[];
		if (missing) {
			text = coverageResponse(input.content as string);
			citedIds = [];
		} else {
			if (shared && !simulation) {
				await reserveShared(db, input.userId, env);
			}
			const schema = simulation ? undefined : responseSchema(evidence.map((item) => item.source_id));
			if (!simulation && schema) {
				system += `\nRequired JSON response schema (format rules, not source evidence): ${JSON.stringify(schema)}`;
			}
			const raw = simulation
				? sandboxGenerate(history)
				: deps.generator
					? await deps.generator({ provider: providerId, credential, model, system, messages: history, responseSchema: schema })
					: await generateCompletion({ provider: providerId, credential, model, system, messages: history, responseSchema: schema });
			if (!raw || !raw.trim()) throw new DomainError("empty_provider_response", 503);
			if (simulation) {
				text = raw;
				citedIds = evidence.map((item) => item.source_id);
			} else {
				const parsed = parseGroundedAnswer(raw, evidence.map((item) => item.source_id));
				text = parsed.text;
				citedIds = parsed.ids;
			}
		}
		const updated = await db.transaction(async (tx) => {
			if (missing && sponsored) {
				await tx.execute(sql`SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE`);
			}
			const locked = await tx.execute(
				sql`SELECT state FROM messages WHERE id = ${answerId} FOR UPDATE`,
			);
			const current = locked[0] as { state: string } | undefined;
			if (!current || current.state !== "pending") {
				throw new DomainError("consultation_expired", 409);
			}
			await tx
				.update(messages)
				.set({
					content: await enc(text, input.primaryKey),
					state: "complete",
					citations: await encJson(
						evidence.filter((item) => citedIds.includes(item.source_id)).map((item) => item.citation),
						input.primaryKey,
					),
					generation: {
						provider: missing ? null : providerId,
						model: missing ? null : model,
						prompt_version: COMMENTARY_PROMPT_VERSION,
						input_hash: await answerInputHash(system, history),
						material_state: "generated",
						development_simulation: simulation,
						evidence_status: missing ? "missing" : "supplied",
						evidence: evidence.map((item) => ({
							source_id: item.source_id,
							revision: item.revision,
							sha256: item.sha256,
						})),
					},
					updatedAt: new Date(),
				})
				.where(eq(messages.id, answerId));
			const recent = await tx
				.select()
				.from(messages)
				.where(and(eq(messages.conversationId, input.conversationId), eq(messages.state, "complete")))
				.orderBy(desc(messages.createdAt), desc(messages.id))
				.limit(6);
			const summary = (
				await Promise.all(
					recent.reverse().map(async (message) => {
						const content = (await dec(message.content, keys)) ?? "";
						return `${message.role}: ${content.slice(0, 600)}`;
					}),
				)
			).join("\n");
			await tx
				.update(conversations)
				.set({ memory: await enc(summary, input.primaryKey), updatedAt: new Date() })
				.where(eq(conversations.id, input.conversationId));
			if (missing && sponsored) {
				await tx.execute(
					sql`UPDATE users SET free_consultations = free_consultations - 1, updated_at = now() WHERE id = ${input.userId}`,
				);
			}
			const rows = await tx.select().from(messages).where(eq(messages.id, answerId)).limit(1);
			return rows[0];
		});
		if (!updated) throw new Error("Answer update failed");
		return toAnswer(updated, keys);
	} catch (error) {
		await db.transaction(async (tx) => {
			await tx.execute(sql`SELECT id FROM users WHERE id = ${input.userId} FOR UPDATE`);
			const locked = await tx.execute(
				sql`SELECT state FROM messages WHERE id = ${answerId} FOR UPDATE`,
			);
			const current = locked[0] as { state: string } | undefined;
			if (current && current.state === "pending") {
				await tx
					.update(messages)
					.set({
						state: "failed",
						content: await enc("Response unavailable. Please try again.", input.primaryKey),
						updatedAt: new Date(),
					})
					.where(eq(messages.id, answerId));
				if (sponsored) {
					await tx.execute(
						sql`UPDATE users SET free_consultations = free_consultations - 1, updated_at = now() WHERE id = ${input.userId}`,
					);
				}
			}
		});
		if (error instanceof DomainError) throw error;
		console.error(`Commentary generation failed: ${(error as Error).constructor.name}`);
		throw new DomainError("provider_response_unavailable", 503);
	}
}
