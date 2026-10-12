import { useCallback, useEffect, useState, type ReactNode } from "react";
import { User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
	useProductCapabilities,
	capabilitiesStore,
} from "../../hooks/useProductCapabilities";
import { useTranslation } from "../../hooks/useTranslation";
import type { ProductCapabilities } from "@davar/shared/productCapabilities";
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
	language?: "en" | "es" | "he";
	account: Account | null;
	context?: CommentaryContext | null;
	busy: boolean;
	run: (action: () => Promise<void>) => Promise<void>;
	signIn: ReactNode;
	prompt: string;
	setPrompt: (prompt: string) => void;
};

function useCommentaryLibrary(
	run: CommentaryProps["run"],
	aiAvailable: boolean,
	ready: boolean,
) {
	const [articles, setArticles] = useState<Article[]>([]);
	const [articlesLoading, setArticlesLoading] = useState(true);
	const [nextOffset, setNextOffset] = useState<number | null>(null);
	const [article, setArticle] = useState<Article | null>(null);
	useEffect(() => {
		if (article) window.scrollTo({ top: 0 });
	}, [article]);
	const [selectedMode, setMode] = useState<"chat" | "articles">("chat");
	const mode = aiAvailable ? selectedMode : "articles";
	const loadArticles = useCallback(async (offset = 0) => {
		setArticlesLoading(true);
		try {
			const result = await productApi.request<{
				articles: Article[];
				next_offset?: number | null;
			}>(`/articles${offset ? `?offset=${offset}` : ""}`, {
				public: true,
				cache: true,
			});
			setArticles((previous) =>
				offset ? [...previous, ...result.articles] : result.articles,
			);
			setNextOffset(result.next_offset ?? null);
		} finally {
			setArticlesLoading(false);
		}
	}, []);
	useEffect(() => {
		if (ready && mode === "articles") void run(() => loadArticles());
	}, [mode, ready, run, loadArticles]);
	return {
		articles,
		article,
		setArticle,
		mode,
		setMode,
		nextOffset,
		loadArticles,
		articlesLoading,
	};
}

