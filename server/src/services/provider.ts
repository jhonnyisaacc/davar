import { DomainError } from "../lib/errors.js";
import type { ProviderHttp } from "./oauth.js";
import { fetchHttp } from "./oauth.js";

const SUPPORTED = new Set(["claude", "grok", "chatgpt", "gemini"]);

export function providerSupported(provider: string): boolean {
	return SUPPORTED.has(provider);
}

export function availableProviders(env: NodeJS.ProcessEnv = process.env): string[] {
	const raw = env.AI_CONNECTION_PROVIDERS ?? "";
	const seen = new Set<string>();
	for (const part of raw.split(",")) {
		const provider = part.trim();
		if (provider && providerSupported(provider) && !seen.has(provider)) {
			seen.add(provider);
		}
	}
	return [...seen];
}

export function sharedModel(env: NodeJS.ProcessEnv = process.env): string {
	return env.SHARED_OPENROUTER_MODEL ?? "openrouter/free";
}

export function freeModel(model: string): boolean {
	return model === "openrouter/free" || /^[A-Za-z0-9._/-]+:free$/.test(model);
}

export function sharedOpenrouter(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return Boolean(env.OPENROUTER_API_KEY) && freeModel(sharedModel(env));
}

export function developmentOpenrouter(
	env: NodeJS.ProcessEnv = process.env,
	nodeEnv: string = env.NODE_ENV ?? "development",
): boolean {
	return (
		nodeEnv === "development" &&
		Boolean(env.OPENROUTER_API_KEY) &&
		freeModel(env.OPENROUTER_MODEL ?? "")
	);
}

export interface GenerateInput {
	provider: string;
	credential: string;
	model: string;
	system: string;
	messages: Array<{ role: string; content: string }>;
	responseSchema?: Record<string, unknown>;
	http?: ProviderHttp;
}

export async function generateCompletion(input: GenerateInput): Promise<string> {
	const openrouterFree =
		input.provider === "openrouter" && freeModel(input.model);
	if (!providerSupported(input.provider) && !openrouterFree) {
		throw new DomainError("provider_not_supported", 503);
	}
	const http = input.http ?? fetchHttp;
	try {
		if (input.provider === "claude") {
			const result = (await http.json("https://api.anthropic.com/v1/messages", {
				method: "post",
				headers: {
					"x-api-key": input.credential,
					"anthropic-version": "2023-06-01",
				},
				body: {
					model: input.model,
					max_tokens: 2000,
					system: input.system,
					messages: input.messages,
				},
			})) as { content: Array<{ type: string; text: string }> };
			return result.content
				.filter((item) => item.type === "text")
				.map((item) => item.text)
				.join("\n");
		}
		if (input.provider === "gemini") {
			const result = (await http.json(
				`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`,
				{
					method: "post",
					headers: { "x-goog-api-key": input.credential },
					body: {
						systemInstruction: { parts: [{ text: input.system }] },
						contents: input.messages.map((message) => ({
							role: message.role === "assistant" ? "model" : "user",
							parts: [{ text: message.content }],
						})),
					},
				},
			)) as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
			const candidate = result.candidates[0];
			if (!candidate) throw new DomainError("invalid_provider_response", 503);
			return candidate.content.parts.map((part) => part.text).join("\n");
		}
		const base =
			input.provider === "grok"
				? "https://api.x.ai/v1"
				: input.provider === "openrouter"
					? "https://openrouter.ai/api/v1"
					: "https://api.openai.com/v1";
		const body: Record<string, unknown> = {
			model: input.model,
			messages: [{ role: "system", content: input.system }, ...input.messages],
		};
		if (input.provider === "openrouter" && freeModel(input.model)) {
			body.max_tokens = 2000;
			body.provider = { max_price: { prompt: 0, completion: 0 } };
		}
		if (input.provider === "openrouter" && input.responseSchema) {
			body.response_format = { type: "json_object" };
		}
		const result = (await http.json(`${base}/chat/completions`, {
			method: "post",
			headers: { Authorization: `Bearer ${input.credential}` },
			body,
		})) as { choices: Array<{ message: { content: string } }> };
		const choice = result.choices[0];
		if (!choice) throw new DomainError("invalid_provider_response", 503);
		return choice.message.content;
	} catch (error) {
		if (error instanceof DomainError) throw error;
		throw new DomainError("invalid_provider_response", 503);
	}
}
