export function formatQueryLog(query: string): string {
	return JSON.stringify({ event: "query", query });
}
