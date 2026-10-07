import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, spyOn, test } from "bun:test";
import nodemailer from "nodemailer";

import { sendSignInMail } from "../src/services/mailer.js";

type SmtpOptions = {
	host?: string;
	port?: number;
	secure?: boolean;
	auth?: { user?: string; pass?: string };
};

const transports: SmtpOptions[] = [];
let deliveryError: Error | undefined;

const createTransport = spyOn(nodemailer, "createTransport").mockImplementation(((
	options: SmtpOptions,
) => {
	transports.push(options);
	return {
		sendMail: async () => {
			if (deliveryError) throw deliveryError;
			return { messageId: "test" };
		},
	};
}) as unknown as typeof nodemailer.createTransport);

afterAll(() => {
	createTransport.mockRestore();
});

const message = {
	to: "reader@example.com",
	state: "state-token",
	apiPublicUrl: "https://api.example.test",
	mailFrom: "Davar <sign-in@example.test>",
	sandbox: false,
};

function resetTransport(): void {
	transports.length = 0;
	deliveryError = undefined;
}

async function withSilentConsole(run: () => Promise<void>): Promise<string> {
	const names = ["log", "info", "warn", "error", "debug"] as const;
	const printed: string[] = [];
	const saved = names.map((name) => console[name].bind(console));
	for (const name of names) {
		console[name] = (...args: unknown[]) => {
			printed.push(args.map((arg) => String(arg)).join(" "));
		};
	}
	try {
		await run();
	} finally {
		for (const [index, name] of names.entries()) {
			console[name] = saved[index] as (typeof console)[typeof name];
		}
	}
	return printed.join("\n");
}

describe("hosted SMTP password", () => {
	test("SMTP_PASSWORD authenticates hosted mail", async () => {
		resetTransport();
		await sendSignInMail({
			...message,
			env: {
				SMTP_HOST: "smtp.example.test",
				SMTP_PORT: "587",
				SMTP_USER: "mailer",
				SMTP_PASSWORD: "password-from-rails",
			},
		});
		expect(transports).toHaveLength(1);
		expect(transports[0]?.host).toBe("smtp.example.test");
		expect(transports[0]?.port).toBe(587);
		expect(transports[0]?.auth).toEqual({ user: "mailer", pass: "password-from-rails" });
	});

	test("SMTP_PASS still authenticates when SMTP_PASSWORD is unset", async () => {
		resetTransport();
		await sendSignInMail({
			...message,
			env: {
				SMTP_USER: "mailer",
				SMTP_PASS: "password-from-hono",
			},
		});
		expect(transports[0]?.auth).toEqual({ user: "mailer", pass: "password-from-hono" });
	});

	test("SMTP_PASSWORD wins when both passwords are set", async () => {
		resetTransport();
		await sendSignInMail({
			...message,
			env: {
				SMTP_USER: "mailer",
				SMTP_PASSWORD: "password-from-rails",
				SMTP_PASS: "password-from-hono",
			},
		});
		expect(transports[0]?.auth?.pass).toBe("password-from-rails");
	});

	test("an empty SMTP_PASSWORD falls back to SMTP_PASS", async () => {
		resetTransport();
		await sendSignInMail({
			...message,
			env: {
				SMTP_USER: "mailer",
				SMTP_PASSWORD: "",
				SMTP_PASS: "password-from-hono",
			},
		});
		expect(transports[0]?.auth?.pass).toBe("password-from-hono");
	});

	test("a delivery failure raises and the password is not printed", async () => {
		resetTransport();
		deliveryError = new Error("smtp delivery failed");
		const secret = "password-from-rails";
		let thrown: unknown;
		const printed = await withSilentConsole(async () => {
			try {
				await sendSignInMail({
					...message,
					env: {
						SMTP_USER: "mailer",
						SMTP_PASSWORD: secret,
					},
				});
			} catch (error) {
				thrown = error;
			}
		});
		expect(thrown).toBeInstanceOf(Error);
		expect((thrown as Error).message).toBe("smtp delivery failed");
		expect((thrown as Error).message.includes(secret)).toBe(false);
		expect(printed.includes(secret)).toBe(false);
		expect(transports[0]?.auth?.pass).toBe(secret);
	});

	test("sandbox delivery does not open an SMTP transport", async () => {
		resetTransport();
		const root = await mkdtemp(join(tmpdir(), "davar-mail-"));
		try {
			await sendSignInMail({
				...message,
				to: "reader@example.test",
				sandbox: true,
				rootDir: root,
				env: {
					SMTP_USER: "mailer",
					SMTP_PASSWORD: "password-from-rails",
					SMTP_PASS: "password-from-hono",
				},
			});
		} finally {
			await rm(root, { recursive: true, force: true });
		}
		expect(transports).toHaveLength(0);
	});
});
