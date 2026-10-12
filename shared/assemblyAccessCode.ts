export const ACCESS_CODE_LENGTH = 7;

export function normalizeAccessCode(value: string) {
	return value.replace(/\D/g, "");
}

export function isCompleteAccessCode(value: string) {
	return /^\d{7}$/.test(normalizeAccessCode(value));
}