export function CommentaryScreen(props: CommentaryProps) {
	const { capabilities, ready } = useProductCapabilities();
	const library = useCommentaryLibrary(
		props.run,
		capabilities.ai.available,
		ready,
	);
	useEffect(() => {
		if (!props.account) library.setArticle(null);
	}, [props.account, library.setArticle]);
	return (
		<CommentaryWorkspace
			key={props.account?.id || "guest"}
			{...props}
			capabilities={capabilities}
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
	capabilities,
	language = "en",
}: CommentaryProps & {
	library: ReturnType<typeof useCommentaryLibrary>;
	capabilities: ProductCapabilities;
}) {
	const {
		articles,
		article,
		setArticle,
		mode,
		setMode,
		nextOffset,
		loadArticles,
		articlesLoading,
	} = library;
	const { t } = useTranslation(language);
	const canConnect =
		capabilities.flags.ai_provider_connections &&
		capabilities.ai.providers.length > 0;
	const registered = !!account?.providers?.length;
	const setAccount = webSession.setAccount;
	const [error, setError] = useState("");
	const { field, button } = productControls(busy);
	const [history, setHistory] = useState<{ id: string; title: string }[]>([]);
	const [connections, setConnections] = useState<ProviderConnection[]>([]);
	const connectedProvider = connections.find((c) =>
		capabilities.ai.providers.includes(c.provider),
	);
	const accessLabel = connectedProvider
		? t("featureAvailability.providerAi", {
				provider: connectedProvider.provider,
			})
		: t("featureAvailability.sharedAi");
	const [conversation, setConversation] = useState<Conversation | null>(null);
	const [provider, setProvider] = useState("chatgpt");
	const [credential, setCredential] = useState("");
	const [model, setModel] = useState("");
	const accountId = account?.id;
	useEffect(() => {
		setConnections([]);
		if (!accountId || !canConnect) return;
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
	}, [accountId, canConnect]);
	useEffect(() => {
		if (!capabilities.ai.providers.includes(provider))
			setProvider(capabilities.ai.providers[0] || "");
	}, [capabilities.ai.providers, provider]);

	const providerPanel =
		registered && canConnect ? (
			<NeumorphCard className="p-6 space-y-3">
				{button(
					t("featureAvailability.manageProviders"),
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
							t("featureAvailability.disconnect"),
							() =>
								void run(async () => {
									await productApi.request(
										`/provider_connections/${connection.id}`,
										{ method: "DELETE" },
									);
									setConnections(
										connections.filter((c) => c.id !== connection.id),
									);
									void capabilitiesStore.refresh();
								}),
						)}
					</div>
				))}
				<p>{t("featureAvailability.providerApiNotice")}</p>
				<select
					aria-label={t("featureAvailability.aiProvider")}
					value={provider}
					onChange={(e) => setProvider(e.target.value)}
				>
					{capabilities.ai.providers.map((p) => (
						<option key={p}>{p}</option>
					))}
				</select>
				{field(
					t("featureAvailability.apiKey"),
					credential,
					setCredential,
					true,
				)}
				{field(t("featureAvailability.modelId"), model, setModel)}
				{button(
					t("featureAvailability.connectProvider"),
					() =>
						void run(async () => {
							await productApi.request("/provider_connections", {
								method: "POST",
								body: { provider, credential, model },
							});
							setCredential("");
							void capabilitiesStore.refresh();
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
		) : null;
	return (
		<>
			{error ? <p role="status">{error}</p> : null}

			{capabilities.ai.available &&
				button(
					mode === "chat"
						? t("featureAvailability.articles")
						: t("featureAvailability.returnAi"),
					() => {
						setMode(mode === "chat" ? "articles" : "chat");
						setArticle(null);
					},
				)}
			{mode === "articles" ? (
				<>
					{!capabilities.ai.available && (
						<p className="text-sm text-[var(--text-secondary)]">
							{t("featureAvailability.articleIntro")}
						</p>
					)}
					{article ? (
						<NeumorphCard className="p-6 space-y-4">
							<h2>{article.title}</h2>
							<div
								dir={article.locale === "he" ? "rtl" : "ltr"}
								lang={article.locale}
								className="space-y-3 overflow-x-auto text-sm leading-relaxed [&_h1]:text-xl [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-6 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:list-decimal [&_ol]:ps-5 [&_table]:border-collapse [&_td]:border [&_td]:p-2 [&_th]:border [&_th]:p-2 [&_a]:underline"
							>
								<ReactMarkdown
									remarkPlugins={[remarkGfm]}
									components={{
										a: ({ children, href }) => (
											<a href={href} target="_blank" rel="noreferrer">
												{children}
											</a>
										),
									}}
								>
									{article.body || ""}
								</ReactMarkdown>
							</div>
							<p>{article.attribution}</p>
							<a href={article.source_url} target="_blank" rel="noreferrer">
								{t("featureAvailability.readSource")}
							</a>
							{button(t("featureAvailability.back"), () => setArticle(null))}
						</NeumorphCard>
					) : (
						articles.map((item) => (
							<NeumorphCard key={item.id} className="p-6 space-y-3">
								<h2>{item.title}</h2>
								<p>{item.attribution}</p>
								{button(
									t("featureAvailability.read"),
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
					{!article &&
						nextOffset !== null &&
						button(
							t("featureAvailability.moreArticles"),
							() => void run(() => loadArticles(nextOffset)),
						)}
					{articlesLoading && !articles.length && (
						<p role="status">{t("common.loading")}</p>
					)}
					{!articlesLoading && !article && !articles.length ? (
						<p>{t("featureAvailability.noArticles")}</p>
					) : null}
				</>
			) : !account ? (
				<>
					<h2 className="text-[28px] font-semibold">
						What do you want to understand today?
					</h2>
					<p className="text-xs text-[var(--accent-deep)]">{accessLabel}</p>
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
					<p className="text-xs text-[var(--accent-deep)]">{accessLabel}</p>
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
								try {
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
								} catch {
									setMode("articles");
									setError(t("featureAvailability.aiUnavailable"));
									void capabilitiesStore.refresh();
								}
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
										setPrompt("");
									}),
							)
						: null}
				</>
			)}
			{providerPanel}
			{mode === "articles" && canConnect && !registered ? signIn : null}
		</>
	);
}
