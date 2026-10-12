import { decryptField, encryptField } from "../lib/codec.js";

export interface PreviousKeys {
	previousKeys?: readonly string[];
}

export function enc(value: string, secret: string): Promise<string>;
export function enc(value: null | undefined, secret: string): Promise<null>;
export async function enc(
	value: string | null | undefined,
	secret: string,
): Promise<string | null> {
	if (value === null || value === undefined) return null;
	return encryptField(value, secret);
}

// Ordered decryption ring: the current primary first, then previous keys
// kept only to open rows written before a rotation.
export function decryptionRing(
	primary: string,
	previous?: readonly string[],
): readonly string[] {
	return previous && previous.length > 0 ? [primary, ...previous] : [primary];
}

// Decryption accepts an ordered key ring (current primary first, previous
// keys after) so a rotated primary keeps opening older rows. Returns null
// when no key opens the envelope instead of throwing.
export async function dec(
	envelope: string | null | undefined,
	secrets: string | readonly string[],
): Promise<string | null> {
	if (envelope === null || envelope === undefined) return null;
	const ring = Array.isArray(secrets) ? secrets : [secrets];
	for (const secret of ring) {
		try {
			return await decryptField(envelope, secret);
		} catch {
			// Try the next key in the ring.
		}
	}
	return null;
}

export async function encJson(
	value: unknown,
	secret: string,
): Promise<string> {
	return encryptField(JSON.stringify(value ?? null), secret);
}

export function asDate(value: Date | string | null | undefined): Date | null {
	if (value === null || value === undefined) return null;
	return value instanceof Date ? value : new Date(value);
}

export function asDateRequired(value: Date | string | null | undefined): Date {
	const date = asDate(value);
	if (!date || Number.isNaN(date.getTime())) throw new Error("Invalid timestamp");
	return date;
}

export async function decJson<T>(
	envelope: string | null | undefined,
	secrets: string | readonly string[],
	fallback: T,
): Promise<T> {
	if (envelope === null || envelope === undefined) return fallback;
	try {
		const plain = await dec(envelope, secrets);
		if (plain === null) return fallback;
		return JSON.parse(plain) as T;
	} catch {
		return fallback;
	}
}
