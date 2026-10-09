import { base64UrlDecode, base64UrlEncode } from "./crypto.js";

const KEY_ID_BYTES = 4;

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

export async function encryptionKeyId(secret: string): Promise<string> {
	const digest = new Uint8Array(
		await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)),
	);
	let id = "";
	for (let index = 0; index < KEY_ID_BYTES; index++) {
		const byte = digest[index];
		if (byte === undefined) throw new Error("Unknown encryption key");
		id += byte.toString(16).padStart(2, "0");
	}
	return id;
}

function isKeyId(value: string): boolean {
	return value.length === KEY_ID_BYTES * 2 && /^[0-9a-f]+$/.test(value);
}

async function openPayload(payload: string, key: CryptoKey): Promise<string> {
	const combined = base64UrlDecode(payload);
	if (combined.byteLength < 28) throw new Error("Unknown ciphertext version");
	const plain = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: combined.slice(0, 12) as unknown as ArrayBuffer },
		key,
		combined.slice(12) as unknown as ArrayBuffer,
	);
	return new TextDecoder().decode(plain);
}

export async function encryptField(
	plaintext: string,
	secret: string,
): Promise<string> {
	const key = await importKey(secret, "encrypt");
	const keyId = await encryptionKeyId(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: iv as unknown as ArrayBuffer },
		key,
		new TextEncoder().encode(plaintext),
	);
	const combined = new Uint8Array(12 + cipher.byteLength);
	combined.set(iv, 0);
	combined.set(new Uint8Array(cipher), 12);
	return `v1.${keyId}.${base64UrlEncode(combined)}`;
}

export async function decryptField(
	envelope: string,
	secret: string,
): Promise<string> {
	const parts = envelope.split(".");
	if (parts[0] !== "v1" || parts.some((part) => part.length === 0)) {
		throw new Error("Unknown ciphertext version");
	}
	const key = await importKey(secret, "encrypt");
	if (parts.length === 2) {
		const payload = parts[1];
		if (!payload) throw new Error("Unknown ciphertext version");
		return openPayload(payload, key);
	}
	if (parts.length !== 3) throw new Error("Unknown ciphertext version");
	const keyId = parts[1];
	const payload = parts[2];
	if (!keyId || !payload || !isKeyId(keyId)) {
		throw new Error("Unknown ciphertext version");
	}
	if (keyId !== (await encryptionKeyId(secret))) throw new Error("Unknown encryption key");
	return openPayload(payload, key);
}

// Internal digests and signatures only: the key is derived with SHA-256
// first, so this must never stand in for an external HMAC contract.
export async function derivedHmacHex(
	message: string,
	secret: string,
): Promise<string> {
	const key = await importKey(secret, "hmac");
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(message),
	);
	return hexBytes(signature);
}

// External HMAC contracts (for example Facebook's appsecret_proof, which
// Rails computes with OpenSSL::HMAC and the raw secret): the key is used
// exactly as given.
export async function hmacSha256Hex(key: string, message: string): Promise<string> {
	const imported = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		imported,
		new TextEncoder().encode(message),
	);
	return hexBytes(signature);
}

function hexBytes(buffer: ArrayBuffer): string {
	return [...new Uint8Array(buffer)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

async function selectionToken(
	data: Record<string, unknown>,
	key: CryptoKey,
	exp: number,
): Promise<string> {
	const encoded = base64UrlEncode(
		new TextEncoder().encode(JSON.stringify({ data, exp })),
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`city-selection:${encoded}`),
	);
	return `${encoded}.${hexBytes(signature)}`;
}

export async function signSelection(
	data: Record<string, unknown>,
	secret: string,
	ttlSeconds = 86400,
): Promise<string> {
	const key = await importKey(secret, "hmac");
	return selectionToken(
		data,
		key,
		Math.floor(Date.now() / 1000) + ttlSeconds,
	);
}

export async function signSelections(
	rows: Record<string, unknown>[],
	secret: string,
	ttlSeconds = 86400,
): Promise<string[]> {
	const key = await importKey(secret, "hmac");
	const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
	return Promise.all(rows.map((data) => selectionToken(data, key, exp)));
}

export async function verifySelection<T>(
	token: string,
	secret: string,
): Promise<T> {
	const [encoded, signature] = token.split(".");
	if (!encoded || !signature) throw new Error("Invalid selection");
	const expected = await derivedHmacHex(`city-selection:${encoded}`, secret);
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
