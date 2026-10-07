import { eq, sql } from "drizzle-orm";
import type { DatabaseOrTx } from "../db/client.js";
import {
	articles,
	assemblies,
	identities,
	memberships,
	monthConfirmations,
	newMoonObservations,
	users,
} from "../db/schema.js";
import { sha256Hex } from "../lib/crypto.js";
import { DomainError } from "../lib/errors.js";
import { resolveAccount } from "./accounts.js";
import { enc, encJson } from "./fields.js";
import { validateCommentaryContext } from "./context.js";

class Rollback extends Error {}

export interface ImportKeys {
	primaryKey: string;
	deterministicKey: string;
}

interface QahalUser {
	telegram_id: number;
	display_name: string;
	profile?: Record<string, unknown>;
	discoverable?: boolean;
	contact_visible?: boolean;
}

interface QahalAssembly {
	id: string;
	leader_telegram_id: number;
	name: string;
	kind: string;
	city?: string;
	latitude?: number;
	longitude?: number;
	meeting_url?: string;
}

interface QahalMembership {
	telegram_id: number;
	assembly_id: string;
	state: string;
}

export async function qahalImport(
	db: DatabaseOrTx,
	payload: {
		schema_version: number;
		source_revision: string;
		decrypted: boolean;
		users: QahalUser[];
		assemblies: QahalAssembly[];
		memberships: QahalMembership[];
	},
	keys: ImportKeys,
	dryRun = true,
): Promise<{ source_revision: string; dry_run: boolean; users: number; assemblies: number; memberships: number; mappings: Record<string, string> }> {
	if (payload.schema_version !== 1 || !payload.source_revision) {
		throw new DomainError("unsupported_import");
	}
	if (payload.decrypted !== true) throw new DomainError("decrypted_export_required");
	const report = {
		source_revision: payload.source_revision,
		dry_run: dryRun,
		users: 0,
		assemblies: 0,
		memberships: 0,
		mappings: {} as Record<string, string>,
	};
	try {
		await db.transaction(async (tx) => {
			for (const row of payload.users) {
				if (!Number.isInteger(row.telegram_id) || row.telegram_id <= 0) {
					throw new DomainError("invalid_telegram_identity");
				}
				const user = await resolveAccount(tx, {
					provider: "telegram",
					subject: String(row.telegram_id),
					primaryKey: keys.primaryKey,
					deterministicKey: keys.deterministicKey,
				});
				await tx
					.update(users)
					.set({
						displayName: await enc(row.display_name, keys.primaryKey),
						profile: await encJson(row.profile ?? {}, keys.primaryKey),
						discoverable: row.discoverable === true,
						contactVisible: row.contact_visible === true,
						updatedAt: new Date(),
					})
					.where(eq(users.id, user.id));
				report.mappings[String(row.telegram_id)] = user.id;
				report.users += 1;
			}
			for (const row of payload.assemblies) {
				const leaderId = await telegramUserId(tx, String(row.leader_telegram_id), keys.deterministicKey);
				const sourceId = `qahal:${row.id}`;
				const found = await tx
					.select()
					.from(assemblies)
					.where(eq(assemblies.sourceId, sourceId))
					.limit(1);
				const values = {
					leaderId,
					name: row.name,
					kind: row.kind,
					city: row.city ?? null,
					latitude: row.latitude !== undefined ? String(row.latitude) : null,
					longitude: row.longitude !== undefined ? String(row.longitude) : null,
					meetingUrl: row.meeting_url ? await enc(row.meeting_url, keys.primaryKey) : null,
					updatedAt: new Date(),
				};
				if (found[0]) {
					await tx.update(assemblies).set(values).where(eq(assemblies.id, found[0].id));
				} else {
					await tx.insert(assemblies).values({ sourceId, ...values });
				}
				report.assemblies += 1;
			}
			for (const row of payload.memberships) {
				const userId = await telegramUserId(tx, String(row.telegram_id), keys.deterministicKey);
				const assembly = await tx
					.select({ id: assemblies.id })
					.from(assemblies)
					.where(eq(assemblies.sourceId, `qahal:${row.assembly_id}`))
					.limit(1);
				if (!assembly[0]) throw new DomainError("not_found", 404);
				const found = await tx.execute(sql`
					SELECT id FROM memberships WHERE user_id = ${userId} AND assembly_id = ${assembly[0].id} LIMIT 1
				`);
				const existing = found[0] as { id: string } | undefined;
				if (existing) {
					await tx.execute(sql`
						UPDATE memberships SET state = ${row.state}, updated_at = now() WHERE id = ${existing.id}
					`);
				} else {
					await tx.insert(memberships).values({
						userId,
						assemblyId: assembly[0].id,
						state: row.state,
					});
				}
				report.memberships += 1;
			}
			if (dryRun) throw new Rollback();
		});
	} catch (error) {
		if (!(error instanceof Rollback)) throw error;
	}
	return report;
}

async function telegramUserId(
	db: DatabaseOrTx,
	subject: string,
	deterministicKey: string,
): Promise<string> {
	const { hmacHex } = await import("../lib/codec.js");
	const digest = await hmacHex(`identity-subject:${subject}`, deterministicKey);
	const rows = await db
		.select({ userId: identities.userId })
		.from(identities)
		.where(eq(identities.subjectDigest, digest))
		.limit(1);
	const row = rows[0];
	if (!row) throw new DomainError("not_found", 404);
	return row.userId;
}

