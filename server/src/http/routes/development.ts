import { Hono, type Context, type Next } from "hono";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { DomainError } from "../../lib/errors.js";
import { mailboxDir } from "../../services/mailer.js";
import { developmentOpenrouter } from "../../services/provider.js";
import { sandboxEnabled } from "../../services/sandbox.js";
import type { AppVariables } from "../deps.js";

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function localRequest(host: string | undefined): boolean {
	const name = (host ?? "").split(":")[0]?.toLowerCase();
	return name === "localhost" || name === "127.0.0.1" || name === "::1";
}

export const developmentRoutes = new Hono<{ Variables: AppVariables }>();

async function gateDevelopment(c: Context<{ Variables: AppVariables }>, next: Next) {
	const { env } = c.get("deps");
	const host = c.req.header("host") ?? new URL(c.req.url).host;
	if (!sandboxEnabled(env, env.NODE_ENV ?? "development") || !localRequest(host)) {
		throw new DomainError("not_found", 404);
	}
	c.header("Cache-Control", "no-store");
	await next();
}

developmentRoutes.use("/api/v1/development/*", gateDevelopment);
developmentRoutes.use("/development/*", gateDevelopment);

developmentRoutes.get("/api/v1/development/status", async (c) => {
	const base = new URL(c.req.url);
	const { env } = c.get("deps");
	const openrouter = developmentOpenrouter(env, env.NODE_ENV ?? "development");
	const simulations = ["cities", "articles", "calendar-fixtures"];
	if (!openrouter) simulations.unshift("ai");
	return c.json({
		sandbox: true,
		simulations,
		commentary_provider: openrouter ? "openrouter" : "simulation",
		mailbox_url: `${base.origin}/development/mailbox`,
	});
});

developmentRoutes.get("/development/mailbox", async (c) => {
	const { rootDir } = c.get("deps");
	const directory = mailboxDir(rootDir);
	let messages: Array<{ to: string[]; subject: string; body: string; created_at: string }> = [];
	try {
		const files = await readdir(directory);
		const loaded = await Promise.all(
			files
				.filter((file) => file.endsWith(".json"))
				.map((file) =>
					readFile(join(directory, file), "utf8").then((text) => JSON.parse(text)),
				),
		);
		messages = (
			loaded as Array<{ to: string[]; subject: string; body: string; created_at: string }>
		)
			.sort((a, b) => a.created_at.localeCompare(b.created_at))
			.reverse()
			.slice(0, 50);
	} catch {
		messages = [];
	}
	const cards = messages
		.map((message) => {
			const url = message.body
				.split(/\s/)
				.find((word) => word.startsWith("http://") || word.startsWith("https://"));
			return `<article><h2>${escapeHtml(message.to.join(", "))}</h2><p>${escapeHtml(message.subject)}</p><p>${escapeHtml(message.created_at)}</p><a href="${escapeHtml(url ?? "")}">Open magic link</a><details><summary>Email body</summary><pre>${escapeHtml(message.body)}</pre></details></article>`;
		})
		.join("");
	const html =
		`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">` +
		`<title>Davar development inbox</title><style>body{font:16px system-ui;background:#FAF6F0;max-width:800px;margin:auto;padding:24px}article{padding:20px;margin:16px 0;border:1px solid #ddd;border-radius:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#4C72A8}</style>` +
		`<h1>Development inbox</h1><p>Synthetic accounts only. Links expire after ten minutes and can be used once.</p>` +
		`<p><a href="/development/mailbox">Refresh inbox</a></p>` +
		`${cards || "<p>No messages yet. Request an email sign-in using fresh@example.test.</p>"}</html>`;
	return c.html(html);
});
