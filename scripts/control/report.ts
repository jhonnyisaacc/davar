export function emit(fields: Record<string, string | number>): void {
	for (const [key, value] of Object.entries(fields)) {
		console.log(`${key} ${value}`);
	}
}

export function finish(
	ok: boolean,
	fields: Record<string, string | number>,
): never {
	emit({ status: ok ? "ok" : "fail", ...fields });
	process.exit(ok ? 0 : 1);
}
