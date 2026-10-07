import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { conversations, messages } from "../../db/schema.js";
import { DomainError } from "../../lib/errors.js";
import { dec, decJson, enc } from "../../services/fields.js";
import { askCommentary, type AnswerShape } from "../../services/commentary.js";
import { checkRateLimit } from "../../services/rateLimit.js";
import { productCapabilities } from "../../services/capabilities.js";
import { requireUser } from "../auth.js";
import { parseBody, uuidParam } from "../validation.js";
import type { AppVariables } from "../deps.js";
import type { DatabaseOrTx } from "../../db/client.js";

const createSchema = z.object({
	title: z.string().optional().nullable(),
});

const messageSchema = z.object({
	content: z.unknown(),
	context: z.unknown().optional().nullable(),
	request_id: z.unknown(),
	provider: z.string().optional().nullable(),
});

function messageShape(answer: AnswerShape) {
	return {
		id: answer.id,
		role: answer.role,
		content: answer.content,
		citations: answer.citations,
		state: answer.state,
		generation: answer.generation,
	};
}

export const conversationRoutes = new Hono<{ Variables: AppVariables }>();

conversationRoutes.get("/conversations", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireUser(db, config, c);
	const rows = await db
		.select({ id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt })
		.from(conversations)
		.where(eq(conversations.userId, user.id))
		.orderBy(desc(conversations.updatedAt))
		.limit(100);
	const result = [];
	for (const row of rows) {
		result.push({
			id: row.id,
			title: await dec(row.title, config.encryptionPrimaryKey),
			updated_at: row.updatedAt.toISOString(),
		});
	}
	return c.json({ conversations: result });
});

conversationRoutes.post("/conversations", async (c) => {
	const { db, config, env, flags, http } = c.get("deps");
	const user = await requireUser(db, config, c);
	const capabilities = await productCapabilities(db, {
		userId: user.id,
		env,
		nodeEnv: env.NODE_ENV ?? "development",
		flags,
		http,
	});
	if (!capabilities.ai.available) throw new DomainError("ai_unavailable", 503);
	const body = parseBody(createSchema, await c.req.json().catch(() => ({})));
	const title = (body.title ?? "").toString().slice(0, 120);
	const created = await db
		.insert(conversations)
		.values({
			userId: user.id,
			title: await enc(title, config.encryptionPrimaryKey),
		})
		.returning({ id: conversations.id });
	const row = created[0];
	if (!row) throw new Error("Conversation insert failed");
	return c.json({ id: row.id }, 201);
});

async function ownedConversation(
	db: DatabaseOrTx,
	conversationId: string,
	userId: string,
) {
	const rows = await db
		.select()
		.from(conversations)
		.where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
		.limit(1);
	const conversation = rows[0];
	if (!conversation) throw new DomainError("not_found", 404);
	return conversation;
}

conversationRoutes.get("/conversations/:id", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireUser(db, config, c);
	const conversation = await ownedConversation(db, uuidParam(c, "id"), user.id);
	const rows = await db
		.select()
		.from(messages)
		.where(eq(messages.conversationId, conversation.id))
		.orderBy(messages.createdAt, messages.id)
		.limit(200);
	const result = [];
	for (const message of rows) {
		result.push({
			id: message.id,
			role: message.role,
			content: await dec(message.content, config.encryptionPrimaryKey),
			context: await decJson(message.context, config.encryptionPrimaryKey, null),
			citations: await decJson(message.citations, config.encryptionPrimaryKey, null),
			generation: message.generation ?? {},
			state: message.state,
			created_at: message.createdAt.toISOString(),
		});
	}
	return c.json({
		id: conversation.id,
		title: await dec(conversation.title, config.encryptionPrimaryKey),
		messages: result,
	});
});

conversationRoutes.post("/conversations/:id/messages", async (c) => {
	const { db, config, env, generator } = c.get("deps");
	const user = await requireUser(db, config, c);
	await checkRateLimit(db, `chat/${user.id}`, 10);
	const conversation = await ownedConversation(db, uuidParam(c, "id"), user.id);
	const body = parseBody(messageSchema, await c.req.json().catch(() => ({})));
	const answer = await askCommentary(
		db,
		{
			conversationId: conversation.id,
			userId: user.id,
			content: body.content,
			context: body.context ?? null,
			requestId: body.request_id,
			provider: body.provider,
			primaryKey: config.encryptionPrimaryKey,
		},
		{ env, generator, flags: c.get("deps").flags, http: c.get("deps").http },
	);
	return c.json(messageShape(answer));
});

conversationRoutes.delete("/conversations/:id/memory", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireUser(db, config, c);
	const conversation = await ownedConversation(db, uuidParam(c, "id"), user.id);
	await db
		.update(conversations)
		.set({ memory: null, updatedAt: new Date() })
		.where(eq(conversations.id, conversation.id));
	return c.body(null, 204);
});

conversationRoutes.delete("/conversations/:id", async (c) => {
	const { db, config } = c.get("deps");
	const user = await requireUser(db, config, c);
	const conversation = await ownedConversation(db, uuidParam(c, "id"), user.id);
	await db.transaction(async (tx) => {
		await tx.execute(sql`SELECT id FROM conversations WHERE id = ${conversation.id} FOR UPDATE`);
		const busy = await tx
			.select({ id: messages.id })
			.from(messages)
			.where(and(eq(messages.conversationId, conversation.id), eq(messages.state, "pending")))
			.limit(1);
		if (busy[0]) throw new DomainError("conversation_busy", 409);
		await tx.delete(conversations).where(eq(conversations.id, conversation.id));
	});
	return c.body(null, 204);
});
