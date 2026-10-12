import { beforeEach, describe, expect, test } from "bun:test";
import { articles } from "../src/db/schema.js";
import { CLOSED_FLAGS } from "../src/services/flags.js";
import { enc } from "../src/services/fields.js";
import { resolveAccount } from "../src/services/accounts.js";
import {
	authHeaders,
	createUser,
	makeTestContext,
	testConfig,
	testDb,
	truncateAll,
} from "./helper.js";

const ATTRIBUTION = "Public Shaul note";

beforeEach(truncateAll);

describe("assemblies feature flag", () => {
	test("a closed flag returns feature_unavailable on assembly, endorsement, and admission routes", async () => {
		const { app, deps } = makeTestContext({ flags: { ...CLOSED_FLAGS } });
		const config = testConfig();
		const id = await createUser();
		await resolveAccount(testDb().db, {
			provider: "email",
			subject: "flags@example.test",
			linkingUserId: id,
			primaryKey: config.encryptionPrimaryKey,
			deterministicKey: config.encryptionDeterministicKey,
		});
		const headers = await authHeaders(id);

		for (const path of ["/api/v1/assemblies", "/api/v1/assemblies/leaders", "/api/v1/endorsements"]) {
			const response = await app.request(path, { headers });
			expect(response.status).toBe(503);
			expect(await response.json()).toEqual({ error: { code: "feature_unavailable" } });
		}

		const admission = await app.request("/api/v1/account/admission", {
			method: "POST",
			headers,
			body: JSON.stringify({ code: "1234567" }),
		});
		expect(admission.status).toBe(503);
		expect(await admission.json()).toEqual({ error: { code: "feature_unavailable" } });

		const published = await testDb()
			.db.insert(articles)
			.values({
				sourceId: "shaul:note:public",
				title: "Public",
				locale: "en",
				body: await enc("Public body", deps.config.encryptionPrimaryKey),
				sourceUrl: "https://shaul.vercel.app/public",
				attribution: ATTRIBUTION,
				revision: "rev-1",
				inputHash: "hash",
				publicationState: "published",
				references: [],
				permissions: { public_display: true },
			})
			.returning({ id: articles.id });
		const articleId = published[0]?.id ?? "";
		const article = await app.request(`/api/v1/articles/${articleId}`);
		expect(article.status).toBe(200);
		expect((await article.json() as { attribution: string }).attribution).toBe(ATTRIBUTION);
	});
});
