import { useEffect, useState, type ReactNode } from "react";
import { User } from "lucide-react";
import {
	commentaryAccessLabel,
	type CommentaryRuntime,
} from "@davar/shared/commentaryPresentation";
import { commentaryCitationLabel } from "@davar/shared/commentaryCitations";
import type {
	Account,
	Article,
	CommentaryContext,
	Conversation,
	ProviderConnection,
} from "@davar/shared/productContracts";
import {
	acceptSessionToken,
	productApi,
	webSession,
} from "../../services/productApi";
import { NeumorphCard } from "../../components/NeumorphCard";
import { productControls } from "../product/controls";
type CommentaryProps = {
	account: Account | null;
	context?: CommentaryContext | null;
	busy: boolean;
	run: (action: () => Promise<void>) => Promise<void>;
	signIn: ReactNode;
	prompt: string;
	setPrompt: (prompt: string) => void;
};

function useCommentaryLibrary(run: CommentaryProps["run"]) {
	const [articles, setArticles] = useState<Article[]>([]);
	const [article, setArticle] = useState<Article | null>(null);
	const [mode, setMode] = useState<"chat" | "articles">("chat");
	const [developmentProvider, setDevelopmentProvider] =
		useState<CommentaryRuntime["commentary_provider"]>(null);
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
	}, []);

	return { articles, article, setArticle, mode, setMode, developmentProvider };
}

export function CommentaryScreen(props: CommentaryProps) {
	const library = useCommentaryLibrary(props.run);
	useEffect(() => {
		if (!props.account) library.setArticle(null);
	}, [props.account, library.setArticle]);
	return (
		<CommentaryWorkspace
			key={props.account?.id || "guest"}
			{...props}
			library={library}
		/>
	);
}

function CommentaryWorkspace({
	account,
	context,
	busy,
	run,
	signIn,
	prompt,
	setPrompt,
	library,
}: CommentaryProps & { library: ReturnType<typeof useCommentaryLibrary> }) {
	const { articles, article, setArticle, mode, setMode, developmentProvider } =
		library;
	const setAccount = webSession.setAccount;
	const [error, setError] = useState("");
	const { field, button } = productControls(busy);
	const [history, setHistory] = useState<{ id: string; title: string }[]>([]);
	const [connections, setConnections] = useState<ProviderConnection[]>([]);
	const [conversation, setConversation] = useState<Conversation | null>(null);
	const [provider, setProvider] = useState("chatgpt");
	const [credential, setCredential] = useState("");
	const [model, setModel] = useState("");
	const accountId = account?.id;
	useEffect(() => {
		setConnections([]);
		if (!accountId) return;
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
	}, [accountId]);

	return (
		<>
			{error ? <p role="status">{error}</p> : null}

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
									className="block text-sm leading-relaxed text-[var(--accent-deep)] underline underline-offset-2"
									href={c.source_url}
									target="_blank"
									rel="noreferrer"
								>
									{commentaryCitationLabel(c)}
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
										await productApi.request<{ id: string }>("/conversations", {
											method: "POST",
											body: { title: prompt.slice(0, 80) },
										})
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
							Connect a provider using API credentials. Consumer subscriptions
							may not include API access.
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
	);
}
