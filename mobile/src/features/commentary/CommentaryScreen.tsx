import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-native-markdown-display";
import {
	KeyboardAvoidingView,
	Linking,
	Platform,
	Pressable,
	ScrollView,
	Text,
	TextInput,
	View,
} from "react-native";
import {
	SafeAreaView,
	useSafeAreaInsets,
} from "react-native-safe-area-context";
import { getNavigationDockContentPadding } from "@/src/constants/navigationDock";
import {
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	BookOpen,
	Crown,
	History,
	Lock,
	Plus,
	ScrollText,
	Sparkles,
	User,
} from "lucide-react-native";
import type {
	Article,
	Conversation,
	ProviderConnection,
} from "@davar/shared/productContracts";
import {
	useProductCapabilities,
	capabilitiesStore,
} from "../product/useProductCapabilities";
import { useTranslation } from "@/src/i18n/useTranslation";
import { ProviderConnections } from "./ProviderConnections";
import { commentaryCitationLabel } from "@davar/shared/commentaryCitations";
import { productApi, useSession } from "../account/session";
import { useCommentaryContext } from "./context";
import { Action, Card, Copy, useProductStyle } from "../product/ui";
const starters = [
	{ label: "What is the Son of Man?", icon: ScrollText },
	{ label: "What is the Son of God?", icon: Crown },
	{ label: "What is the Father?", icon: User },
	{ label: "What is the meaning of faith?", icon: Sparkles },
];
export default function CommentaryScreen() {
	const { capabilities, ready } = useProductCapabilities();
	const { t } = useTranslation();
	const canConnect =
		capabilities.flags.ai_provider_connections &&
		capabilities.ai.providers.length > 0;
	const account = useSession((s) => s.account);
	const accountId = account?.id;
	const context = useCommentaryContext((s) => s.context);
	const { colors, rtl } = useProductStyle();
	const insets = useSafeAreaInsets();
	const dark = colors.background === "#3C3836";
	const surface = dark ? "#44403E" : "#F4EEE7";
	const accent = dark ? "#BCD8FF" : "#4C72A8";
	const [selectedMode, setMode] = useState<"chat" | "articles">("chat");
	const mode = capabilities.ai.available ? selectedMode : "articles";
	const [articles, setArticles] = useState<Article[]>([]);
	const [articlesLoading, setArticlesLoading] = useState(true);
	const [nextOffset, setNextOffset] = useState<number | null>(null);
	const [article, setArticle] = useState<Article | null>(null);
	const [conversation, setConversation] = useState<Conversation | null>(null);
	const [history, setHistory] = useState<{ id: string; title: string }[]>([]);
	const [showHistory, setShowHistory] = useState(false);
	const [prompt, setPrompt] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [connections, setConnections] = useState<ProviderConnection[]>([]);
	const [connect, setConnect] = useState(false);
	const connectedProvider = connections.find((c) =>
		capabilities.ai.providers.includes(c.provider),
	);
	const sending = useRef(false);
	const scroll = useRef<ScrollView>(null);
	useEffect(() => {
		if (article) scroll.current?.scrollTo({ y: 0, animated: false });
	}, [article]);
	useEffect(() => {
		setConversation(null);
		setPrompt("");
		setHistory([]);
		setConnections([]);
		if (!accountId) return;
		let active = true;
		productApi
			.request<{ conversations: typeof history }>("/conversations", {
				cache: true,
			})
			.then((r) => {
				if (active) setHistory(r.conversations);
			})
			.catch((e) => setError(e.message));
		if (canConnect)
			productApi
				.request<{ connections: ProviderConnection[] }>("/provider_connections")
				.then((r) => {
					if (active) setConnections(r.connections);
				})
				.catch((e) => setError(e.message));
		return () => {
			active = false;
		};
	}, [accountId, canConnect]);
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
		if (ready && mode === "articles")
			void Promise.resolve()
				.then(() => loadArticles())
				.catch((e) => setError(e.message));
	}, [mode, ready, loadArticles]);
	async function run(action: () => Promise<void>) {
		setBusy(true);
		setError("");
		try {
			await action();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Unavailable");
		} finally {
			setBusy(false);
		}
	}
	async function open(id: string) {
		setConversation(
			await productApi.request<Conversation>(`/conversations/${id}`, {
				cache: true,
			}),
		);
		setShowHistory(false);
	}
	async function send() {
		if (sending.current || !prompt.trim()) return;
		sending.current = true;
		const content = prompt;
		await run(async () => {
			try {
				if (!useSession.getState().account) {
					const result = await productApi.request<{ token: string }>(
						"/auth/guest",
						{ method: "POST", public: true },
					);
					await useSession.getState().accept(result.token);
				}
				const id =
					conversation?.id ||
					(
						await productApi.request<{ id: string }>("/conversations", {
							method: "POST",
							body: { title: content.slice(0, 80) },
						})
					).id;
				setConversation({ id, title: content.slice(0, 80), messages: [] });
				await productApi.request(`/conversations/${id}/messages`, {
					method: "POST",
					body: {
						content,
						context,
						request_id: `request_${Date.now()}_${Math.random().toString(36).slice(2)}`,
					},
				});
				setPrompt("");
				useCommentaryContext.getState().setContext(null);
				await open(id);
				await useSession.getState().refresh();
			} catch {
				setMode("articles");
				setError(t("featureAvailability.aiUnavailable"));
				void capabilitiesStore.refresh();
			}
		});
		sending.current = false;
	}
	const needsConnection = !capabilities.ai.available;

	function icon(label: string, Icon: typeof BookOpen, action: () => void) {
		return (
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={label}
				onPress={action}
				style={{
					width: 44,
					height: 44,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Icon size={20} color={colors.textSecondary} strokeWidth={1.7} />
			</Pressable>
		);
	}
	return (
		<SafeAreaView
			edges={["top"]}
			style={{
				flex: 1,
				backgroundColor: colors.background,
				// KeyboardAvoidingView controls its own bottom padding on iOS.
				paddingBottom: getNavigationDockContentPadding(insets.bottom),
			}}
		>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={{ flex: 1 }}
			>
				<View
					style={{
						paddingHorizontal: 16,
						flexDirection: rtl ? "row-reverse" : "row",
						alignItems: "center",
						justifyContent:
							conversation || mode === "articles"
								? "space-between"
								: "flex-end",
					}}
				>
					{capabilities.ai.available && (conversation || mode === "articles")
						? icon("Back to chat", ArrowLeft, () => {
								setConversation(null);
								setMode("chat");
								setArticle(null);
							})
						: null}
					<View style={{ flexDirection: "row", gap: 4 }}>
						{icon("Articles", BookOpen, () => {
							setMode("articles");
							setArticle(null);
						})}
						{capabilities.ai.available &&
							icon("Conversation history", History, () =>
								setShowHistory(!showHistory),
							)}
						{account && capabilities.ai.available
							? icon("New conversation", Plus, () => {
									setConversation(null);
									setConnect(false);
								})
							: null}
					</View>
				</View>
				<ScrollView
					ref={scroll}
					keyboardShouldPersistTaps="handled"
					onContentSizeChange={() => {
						if (conversation) scroll.current?.scrollToEnd({ animated: true });
					}}
					contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
				>
					{error ? (
						<Text
							accessibilityRole="alert"
							style={{
								color: colors.textSecondary,
								fontFamily: "Inter_400Regular",
							}}
						>
							{error}
						</Text>
					) : null}
					{capabilities.ai.available && showHistory ? (
						<>
							{history.length ? (
								history.map((item) => (
									<Action
										key={item.id}
										label={item.title || "Conversation"}
										onPress={() => void run(() => open(item.id))}
									/>
								))
							) : (
								<Copy>No conversations yet.</Copy>
							)}
						</>
					) : null}
					{mode === "articles" ? (
						<>
							<Text
								style={{
									fontFamily: "Manrope_600SemiBold",
									fontSize: 28,
									color: colors.textPrimary,
								}}
							>
								{t("featureAvailability.articles")}
							</Text>
							{!capabilities.ai.available && (
								<Copy>{t("featureAvailability.articleIntro")}</Copy>
							)}
							{article ? (
								<>
									<Copy>{article.title}</Copy>
									<Markdown
										onLinkPress={(url) => /^https?:\/\//i.test(url)}
										style={{
											body: {
												color: colors.textPrimary,
												fontFamily: "Inter_400Regular",
												fontSize: 14,
												lineHeight: 22,
												writingDirection:
													article.locale === "he" ? "rtl" : "ltr",
												textAlign: article.locale === "he" ? "right" : "left",
											},
											link: { color: accent },
											code_inline: {
												color: colors.textPrimary,
												backgroundColor: surface,
											},
											fence: {
												color: colors.textPrimary,
												backgroundColor: surface,
											},
											blockquote: {
												color: colors.textPrimary,
												backgroundColor: surface,
											},
											table: { borderColor: colors.border },
										}}
									>
										{article.body || ""}
									</Markdown>
									<Copy>{article.attribution}</Copy>
									<Action
										label={t("featureAvailability.back")}
										onPress={() => setArticle(null)}
									/>
									<Action
										label={t("featureAvailability.readSource")}
										onPress={() => void Linking.openURL(article.source_url)}
									/>
								</>
							) : (
								articles.map((item) => (
									<Pressable
										key={item.id}
										onPress={() =>
											void run(async () =>
												setArticle(
													await productApi.request<Article>(
														`/articles/${item.id}`,
														{ public: true, cache: true },
													),
												),
											)
										}
										style={{
											paddingVertical: 18,
											borderBottomWidth: 1,
											borderColor: colors.border,
										}}
									>
										<Copy>{item.title}</Copy>
										<Text style={{ fontSize: 12, color: colors.textSecondary }}>
											{item.attribution}
										</Text>
									</Pressable>
								))
							)}
							{!article && nextOffset !== null && (
								<Action
									label={t("featureAvailability.moreArticles")}
									disabled={busy}
									onPress={() => void run(() => loadArticles(nextOffset))}
								/>
							)}
							{articlesLoading && !articles.length && (
								<Copy>{t("common.loading")}</Copy>
							)}
							{!articlesLoading && !articles.length && !article ? (
								<Copy>{t("featureAvailability.noArticles")}</Copy>
							) : null}
						</>
					) : (
						<>
							{context ? (
								<Card>
									<Copy>
										{context.reference.book_id} {context.reference.chapter}:
										{context.reference.verse} · {context.edition_id}
									</Copy>
									{context.selected_text ? (
										<Copy>{context.selected_text}</Copy>
									) : null}
									<Action
										label="Clear context"
										onPress={() =>
											useCommentaryContext.getState().setContext(null)
										}
									/>
								</Card>
							) : null}
							{conversation?.messages.map((message) => (
								<View
									key={message.id}
									style={{
										alignSelf: message.role === "user" ? "flex-end" : "stretch",
										maxWidth: message.role === "user" ? "85%" : "100%",
										padding: 14,
										borderRadius: 16,
										gap: 8,
										backgroundColor:
											message.role === "user" ? colors.primary : surface,
									}}
								>
									<Text
										selectable
										style={{
											fontFamily: "Inter_400Regular",
											fontSize: 14,
											lineHeight: 21,
											color:
												message.role === "user"
													? "#FFFFFF"
													: colors.textPrimary,
											writingDirection: rtl ? "rtl" : "ltr",
										}}
									>
										{message.content}
									</Text>
									{message.citations?.map((source) => (
										<Pressable
											key={source.source_id}
											onPress={() => void Linking.openURL(source.source_url)}
										>
											<Text style={{ fontSize: 11, color: accent }}>
												{commentaryCitationLabel(source)}
											</Text>
										</Pressable>
									))}
								</View>
							))}
							{!conversation && !needsConnection && !connect ? (
								<>
									<Text
										style={{
											fontFamily: "Manrope_600SemiBold",
											fontSize: 28,
											lineHeight: 34,
											color: colors.textPrimary,
											textAlign: rtl ? "right" : "left",
										}}
									>
										What do you want to understand today?
									</Text>
									<View
										style={{
											alignSelf: rtl ? "flex-end" : "flex-start",
											flexDirection: "row",
											gap: 6,
											paddingVertical: 6,
											paddingHorizontal: 10,
											borderRadius: 999,
											backgroundColor: dark ? "#92B5E81A" : "#7AA0D61F",
										}}
									>
										<Sparkles size={14} color={accent} />
										<Text
											style={{
												fontFamily: "Inter_600SemiBold",
												fontSize: 12,
												color: accent,
											}}
										>
											{connectedProvider
												? t("featureAvailability.providerAi", {
														provider: connectedProvider.provider,
													})
												: t("featureAvailability.sharedAi")}
										</Text>
									</View>
									{starters.map(({ label, icon: Icon }) => (
										<Pressable
											key={label}
											accessibilityRole="button"
											accessibilityLabel={label}
											onPress={() => setPrompt(label)}
											style={{
												flexDirection: rtl ? "row-reverse" : "row",
												alignItems: "center",
												gap: 10,
												padding: 14,
												borderRadius: 12,
												borderWidth: 1,
												borderColor: colors.border,
												backgroundColor: surface,
											}}
										>
											<Icon size={18} color={accent} strokeWidth={1.7} />
											<Text
												style={{
													flex: 1,
													fontFamily: "Inter_500Medium",
													fontSize: 14,
													color: colors.textPrimary,
												}}
											>
												{label}
											</Text>
											<ArrowRight size={16} color={colors.textSecondary} />
										</Pressable>
									))}
								</>
							) : null}
							{conversation ? (
								<View style={{ gap: 8 }}>
									<Action
										label="Reset memory"
										onPress={() =>
											void run(async () => {
												await productApi.request(
													`/conversations/${conversation.id}/memory`,
													{ method: "DELETE" },
												);
											})
										}
									/>
									<Action
										label="Delete conversation"
										onPress={() =>
											void run(async () => {
												await productApi.request(
													`/conversations/${conversation.id}`,
													{ method: "DELETE" },
												);
												setConversation(null);
												setHistory(
													history.filter((h) => h.id !== conversation.id),
												);
											})
										}
									/>
								</View>
							) : null}
							{canConnect && account?.providers.length ? (
								<Action
									label={t("featureAvailability.manageProviders")}
									onPress={() => setConnect(!connect)}
								/>
							) : null}
						</>
					)}
					{canConnect && mode === "articles" && (
						<Action
							label={t("featureAvailability.connectProvider")}
							onPress={() => setConnect(!connect)}
						/>
					)}
					{canConnect && connect && (
						<ProviderConnections
							key={accountId || "guest"}
							providers={capabilities.ai.providers}
							connections={connections}
							onConnections={setConnections}
						/>
					)}
				</ScrollView>
				{mode === "chat" ? (
					<View
						style={{
							flexDirection: rtl ? "row-reverse" : "row",
							gap: 8,
							padding: 12,
							borderTopWidth: 1,
							borderColor: colors.border,
							alignItems: "center",
						}}
					>
						<TextInput
							accessibilityLabel="Ask Davar"
							placeholder={
								needsConnection ? "Connect to keep asking…" : "Ask Davar…"
							}
							placeholderTextColor={colors.textSecondary}
							value={prompt}
							onChangeText={setPrompt}
							multiline
							style={{
								flex: 1,
								maxHeight: 120,
								minHeight: 44,
								paddingHorizontal: 14,
								paddingVertical: 12,
								borderRadius: 24,
								backgroundColor: surface,
								color: colors.textPrimary,
								fontFamily: "Inter_400Regular",
								fontSize: 14,
								textAlign: rtl ? "right" : "left",
							}}
						/>
						<Pressable
							accessibilityRole="button"
							accessibilityLabel="Send consultation"
							disabled={busy || !prompt.trim() || needsConnection}
							onPress={() => void send()}
							style={{
								width: 44,
								height: 44,
								borderRadius: 22,
								backgroundColor: needsConnection ? surface : colors.primary,
								alignItems: "center",
								justifyContent: "center",
								opacity: busy ? 0.5 : 1,
							}}
						>
							{needsConnection ? (
								<Lock size={18} color={colors.textSecondary} />
							) : (
								<ArrowUp size={20} color="#FFFFFF" />
							)}
						</Pressable>
					</View>
				) : capabilities.ai.available ? (
					<View style={{ position: "absolute", right: 20, bottom: 12 }}>
						{icon(t("featureAvailability.returnAi"), ArrowLeft, () =>
							setMode("chat"),
						)}
					</View>
				) : null}
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
