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
