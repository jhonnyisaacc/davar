import type { Context } from "hono";
import { z } from "zod";
import { DomainError } from "../lib/errors.js";

export class ValidationError extends DomainError {
	readonly details: unknown;
	constructor(details: unknown) {
		super("validation_failed", 422);
		this.details = details;
	}
}

export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
	const result = schema.safeParse(value ?? {});
	if (!result.success) {
		throw new ValidationError(result.error.flatten());
	}
	return result.data;
}

export function parseQuery<T>(schema: z.ZodType<T>, value: Record<string, string>): T {
	const result = schema.safeParse(value);
	if (!result.success) {
		throw new ValidationError(result.error.flatten());
	}
	return result.data;
}

export const optionalJson = (value: unknown): Record<string, unknown> =>
	typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rails casts malformed ids to nil and raises RecordNotFound, so every uuid
// that fails validation answers 404 instead of leaking a database syntax
// error as a 500 — route params and body ids alike.
export function uuidValue(value: unknown): string {
	if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
		throw new DomainError("not_found", 404);
	}
	return value;
}

export function uuidParam(c: Context, key: string): string {
	return uuidValue(c.req.param()[key] ?? "");
}
