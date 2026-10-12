import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { articles } from "../../db/schema.js";
import { DomainError } from "../../lib/errors.js";
import { decryptionKeys } from "../../lib/config.js";
import { dec } from "../../services/fields.js";
import { uuidParam } from "../validation.js";
import type { DatabaseOrTx } from "../../db/client.js";
import type { AppVariables } from "../deps.js";

const PAGE_SIZE = 100;

interface ArticleRecord {
	id: string;
	source_id: string;
	title: string;
	locale: string;
	body: string | null;
	source_url: string;
	attribution: string;
	references: unknown;
	revision: string;
	permissions: unknown;
}

function articleShape(record: ArticleRecord, body: string | null) {
	return {
		id: record.id,
		source_id: record.source_id,
		title: record.title,
		locale: record.locale,
		body,
		source_url: record.source_url,
		attribution: record.attribution,
		references: record.references,
		revision: record.revision,
		permissions: record.permissions,
	};
}

async function corpusRecords(): Promise<ArticleRecord[]> {
	// data/commentary (private Shaul content) is not part of this repository,
	// so the corpus fallback is empty and imported articles carry the index.
	return [];
}

export interface ArticleIndexItem {
	id: string;
	source_id: string;
	title: string;
	locale: string;
	source_url: string;
	attribution: string;
	references: unknown;
	revision: string;
}

export async function articlePage(
	db: DatabaseOrTx,
	locale: string | undefined,
	offset: number,
): Promise<{ articles: ArticleIndexItem[]; next_offset: number | null }> {
	const corpus = await corpusRecords();
	const conditions =
		locale && locale.length > 0
			? sql`publication_state = 'published' AND locale = ${locale}`
			: sql`publication_state = 'published'`;
	const rows = (await db.execute(sql`
		SELECT id, source_id AS "sourceId", title, locale, body, source_url AS "sourceUrl",
			attribution, "references", revision, permissions
		FROM articles WHERE ${conditions}
		ORDER BY source_id LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}
	`)) as unknown as Array<{
		id: string;
		sourceId: string;
		title: string;
		locale: string;
		body: string | null;
		sourceUrl: string;
		attribution: string;
		references: unknown;
		revision: string;
		permissions: unknown;
	}>;
	void corpus;
	const slice = rows.slice(0, PAGE_SIZE).map((row) => ({
		id: row.id,
		source_id: row.sourceId,
		title: row.title,
		locale: row.locale,
		source_url: row.sourceUrl,
		attribution: row.attribution,
		references: row.references,
		revision: row.revision,
	}));
	return {
		articles: slice,
		next_offset: rows.length > PAGE_SIZE ? offset + PAGE_SIZE : null,
	};
}

export const articleRoutes = new Hono<{ Variables: AppVariables }>();

articleRoutes.get("/articles", async (c) => {
	const { db } = c.get("deps");
	const params = c.req.query();
	const page = params.page === undefined ? 1 : Number(params.page);
	if (!Number.isInteger(page) || page < 1) throw new DomainError("invalid_page");
	return c.json(await articlePage(db, params.locale, (page - 1) * PAGE_SIZE));
});

articleRoutes.get("/articles/:id", async (c) => {
	const { db, config } = c.get("deps");
	const raw = c.req.param("id");
	if (raw.startsWith("source_")) {
		// Corpus-backed synthetic records are unavailable without the
		// private commentary data; unknown corpus ids are not found.
		throw new DomainError("not_found", 404);
	}
	const id = uuidParam(c, "id");
	const rows = await db
		.select()
		.from(articles)
		.where(and(eq(articles.id, id), eq(articles.publicationState, "published")))
		.limit(1);
	const article = rows[0];
	if (!article) throw new DomainError("not_found", 404);
	return c.json(
		articleShape(
			{
				id: article.id,
				source_id: article.sourceId,
				title: article.title,
				locale: article.locale,
				body: null,
				source_url: article.sourceUrl,
				attribution: article.attribution,
				references: article.references,
				revision: article.revision,
				permissions: article.permissions,
			},
			await dec(article.body, decryptionKeys(config)),
		),
	);
});
