import { useEffect, useRef, useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
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
	Users,
} from "lucide-react-native";
import type {
	Article,
	Conversation,
	ProviderConnection,
} from "@davar/shared/productContracts";
import { productApi, useSession } from "../account/session";
import { SignIn } from "../account/SignIn";
import { useCommentaryContext } from "./context";
import { Action, Card, Copy, Field, useProductStyle } from "../product/ui";
const starters = [
	{ label: "What is the Son of Man?", icon: ScrollText },
	{ label: "What is the Son of God?", icon: Crown },
	{ label: "What is the Father?", icon: Users },
	{ label: "What is the meaning of faith?", icon: Sparkles },
];
export default function CommentaryScreen() {
	const account = useSession((s) => s.account);
	const accountId = account?.id;
	const context = useCommentaryContext((s) => s.context);
	const { colors, rtl } = useProductStyle();
	const dark = colors.background === "#3C3836";
	const surface = dark ? "#44403E" : "#F4EEE7";
	const accent = dark ? "#BCD8FF" : "#4C72A8";
	const [mode, setMode] = useState<"chat" | "articles">("chat");
	const [articles, setArticles] = useState<Article[]>([]);
	const [article, setArticle] = useState<Article | null>(null);
	const [conversation, setConversation] = useState<Conversation | null>(null);
	const [history, setHistory] = useState<{ id: string; title: string }[]>([]);
	const [showHistory, setShowHistory] = useState(false);
	const [prompt, setPrompt] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [connections, setConnections] = useState<ProviderConnection[]>([]);
	const [provider, setProvider] = useState("chatgpt");
	const [credential, setCredential] = useState("");
	const [model, setModel] = useState("");
	const [connect, setConnect] = useState(false);
	const sending = useRef(false);
	const scroll = useRef<ScrollView>(null);
	useEffect(() => {
		setConversation(null);
		setPrompt("");
		setCredential("");
		setHistory([]);
		setConnections([]);
		if (!accountId) return;
		productApi
			.request<{ conversations: typeof history }>("/conversations", {
				cache: true,
			})
			.then((r) => setHistory(r.conversations))
			.catch((e) => setError(e.message));
		productApi
			.request<{ connections: ProviderConnection[] }>("/provider_connections")
			.then((r) => setConnections(r.connections))
			.catch((e) => setError(e.message));
	}, [accountId]);
	useEffect(() => {
		if (mode === "articles")
			productApi
				.request<{ articles: Article[] }>("/articles", {
					public: true,
					cache: true,
				})
				.then((r) => setArticles(r.articles))
				.catch((e) => setError(e.message));
	}, [mode]);
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
			try {
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
			} finally {
				await open(id);
				await useSession.getState().refresh();
			}
		});
		sending.current = false;
	}
	const needsConnection =
		!!account && account.consultations_remaining === 0 && !connections.length;
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
			style={{ flex: 1, backgroundColor: colors.background }}
		>
			<KeyboardAvoidingView
				behavior={Platform.OS === "ios" ? "padding" : undefined}
				style={{ flex: 1, paddingBottom: 100 }}
			>
				<View
					style={{
						paddingHorizontal: 16,
						flexDirection: rtl ? "row-reverse" : "row",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					{conversation || mode === "articles" ? (
						icon("Back to chat", ArrowLeft, () => {
							setConversation(null);
							setMode("chat");
							setArticle(null);
						})
					) : (
						<Text
							style={{
								fontFamily: "Inter_600SemiBold",
								fontSize: 13,
								color: colors.textSecondary,
							}}
						>
							Davar · Chat
						</Text>
					)}
					<View style={{ flexDirection: "row", gap: 4 }}>
						{icon("Articles", BookOpen, () => {
							setMode("articles");
							setArticle(null);
						})}
						{icon("Conversation history", History, () =>
							setShowHistory(!showHistory),
						)}
						{account
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
					{showHistory ? (
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
								Articles
							</Text>
							{article ? (
								<>
									<Copy>{article.title}</Copy>
									<Copy>{article.body}</Copy>
									<Copy>{article.attribution}</Copy>
									<Action
										label="Read source"
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
							{!articles.length && !article ? (
								<Copy>No published articles available yet.</Copy>
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
												{source.attribution} · Source
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
											{connections.length
												? "Your connected AI"
												: "1 free consult · no login needed"}
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
							{needsConnection || connect ? (
								<>
									<View
										style={{ alignItems: "center", gap: 12, paddingTop: 20 }}
									>
										<View
											style={{
												width: 56,
												height: 56,
												borderRadius: 28,
												backgroundColor: dark ? "#92B5E81A" : "#7AA0D61F",
												alignItems: "center",
												justifyContent: "center",
											}}
										>
											<Lock size={24} color={accent} />
										</View>
										<Text
											style={{
												fontFamily: "Manrope_600SemiBold",
												fontSize: 22,
												color: colors.textPrimary,
												textAlign: "center",
											}}
										>
											To continue, connect your AI
										</Text>
										<Copy>
											Your connected AI powers the response. Only authorized
											sources are used for grounding.
										</Copy>
									</View>
									{!account?.providers.length ? (
										<SignIn link={!!account} />
									) : (
										<>
											{[
												["claude", "Claude"],
												["chatgpt", "ChatGPT"],
												["grok", "Grok"],
												["gemini", "Gemini"],
											].map(([id, label]) => (
												<Action
													key={id}
													label={(provider === id ? "✓ " : "") + label}
													onPress={() => setProvider(id)}
												/>
											))}
											<Copy>
												Muse is unavailable until its supported integration is
												established. These connections use provider API keys;
												consumer subscriptions may not include API access.
											</Copy>
											<Field
												label="API key"
												value={credential}
												onChange={setCredential}
												secret
											/>
											<Field
												label="Model ID"
												value={model}
												onChange={setModel}
											/>
											<Action
												label="Connect"
												disabled={busy || !credential || !model}
												onPress={() =>
													void run(async () => {
														await productApi.request("/provider_connections", {
															method: "POST",
															body: { provider, credential, model },
														});
														setCredential("");
														setConnect(false);
														setConnections(
															(
																await productApi.request<{
																	connections: ProviderConnection[];
																}>("/provider_connections")
															).connections,
														);
													})
												}
											/>
										</>
									)}
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
							{account?.providers.length && !needsConnection ? (
								<Action
									label="Manage AI connection"
									onPress={() => setConnect(!connect)}
								/>
							) : null}
							{connect
								? connections.map((connection) => (
										<Action
											key={connection.id}
											label={"Disconnect " + connection.provider}
											onPress={() =>
												void run(async () => {
													await productApi.request(
														`/provider_connections/${connection.id}`,
														{ method: "DELETE" },
													);
													setConnections(
														connections.filter(
															(item) => item.id !== connection.id,
														),
													);
												})
											}
										/>
									))
								: null}
						</>
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
							accessibilityLabel="Ask about Shaul"
							placeholder={
								needsConnection ? "Connect to keep asking…" : "Ask about Shaul…"
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
				) : (
					<View style={{ position: "absolute", right: 20, bottom: 110 }}>
						{icon("Return to AI chat", ArrowLeft, () => setMode("chat"))}
					</View>
				)}
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}