interface ArticleRow {
	source_id: string;
	title: string;
	locale: string;
	body?: string;
	source_url: string;
	attribution: string;
	publication_state?: string;
	references: unknown[];
	permissions?: Record<string, unknown>;
}

export async function articleImport(
	db: DatabaseOrTx,
	payload: { schema_version: number; source_revision: string; articles: ArticleRow[] },
	keys: ImportKeys,
	dryRun = true,
): Promise<{ dry_run: boolean; revision: string; articles: number }> {
	if (payload.schema_version !== 1 || !payload.source_revision) {
		throw new DomainError("unsupported_import");
	}
	const report = { dry_run: dryRun, revision: payload.source_revision, articles: 0 };
	try {
		await db.transaction(async (tx) => {
			for (const row of payload.articles) {
				if (
					!row.source_url?.startsWith("https://shaul.vercel.app/") ||
					row.source_id?.includes("private")
				) {
					throw new DomainError("private_source_forbidden");
				}
				for (const ref of row.references ?? []) {
					validateCommentaryContext({
						schema_version: 1,
						kind: "verse",
						edition_id: "reference-only",
						reference: ref,
					});
				}
				const found = await tx
					.select({ id: articles.id })
					.from(articles)
					.where(eq(articles.sourceId, row.source_id))
					.limit(1);
				const values = {
					title: row.title,
					locale: row.locale,
					body: row.body ? await enc(row.body, keys.primaryKey) : null,
					sourceUrl: row.source_url,
					attribution: row.attribution,
					publicationState: row.publication_state ?? "draft",
					references: row.references ?? [],
					permissions: row.permissions ?? {},
					revision: payload.source_revision,
					inputHash: await sha256Hex(JSON.stringify(row)),
					updatedAt: new Date(),
				};
				if (found[0]) {
					await tx.update(articles).set(values).where(eq(articles.id, found[0].id));
				} else {
					await tx.insert(articles).values({ sourceId: row.source_id, ...values });
				}
				report.articles += 1;
			}
			if (dryRun) throw new Rollback();
		});
	} catch (error) {
		if (!(error instanceof Rollback)) throw error;
	}
	return report;
}

interface ObservationRow {
	id: string;
	source: string;
	source_url: string;
	observed_on: string;
	country: string;
	visibility_method: string;
	verified: boolean;
	raw_source_hash: string;
	source_entry_id?: string;
	observer?: string;
	location?: string;
	observed_at?: string;
	fetched_at?: string;
	source_revision?: string;
}

function automaticallyConfirmable(row: {
	source: string;
	country: string;
	visibilityMethod: string;
	verified: boolean;
}): boolean {
	return (
		row.source === "israeli_new_moon_society" &&
		row.country === "IL" &&
		row.visibilityMethod === "unaided" &&
		row.verified
	);
}

export async function observationImport(
	db: DatabaseOrTx,
	payload: { schema_version: number; observations: ObservationRow[] },
	dryRun = true,
): Promise<{ observations: number; confirmations: number; dry_run: boolean }> {
	if (payload.schema_version !== 1) throw new DomainError("unsupported_import");
	const report = { observations: 0, confirmations: 0, dry_run: dryRun };
	try {
		await db.transaction(async (tx) => {
			for (const row of payload.observations) {
				const found = await tx
					.select()
					.from(newMoonObservations)
					.where(eq(newMoonObservations.sourceId, row.id))
					.limit(1);
				const values = {
					source: row.source,
					sourceUrl: row.source_url,
					observedOn: row.observed_on,
					country: row.country,
					visibilityMethod: row.visibility_method,
					verified: row.verified,
					inputHash: row.raw_source_hash,
					provenance: {
						source_entry_id: row.source_entry_id,
						observer: row.observer,
						location: row.location,
						observed_at: row.observed_at,
						fetched_at: row.fetched_at,
						source_revision: row.source_revision,
					},
					updatedAt: new Date(),
				};
				let observationId: string;
				if (found[0]) {
					await tx
						.update(newMoonObservations)
						.set(values)
						.where(eq(newMoonObservations.id, found[0].id));
					observationId = found[0].id;
				} else {
					const created = await tx
						.insert(newMoonObservations)
						.values({ sourceId: row.id, ...values })
						.returning({ id: newMoonObservations.id });
					const createdRow = created[0];
					if (!createdRow) throw new Error("Observation insert failed");
					observationId = createdRow.id;
				}
				const confirmable = automaticallyConfirmable({
					source: values.source,
					country: values.country,
					visibilityMethod: values.visibilityMethod,
					verified: values.verified,
				});
				const existingConfirmation = await tx
					.select({ id: monthConfirmations.id })
					.from(monthConfirmations)
					.where(eq(monthConfirmations.newMoonObservationId, observationId))
					.limit(1);
				if (confirmable) {
					if (existingConfirmation[0]) {
						await tx
							.update(monthConfirmations)
							.set({ startsOnEvening: values.observedOn })
							.where(eq(monthConfirmations.id, existingConfirmation[0].id));
					} else {
						await tx.insert(monthConfirmations).values({
							newMoonObservationId: observationId,
							startsOnEvening: values.observedOn,
						});
					}
					report.confirmations += 1;
				} else if (existingConfirmation[0]) {
					await tx
						.delete(monthConfirmations)
						.where(eq(monthConfirmations.id, existingConfirmation[0].id));
				}
				report.observations += 1;
			}
			if (dryRun) throw new Rollback();
		});
	} catch (error) {
		if (!(error instanceof Rollback)) throw error;
	}
	return report;
}
