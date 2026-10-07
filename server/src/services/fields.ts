import { decryptField, encryptField } from "../lib/codec.js";

export function enc(value: string, secret: string): Promise<string>;
export function enc(value: null | undefined, secret: string): Promise<null>;
export async function enc(
	value: string | null | undefined,
	secret: string,
): Promise<string | null> {
	if (value === null || value === undefined) return null;
	return encryptField(value, secret);
}

export async function dec(
	envelope: string | null | undefined,
	secret: string,
): Promise<string | null> {
	if (envelope === null || envelope === undefined) return null;
	return decryptField(envelope, secret);
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
	secret: string,
	fallback: T,
): Promise<T> {
	if (envelope === null || envelope === undefined) return fallback;
	try {
		return JSON.parse(await decryptField(envelope, secret)) as T;
	} catch {
		return fallback;
	}
}
