import {
	type CommentaryRuntime,
	commentaryAccessLabel,
} from "@davar/shared/commentaryPresentation";
import type {
	Account,
	Article,
	CommentaryContext,
	Conversation,
	ProviderConnection,
} from "@davar/shared/productContracts";
import { SIGN_IN_PROVIDERS } from "@davar/shared/productContracts";
import { type LucideIcon, User } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
	acceptSessionToken,
	acceptSignIn,
	productApi,
} from "../services/productApi";
import { AssembliesEntry } from "./AssembliesEntry";
import { AssembliesWorkspace } from "./AssembliesWorkspace";
import { CalendarPanel } from "./CalendarPanel";
import { NeumorphCard } from "./NeumorphCard";
export function ProductScreen({
	screen,
	language,
	context,
}: {
	context?: CommentaryContext | null;
	screen: "widgets" | "commentary" | "assemblies";
	language: "en" | "es" | "he";
}) {
	const [account, setAccount] = useState<Account | null>(null);
	const [sessionReady, setSessionReady] = useState(false);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [email, setEmail] = useState("");
	const [articles, setArticles] = useState<Article[]>([]);
	const [article, setArticle] = useState<Article | null>(null);
	const [mode, setMode] = useState<"chat" | "articles">("chat");
	const [prompt, setPrompt] = useState("");
	const [history, setHistory] = useState<{ id: string; title: string }[]>([]);
	const [connections, setConnections] = useState<ProviderConnection[]>([]);
	const [developmentProvider, setDevelopmentProvider] =
		useState<CommentaryRuntime["commentary_provider"]>(null);
	const [conversation, setConversation] = useState<Conversation | null>(null);
	const [provider, setProvider] = useState("chatgpt");
	const [credential, setCredential] = useState("");
	const [model, setModel] = useState("");
	const run = useCallback(async (action: () => Promise<void>) => {
		setBusy(true);
		setError("");
		try {
			await action();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Unavailable");
		} finally {
			setBusy(false);
		}
	}, []);
	useEffect(() => {
		const query = new URLSearchParams(window.location.search);
		const handoff = query.get("code");
		if (handoff) {
			window.history.replaceState(null, "", window.location.pathname);
		}
		if (handoff || productApi.authenticated()) {
			void run(async () => {
				try {
					setAccount(
						handoff
							? await acceptSignIn(handoff)
							: await productApi.request<Account>("/account", { cache: true }),
					);
				} finally {
					setSessionReady(true);
				}
			});
		} else setSessionReady(true);
	}, [run]);
	useEffect(() => {
		if (mode === "articles")
			void run(async () =>
				setArticles(
					(
						await productApi.request<{ articles: Article[] }>("/articles", {
							public: true,
							cache: true,
						})
					).articles,
				),
			);
	}, [mode, run]);
	useEffect(() => {
		if (screen !== "commentary") return;
		let active = true;
		productApi
			.request<CommentaryRuntime>("/auth/providers", { public: true })
			.then((runtime) => {
				if (active) setDevelopmentProvider(runtime.commentary_provider ?? null);
			})
			.catch(() => {});
		return () => {
			active = false;
		};
	}, [screen]);
	const accountId = account?.id;
	useEffect(() => {
		setConnections([]);
		if (!accountId || screen !== "commentary") return;
		let active = true;
		productApi
			.request<{ connections: ProviderConnection[] }>("/provider_connections")
			.then((result) => {
				if (active) setConnections(result.connections);
			})
			.catch((e) => {
				if (active) setError(e.message);
			});
		return () => {
			active = false;
		};
	}, [accountId, screen]);
	const field = (
		label: string,
		value: string,
		set: (value: string) => void,
		secret = false,
	) => (
		<label className="flex flex-col gap-2">
			{label}
			<input
				aria-label={label}
				placeholder={label === "Ask Davar" ? "Ask Davar…" : undefined}
				type={secret ? "password" : "text"}
				value={value}
				onChange={(e) => set(e.target.value)}
				className="rounded-xl p-3 border border-[var(--neomorph-border)] bg-[var(--neomorph-bg)]"
			/>
		</label>
	);
	const button = (label: string, action: () => void, Icon?: LucideIcon) => (
		<button
			type="button"
			disabled={busy}
			onClick={action}
			className="inline-flex items-center gap-2 rounded-full px-5 py-3 border border-[var(--primary)] bg-[var(--neomorph-bg)] disabled:opacity-50"
		>
			{Icon ? <Icon size={18} aria-hidden="true" /> : null}
			{label}
		</button>
	);
	const signIn = (
		<NeumorphCard className="p-6 space-y-4">
			<p>
				{account
					? "Link a verified identity to this account"
					: "Scripture is always available without an account."}
			</p>
			{SIGN_IN_PROVIDERS.filter((p) => p !== "email").map((p) => (
				<span key={p}>
					{button(
						p,
						() =>
							void run(async () => {
								const result = await productApi.request<{
									authorization_url: string;
								}>(`/auth/${p}/start`, {
									method: "POST",
									public: !account,
									body: {
										return_uri:
											window.location.origin + window.location.pathname,
										link: !!account,
									},
								});
								window.location.assign(result.authorization_url);
							}),
					)}
				</span>
			))}
			{field("Email", email, setEmail)}
			{button(
				"Send magic link",
				() =>
					void run(async () => {
						await productApi.request("/auth/email/start", {
							method: "POST",
							public: !account,
							body: {
								email,
								link: !!account,
								return_uri: window.location.origin + window.location.pathname,
							},
						});
						setError("Check your email for a sign-in link.");
					}),
			)}
		</NeumorphCard>
	);
	const content = (
		<main
			dir={language === "he" ? "rtl" : "ltr"}
			className="max-w-4xl mx-auto px-6 pb-24 space-y-5 text-[var(--text-primary)]"
		>
			<h1 className="text-3xl font-semibold">
				{screen === "widgets"
					? "Biblical Calendar"
					: screen === "commentary"
						? "Commentary"
						: "Assemblies"}
			</h1>
			{screen === "commentary" && context ? (
				<p className="text-sm text-[var(--accent-deep)]">
					{context.reference.book_id} {context.reference.chapter}:
					{context.reference.verse} · {context.edition_id}
					{context.selected_text ? ` · ${context.selected_text}` : ""}
				</p>
			) : null}
			{error ? <p role="status">{error}</p> : null}
			{screen === "widgets" ? <CalendarPanel language={language} /> : null}
			{screen === "commentary" ? (
				<>
					{button(mode === "chat" ? "▤ Articles" : "Return to AI chat", () => {
						setMode(mode === "chat" ? "articles" : "chat");
						setArticle(null);
					})}
					{mode === "articles" ? (
						<>
							{article ? (
								<NeumorphCard className="p-6 space-y-4">
									<h2>{article.title}</h2>
									<p className="whitespace-pre-wrap">{article.body}</p>
									<p>{article.attribution}</p>
									<a href={article.source_url} target="_blank" rel="noreferrer">
										Read source
									</a>
									{button("Back", () => setArticle(null))}
								</NeumorphCard>
							) : (
								articles.map((item) => (
									<NeumorphCard key={item.id} className="p-6 space-y-3">
										<h2>{item.title}</h2>
										<p>{item.attribution}</p>
										{button(
											"Read",
											() =>
												void run(async () =>
													setArticle(
														await productApi.request<Article>(
															`/articles/${item.id}`,
															{ public: true, cache: true },
														),
													),
												),
										)}
									</NeumorphCard>
								))
							)}
							{!articles.length ? (
								<p>No published articles available yet.</p>
							) : null}
							<div className="fixed bottom-6 right-6">
								{button("↩ AI chat", () => setMode("chat"))}
							</div>
						</>
					) : !account ? (
						<>
							<h2 className="text-[28px] font-semibold">
								What do you want to understand today?
							</h2>
							<p className="text-xs text-[var(--accent-deep)]">
								{commentaryAccessLabel(undefined, developmentProvider)}
							</p>
							{[
								"What is the Son of Man?",
								"What is the Son of God?",
								"What is the Father?",
								"What is the meaning of faith?",
							].map((label) => (
								<div key={label}>
									{button(
										label,
										() => setPrompt(label),
										label === "What is the Father?" ? User : undefined,
									)}
								</div>
							))}
							{field("Ask Davar", prompt, setPrompt)}
							{button(
								"Start free consultation",
								() =>
									void run(async () => {
										const result = await productApi.request<{ token: string }>(
											"/auth/guest",
											{ method: "POST", public: true },
										);
										setAccount(await acceptSessionToken(result.token));
									}),
							)}
							{signIn}
						</>
					) : (
						<>
							<p className="text-xs text-[var(--accent-deep)]">
								{commentaryAccessLabel(
									connections[0]?.provider,
									developmentProvider,
								)}
							</p>
							{button(
								"History",
								() =>
									void run(async () =>
										setHistory(
											(
												await productApi.request<{
													conversations: typeof history;
												}>("/conversations")
											).conversations,
										),
									),
							)}
							{button("New conversation", () => setConversation(null))}
							{history.map((item) => (
								<div key={item.id}>
									{button(
										item.title || "Conversation",
										() =>
											void run(async () =>
												setConversation(
													await productApi.request<Conversation>(
														`/conversations/${item.id}`,
													),
												),
											),
									)}
								</div>
							))}
							{conversation
								? button(
										"Reset memory",
										() =>
											void run(async () => {
												await productApi.request(
													`/conversations/${conversation.id}/memory`,
													{ method: "DELETE" },
												);
											}),
									)
								: null}

							{conversation?.messages.map((message) => (
								<NeumorphCard key={message.id} className="p-6 space-y-2">
									<p>{message.role}</p>
									<p className="whitespace-pre-wrap">{message.content}</p>
									{message.citations?.map((c) => (
										<a
											key={c.source_id}
											href={c.source_url}
											target="_blank"
											rel="noreferrer"
										>
											{c.attribution}
										</a>
									))}
								</NeumorphCard>
							))}
							{field("Ask Davar", prompt, setPrompt)}
							{button(
								"Send",
								() =>
									void run(async () => {
										const id =
											conversation?.id ||
											(
												await productApi.request<{ id: string }>(
													"/conversations",
													{
														method: "POST",
														body: { title: prompt.slice(0, 80) },
													},
												)
											).id;
										await productApi.request(`/conversations/${id}/messages`, {
											method: "POST",
											body: {
												content: prompt,
												context,
												request_id: crypto.randomUUID(),
											},
										});
										setConversation(
											await productApi.request<Conversation>(
												`/conversations/${id}`,
											),
										);
										setPrompt("");
									}),
							)}
							{conversation
								? button(
										"Delete conversation",
										() =>
											void run(async () => {
												await productApi.request(
													`/conversations/${conversation.id}`,
													{ method: "DELETE" },
												);
												setConversation(null);
												setCredential("");
												setPrompt("");
											}),
									)
								: null}
							<NeumorphCard className="p-6 space-y-3">
								{button(
									"Manage provider connections",
									() =>
										void run(async () =>
											setConnections(
												(
													await productApi.request<{
														connections: ProviderConnection[];
													}>("/provider_connections")
												).connections,
											),
										),
								)}
								{connections.map((connection) => (
									<div key={connection.id}>
										<p>
											{connection.provider} · {connection.model}
										</p>
										{button(
											"Disconnect",
											() =>
												void run(async () => {
													await productApi.request(
														`/provider_connections/${connection.id}`,
														{ method: "DELETE" },
													);
													setConnections(
														connections.filter((c) => c.id !== connection.id),
													);
												}),
										)}
									</div>
								))}
								<p> Muse awaits a supported provider API contract.</p>
								<p>
									Connect a provider using API credentials. Consumer
									subscriptions may not include API access.
								</p>
								<select
									aria-label="AI provider"
									value={provider}
									onChange={(e) => setProvider(e.target.value)}
								>
									{["claude", "chatgpt", "grok", "gemini"].map((p) => (
										<option key={p}>{p}</option>
									))}
								</select>
								{field("API key", credential, setCredential, true)}
								{field("Model ID", model, setModel)}
								{button(
									"Connect",
									() =>
										void run(async () => {
											await productApi.request("/provider_connections", {
												method: "POST",
												body: { provider, credential, model },
											});
											setCredential("");
											setConnections(
												(
													await productApi.request<{
														connections: ProviderConnection[];
													}>("/provider_connections")
												).connections,
											);
										}),
								)}
							</NeumorphCard>
						</>
					)}
				</>
			) : null}
			{screen === "assemblies" ? (
				account ? (
					<AssembliesWorkspace account={account} onAccount={setAccount} />
				) : (
					signIn
				)
			) : null}

			{account ? (
				<details>
					<summary>Linked identities</summary>
					<p>{account.providers.join(", ") || "Guest"}</p>
					{signIn}
				</details>
			) : null}
			{account
				? button(
						"Sign out",
						() =>
							void run(async () => {
								try {
									await productApi.request("/auth/session", {
										method: "DELETE",
									});
								} finally {
									await productApi.setSession(null, null);
									setHistory([]);
									setConnections([]);
									setAccount(null);
									setConversation(null);
									setCredential("");
									setPrompt("");
								}
							}),
					)
				: null}
		</main>
	);
	return screen === "assemblies" ? (
		<AssembliesEntry
			language={language}
			account={account}
			onAccount={setAccount}
			sessionReady={sessionReady}
			sessionError={error}
			signIn={signIn}
		>
			{content}
		</AssembliesEntry>
	) : (
		content
	);
}
