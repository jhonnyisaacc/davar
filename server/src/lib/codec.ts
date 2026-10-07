import { base64UrlDecode, base64UrlEncode } from "./crypto.js";

async function importKey(
	secret: string,
	usage: "encrypt" | "hmac",
): Promise<CryptoKey> {
	const bytes = new TextEncoder().encode(secret);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return crypto.subtle.importKey(
		"raw",
		digest,
		usage === "encrypt" ? { name: "AES-GCM" } : { name: "HMAC", hash: "SHA-256" },
		false,
		usage === "encrypt" ? ["encrypt", "decrypt"] : ["sign", "verify"],
	);
}

export async function encryptField(
	plaintext: string,
	secret: string,
): Promise<string> {
	const key = await importKey(secret, "encrypt");
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
		key,
		new TextEncoder().encode(plaintext),
	);
	const combined = new Uint8Array(12 + cipher.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(cipher), 12);
	return `v1.${base64UrlEncode(combined)}`;
}

export async function decryptField(
	envelope: string,
	secret: string,
): Promise<string> {
	const [version, payload] = envelope.split(".");
	if (version !== "v1" || !payload) throw new Error("Unknown ciphertext version");
	const key = await importKey(secret, "encrypt");
	const combined = base64UrlDecode(payload);
	const plain = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: combined.slice(0, 12) as unknown as ArrayBuffer },
		key,
		combined.slice(12) as unknown as ArrayBuffer,
	);
	return new TextDecoder().decode(plain);
}

export async function hmacHex(
	message: string,
	secret: string,
): Promise<string> {
	const key = await importKey(secret, "hmac");
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(message),
	);
	return [...new Uint8Array(signature)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export async function signSelection(
	data: Record<string, unknown>,
	secret: string,
	ttlSeconds = 86400,
): Promise<string> {
	const body = {
		data,
		exp: Math.floor(Date.now() / 1000) + ttlSeconds,
	};
	const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(body)));
	const signature = await hmacHex(`city-selection:${encoded}`, secret);
	return `${encoded}.${signature}`;
}

export async function verifySelection<T>(
	token: string,
	secret: string,
): Promise<T> {
	const [encoded, signature] = token.split(".");
	if (!encoded || !signature) throw new Error("Invalid selection");
	const expected = await hmacHex(`city-selection:${encoded}`, secret);
	if (expected.length !== signature.length) throw new Error("Invalid selection");
	let diff = 0;
	for (let i = 0; i < expected.length; i++) {
		diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
	}
	if (diff !== 0) throw new Error("Invalid selection");
	const body = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded))) as {
		data: T;
		exp: number;
	};
	if (typeof body.exp !== "number" || body.exp * 1000 <= Date.now()) {
		throw new Error("Expired selection");
	}
	return body.data;
}
