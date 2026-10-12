export function randomToken(bytes = 48): string {
	const raw = crypto.getRandomValues(new Uint8Array(bytes));
	return base64UrlEncode(raw);
}

export async function sha256Hex(input: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(input),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export async function pkceChallenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(verifier),
	);
	return base64UrlEncode(new Uint8Array(digest));
}

export function base64UrlEncode(bytes: Uint8Array): string {
	let text = "";
	for (const byte of bytes) text += String.fromCharCode(byte);
	return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(input: string): Uint8Array {
	const padded = input.replace(/-/g, "+").replace(/_/g, "/");
	const bin = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
	return Uint8Array.from(bin, (char) => char.charCodeAt(0));
}

export function timingSafeEqualHex(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}
