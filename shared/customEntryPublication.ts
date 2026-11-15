import spec from "./customEntryPublication.json";

const STATUSES: readonly string[] = spec.statuses;

export type CustomEntryPublication = {
	status: string;
	rule: string;
	rule_version: number;
	evidence: string[];
};

const publicationStatus = (key: string, publication: unknown): string => {
	const status = (publication as { status?: unknown } | null)?.status;
	if (typeof status !== "string" || !STATUSES.includes(status)) {
		throw new Error(
			`${key} has an invalid publication status: ${JSON.stringify(publication)}`,
		);
	}
	return status;
};

export const isPublishedCustomEntry = (
	key: string,
	entry: { publication?: unknown },
): boolean =>
	entry.publication === undefined ||
	publicationStatus(key, entry.publication) === spec.published;

export const publishedCustomEntries = <T extends { publication?: unknown }>(
	custom: Record<string, T>,
): Record<string, T> =>
	Object.fromEntries(
		Object.entries(custom).filter(([key, entry]) =>
			isPublishedCustomEntry(key, entry),
		),
	);
