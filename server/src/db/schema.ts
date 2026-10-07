import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	date,
	index,
	integer,
	jsonb,
	numeric,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	displayName: text("display_name"),
	profile: text("profile"),
	settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
	settingsVersion: integer("settings_version").notNull().default(0),
	discoverable: boolean("discoverable").notNull().default(false),
	contactVisible: boolean("contact_visible").notNull().default(false),
	leaderVerified: boolean("leader_verified").notNull().default(false),
	admittedAt: timestamp("admitted_at", { withTimezone: true }),
	freeConsultations: integer("free_consultations").notNull().default(0),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const identities = pgTable(
	"identities",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(),
		subject: text("subject").notNull(),
		subjectDigest: text("subject_digest").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [uniqueIndex("identities_provider_subject_idx").on(table.provider, table.subjectDigest)],
);

export const sessions = pgTable("sessions", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	tokenDigest: text("token_digest").notNull().unique(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authAttempts = pgTable("auth_attempts", {
	id: uuid("id").primaryKey().defaultRandom(),
	provider: text("provider").notNull(),
	stateDigest: text("state_digest").notNull().unique(),
	nonce: text("nonce"),
	verifier: text("verifier"),
	returnUri: text("return_uri").notNull(),
	userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	consumedAt: timestamp("consumed_at", { withTimezone: true }),
	email: text("email"),
	notificationConsentRequested: boolean("notification_consent_requested")
		.notNull()
		.default(false),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const handoffs = pgTable("handoffs", {
	id: uuid("id").primaryKey().defaultRandom(),
	sessionId: uuid("session_id")
		.notNull()
		.references(() => sessions.id, { onDelete: "cascade" }),
	codeDigest: text("code_digest").notNull().unique(),
	token: text("token").notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accessCodes = pgTable("access_codes", {
	id: uuid("id").primaryKey().defaultRandom(),
	codeDigest: text("code_digest").notNull().unique(),
	maxUses: integer("max_uses").notNull().default(100),
	uses: integer("uses").notNull().default(0),
	expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	revokedAt: timestamp("revoked_at", { withTimezone: true }),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assemblies = pgTable(
	"assemblies",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		leaderId: uuid("leader_id")
			.notNull()
			.unique()
			.references(() => users.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		kind: text("kind").notNull(),
		city: text("city"),
		latitude: numeric("latitude", { precision: 5, scale: 2 }),
		longitude: numeric("longitude", { precision: 6, scale: 2 }),
		meetingUrl: text("meeting_url"),
		sourceId: text("source_id").unique(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check("assembly_kind", sql`kind IN ('in_person', 'online')`),
		check("assembly_latitude", sql`latitude IS NULL OR (latitude >= -90 AND latitude <= 90)`),
		check(
			"assembly_longitude",
			sql`longitude IS NULL OR (longitude >= -180 AND longitude <= 180)`,
		),
	],
);

export const memberships = pgTable(
	"memberships",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		assemblyId: uuid("assembly_id")
			.notNull()
			.references(() => assemblies.id, { onDelete: "cascade" }),
		state: text("state").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		check("membership_state", sql`state IN ('requested', 'member', 'declined', 'left')`),
		uniqueIndex("memberships_user_assembly_idx").on(table.userId, table.assemblyId),
		uniqueIndex("one_active_membership").on(table.userId).where(sql`state = 'member'`),
	],
);

export const endorsements = pgTable(
	"endorsements",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		applicantId: uuid("applicant_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		leaderId: uuid("leader_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		state: text("state").notNull().default("requested"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("endorsements_applicant_leader_idx").on(table.applicantId, table.leaderId),
	],
);

export const notifications = pgTable(
	"notifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		kind: text("kind").notNull(),
		data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
		readAt: timestamp("read_at", { withTimezone: true }),
		deliveredAt: timestamp("delivered_at", { withTimezone: true }),
		deliveryAttempts: integer("delivery_attempts").notNull().default(0),
		deliveryError: text("delivery_error"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [index("notifications_delivered_at_idx").on(table.deliveredAt)],
);

export const articles = pgTable("articles", {
	id: uuid("id").primaryKey().defaultRandom(),
	sourceId: text("source_id").notNull().unique(),
	title: text("title").notNull(),
	locale: text("locale").notNull(),
	body: text("body"),
	sourceUrl: text("source_url").notNull(),
	attribution: text("attribution").notNull(),
	revision: text("revision").notNull(),
	inputHash: text("input_hash").notNull(),
	publicationState: text("publication_state").notNull().default("draft"),
	references: jsonb("references").$type<unknown[]>().notNull().default([]),
	permissions: jsonb("permissions").$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: uuid("user_id")
		.notNull()
		.references(() => users.id, { onDelete: "cascade" }),
	title: text("title"),
	memory: text("memory"),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable(
	"messages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		conversationId: uuid("conversation_id")
			.notNull()
			.references(() => conversations.id, { onDelete: "cascade" }),
		role: text("role").notNull(),
		content: text("content").notNull(),
		context: text("context"),
		citations: text("citations"),
		generation: jsonb("generation").$type<Record<string, unknown>>().notNull().default({}),
		requestId: text("request_id"),
		state: text("state").notNull().default("complete"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("messages_conversation_request_idx")
			.on(table.conversationId, table.requestId)
			.where(sql`request_id IS NOT NULL`),
	],
);

export const providerConnections = pgTable(
	"provider_connections",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		provider: text("provider").notNull(),
		credential: text("credential").notNull(),
		model: text("model").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	},
	(table) => [
		uniqueIndex("provider_connections_user_provider_idx").on(table.userId, table.provider),
	],
);

export const newMoonObservations = pgTable("new_moon_observations", {
	id: uuid("id").primaryKey().defaultRandom(),
	sourceId: text("source_id").notNull().unique(),
	source: text("source").notNull(),
	sourceUrl: text("source_url").notNull(),
	inputHash: text("input_hash").notNull(),
	observedOn: date("observed_on").notNull(),
	country: text("country").notNull(),
	visibilityMethod: text("visibility_method").notNull(),
	verified: boolean("verified").notNull().default(false),
	provenance: jsonb("provenance").$type<Record<string, unknown>>().notNull().default({}),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const monthConfirmations = pgTable("month_confirmations", {
	id: uuid("id").primaryKey().defaultRandom(),
	newMoonObservationId: uuid("new_moon_observation_id")
		.notNull()
		.references(() => newMoonObservations.id, { onDelete: "cascade" }),
	startsOnEvening: date("starts_on_evening").notNull().unique(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimits = pgTable(
	"rate_limits",
	{
		id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
		bucket: text("bucket").notNull().unique(),
		attempts: integer("attempts").notNull().default(0),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
	},
	(table) => [index("rate_limits_expires_at_idx").on(table.expiresAt)],
);
