// Postgres error helpers. Drizzle wraps driver errors, so the SQLSTATE
// lives on `cause` (for example `cause.code === "23505"`) while the outer
// message is a generic "Failed query" string that may include bound params
// and must never be logged.
export function pgErrorCode(error: unknown): string | null {
	let current: unknown = error;
	const seen = new Set<unknown>();
	while (current !== null && typeof current === "object" && !seen.has(current)) {
		seen.add(current);
		const code = (current as { code?: unknown }).code;
		if (typeof code === "string" && code.length > 0) return code;
		current = (current as { cause?: unknown }).cause;
	}
	return null;
}

export function isUniqueViolation(error: unknown): boolean {
	return pgErrorCode(error) === "23505";
}
