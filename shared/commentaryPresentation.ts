const providerNames: Record<string, string> = {
	chatgpt: "ChatGPT",
	claude: "Claude",
	grok: "Grok",
	gemini: "Gemini",
	openrouter: "OpenRouter",
};

export type CommentaryRuntime = {
	commentary_provider?: "openrouter" | null;
};

export function commentaryAccessLabel(
	connectedProvider?: string,
	developmentProvider?: "openrouter" | null,
): string {
	if (developmentProvider === "openrouter") return "Powered by OpenRouter";
	if (connectedProvider)
		return `Powered by your ${providerNames[connectedProvider] || connectedProvider} subscription`;
	return "1 free consult · no login needed";
}
