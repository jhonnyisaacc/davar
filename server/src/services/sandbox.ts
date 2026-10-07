import { DomainError } from "../lib/errors.js";
import { signSelection } from "../lib/codec.js";

export function sandboxEnabled(
	env: NodeJS.ProcessEnv = process.env,
	nodeEnv: string = process.env.NODE_ENV ?? "development",
): boolean {
	return env.DAVAR_DEV_SANDBOX === "1" && nodeEnv === "development";
}

export function requireSandbox(
	env: NodeJS.ProcessEnv = process.env,
	nodeEnv?: string,
): void {
	if (!sandboxEnabled(env, nodeEnv)) {
		throw new Error("Development sandbox is disabled");
	}
}

export interface SandboxCity {
	city: string;
	country: string;
	latitude: number;
	longitude: number;
}

export const SANDBOX_CITIES: SandboxCity[] = [
	{ city: "Buenos Aires", country: "Argentina", latitude: -34.6, longitude: -58.4 },
	{ city: "Jerusalem", country: "Israel", latitude: 31.8, longitude: 35.25 },
	{ city: "Madrid", country: "Spain", latitude: 40.4, longitude: -3.7 },
	{ city: "São Paulo", country: "Brazil", latitude: -23.55, longitude: -46.65 },
];

function fold(text: string): string {
	return text
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase();
}

export async function sandboxCities(
	query: string,
	secret: string,
): Promise<Array<SandboxCity & { selection: string }>> {
	const matches = SANDBOX_CITIES.filter((city) =>
		fold(city.city).includes(fold(query)),
	);
	return Promise.all(
		matches.map(async (city) => ({
			...city,
			selection: await signSelection({ ...city }, secret),
		})),
	);
}

export function sandboxGenerate(messages: Array<{ content?: string }>): string {
	const prompt = messages[messages.length - 1]?.content?.toString() ?? "";
	if (prompt.includes("[sandbox:failure]")) {
		throw new DomainError("development_simulated_failure", 503);
	}
	return (
		"[Development simulation — no AI service called]\n" +
		"This synthetic response exercises conversation persistence and source handoff. " +
		`It is not Scripture interpretation or reviewed evidence. Your message: ${prompt.slice(0, 300)}`
	);
}
