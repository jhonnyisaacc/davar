import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { articles } from "../../db/schema.js";
import { DomainError } from "../../lib/errors.js";
import { dec } from "../../services/fields.js";
import type { AppVariables } from "../deps.js";

export const articleRoutes = new Hono<{ Variables: AppVariables }>();

articleRoutes.get("/articles", async (c) => {
	const { db } = c.get("deps");
	const locale = c.req.query().locale;
	const base = sql`publication_state = 'published'`;
	const rows = await db.execute(sql`
		SELECT id, source_id AS "sourceId", title, locale, source_url AS "sourceUrl",
			attribution, "references", revision
		FROM articles WHERE ${locale ? sql`publication_state = 'published' AND locale = ${locale}` : base}
		ORDER BY source_id LIMIT 100
	`);
	return c.json({
		articles: (rows as unknown as Array<Record<string, unknown>>).map((row) => ({
			id: row.id,
			source_id: row.sourceId,
			title: row.title,
			locale: row.locale,
			source_url: row.sourceUrl,
			attribution: row.attribution,
			references: row.references,
			revision: row.revision,
		})),
	});
});

articleRoutes.get("/articles/:id", async (c) => {
	const { db, config } = c.get("deps");
	const rows = await db
		.select()
		.from(articles)
		.where(and(eq(articles.id, c.req.param("id")), eq(articles.publicationState, "published")))
		.limit(1);
	const article = rows[0];
	if (!article) throw new DomainError("not_found", 404);
	return c.json({
		id: article.id,
		source_id: article.sourceId,
		title: article.title,
		locale: article.locale,
		body: await dec(article.body, config.encryptionPrimaryKey),
		source_url: article.sourceUrl,
		attribution: article.attribution,
		references: article.references,
		revision: article.revision,
		permissions: article.permissions,
	});
});
