import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";

export interface SentMail {
	to: string[];
	subject: string;
	body: string;
	createdAt: string;
}

export function magicLink(state: string, apiPublicUrl: string): string {
	const base = apiPublicUrl.replace(/\/$/, "");
	return `${base}/api/v1/auth/email/callback?state=${encodeURIComponent(state)}`;
}

export function magicLinkBody(url: string): string {
	return `Open this link to sign in to Davar. It expires in 10 minutes and can be used once.\n\n${url}`;
}

export function mailboxDir(rootDir?: string): string {
	return join(rootDir ?? process.cwd(), "tmp", "sandbox-mail");
}

export async function deliverSandboxMail(
	mail: { to: string[]; subject: string; body: string },
	rootDir?: string,
): Promise<void> {
	for (const address of mail.to) {
		if (!address.endsWith("@example.test")) {
			throw new Error("Sandbox email recipients must use example.test");
		}
	}
	const directory = mailboxDir(rootDir);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	const id = randomUUID();
	await writeFile(
		join(directory, `${id}.json`),
		JSON.stringify({
			id,
			to: mail.to,
			subject: mail.subject,
			body: mail.body,
			created_at: new Date().toISOString(),
		}),
		{ mode: 0o600 },
	);
}

export async function sendSignInMail(input: {
	to: string;
	state: string;
	apiPublicUrl: string;
	mailFrom: string;
	sandbox: boolean;
	rootDir?: string;
	outbox?: SentMail[];
	env?: NodeJS.ProcessEnv;
}): Promise<void> {
	const url = magicLink(input.state, input.apiPublicUrl);
	const subject = "Sign in to Davar";
	const body = magicLinkBody(url);
	if (input.outbox) {
		input.outbox.push({ to: [input.to], subject, body, createdAt: new Date().toISOString() });
		return;
	}
	if (input.sandbox) {
		await deliverSandboxMail({ to: [input.to], subject, body }, input.rootDir);
		return;
	}
	const env = input.env ?? process.env;
	const password = env.SMTP_PASSWORD || env.SMTP_PASS;
	const transport = nodemailer.createTransport({
		host: env.SMTP_HOST ?? "localhost",
		port: Number(env.SMTP_PORT ?? 25),
		secure: env.SMTP_SECURE === "1",
		auth:
			env.SMTP_USER && password ? { user: env.SMTP_USER, pass: password } : undefined,
	});
	await transport.sendMail({ from: input.mailFrom, to: input.to, subject, text: body });
}
