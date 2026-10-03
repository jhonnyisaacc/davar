import { ProductApiError } from "@davar/shared/productClient";
import type { Account } from "@davar/shared/productContracts";
import { KeyRound, LoaderCircle } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import {
	isCompleteAccessCode,
	normalizeAccessCode,
} from "../../../../shared/assemblyAccessCode";
import { type AppLanguage, useTranslation } from "../hooks/useTranslation";
import { productApi } from "../services/productApi";
import {
	clearPendingAssemblyCode,
	hasSeenAssembliesSplash,
	loadPendingAssemblyCode,
	markAssembliesSplashSeen,
	savePendingAssemblyCode,
} from "../utils/assembliesEntryStorage";
import { AccessCodeInput } from "./AccessCodeInput";
import "../../styles/assemblies.css";

type EntryStage = "splash" | "home" | "signIn";

export function AssembliesEntry({
	language,
	account,
	onAccount,
	sessionReady,
	sessionError,
	signIn,
	children,
}: {
	language: AppLanguage;
	account: Account | null;
	onAccount: (account: Account) => void;
	sessionReady: boolean;
	sessionError: string;
	signIn: ReactNode;
	children: ReactNode;
}) {
	const { t, isRTL } = useTranslation(language);
	const [code, setCode] = useState(() => loadPendingAssemblyCode() || "");
	const [stage, setStage] = useState<EntryStage>(() =>
		hasSeenAssembliesSplash()
			? loadPendingAssemblyCode()
				? "signIn"
				: "home"
			: "splash",
	);
	const [busy, setBusy] = useState(false);
	const [pasting, setPasting] = useState(false);
	const [errorKey, setErrorKey] = useState("");
	const redeeming = useRef(false);
	const readingClipboard = useRef(false);
	const codeId = useId();
	const errorId = useId();
	const hasIdentity = !!account?.providers.length;
	const hasAccess = hasIdentity && !!account?.admitted;
	const working = busy || pasting;

	useEffect(() => {
		if (stage !== "splash") return;
		const timer = window.setTimeout(() => {
			markAssembliesSplashSeen();
			setStage(code ? "signIn" : "home");
		}, 1600);
		return () => window.clearTimeout(timer);
	}, [stage, code]);

	const redeem = useCallback(
		async (invitationCode = code) => {
			if (redeeming.current) return;
			redeeming.current = true;
			setBusy(true);
			setErrorKey("");
			try {
				const admitted = await productApi.request<Account>(
					"/account/admission",
					{
						method: "POST",
						body: { code: normalizeAccessCode(invitationCode) },
					},
				);
				clearPendingAssemblyCode();
				onAccount(admitted);
				setCode("");
				setStage("home");
			} catch (cause) {
				clearPendingAssemblyCode();
				setErrorKey(
					cause instanceof ProductApiError && cause.code === "invalid_code"
						? "assemblies.invalidCode"
						: "assemblies.accessUnavailable",
				);
				setStage("home");
			} finally {
				redeeming.current = false;
				setBusy(false);
			}
		},
		[code, onAccount],
	);

	useEffect(() => {
		if (hasAccess) {
			clearPendingAssemblyCode();
			if (code) setCode("");
			if (stage === "signIn") setStage("home");
		} else if (
			stage === "signIn" &&
			sessionReady &&
			hasIdentity &&
			code &&
			loadPendingAssemblyCode() === code.trim()
		) {
			void redeem();
		}
	}, [stage, sessionReady, hasAccess, hasIdentity, code, redeem]);

	async function continueFromHome(value = code) {
		if (busy || !sessionReady) return;
		const invitationCode = normalizeAccessCode(value);
		if (!isCompleteAccessCode(invitationCode)) {
			setErrorKey("assemblies.invalidCode");
			return;
		}
		if (hasIdentity) {
			await redeem(invitationCode);
			return;
		}
		setErrorKey("");
		try {
			savePendingAssemblyCode(invitationCode);
			setStage("signIn");
		} catch {
			setErrorKey("assemblies.accessUnavailable");
		}
	}

	async function pasteFromClipboard() {
		if (working || readingClipboard.current || !sessionReady) return;
		readingClipboard.current = true;
		setPasting(true);
		setErrorKey("");
		try {
			const invitationCode = normalizeAccessCode(
				await navigator.clipboard.readText(),
			);
			if (!isCompleteAccessCode(invitationCode)) {
				setErrorKey("assemblies.invalidCode");
				return;
			}
			setCode(invitationCode);
			await continueFromHome(invitationCode);
		} catch {
			setErrorKey("assemblies.clipboardUnavailable");
		} finally {
			readingClipboard.current = false;
			setPasting(false);
		}
	}

	if (stage === "splash") {
		return (
			<div className="assemblies-splash" role="status" aria-live="polite">
				<span className="assemblies-mark" lang="he" dir="rtl">
					דבר
				</span>
				<span className="assemblies-splash-label">
					{t("assemblies.splashLabel")}
				</span>
			</div>
		);
	}

	if (hasAccess) return children;

	const error = errorKey ? t(errorKey) : sessionError;
	if (stage === "signIn") {
		return (
			<main className="assemblies-sign-in" dir={isRTL ? "rtl" : "ltr"}>
				<h1 className="assemblies-heading">{t("assemblies.welcome")}</h1>
				{hasIdentity ? <p role="status">{t("common.loading")}</p> : signIn}
				{busy || hasIdentity ? (
					<LoaderCircle
						className="assemblies-spinner"
						aria-label={t("common.loading")}
						role="status"
					/>
				) : null}
				{error ? (
					<p className="assemblies-error" role="alert">
						{error}
					</p>
				) : null}
				<button
					type="button"
					className="assemblies-back"
					disabled={busy}
					onClick={() => {
						clearPendingAssemblyCode();
						setStage("home");
					}}
				>
					{t("assemblies.back")}
				</button>
			</main>
		);
	}

	return (
		<main className="assemblies-entry" dir={isRTL ? "rtl" : "ltr"}>
			<form
				className="assemblies-entry-content"
				onSubmit={(event) => {
					event.preventDefault();
					void continueFromHome();
				}}
			>
				<div className="assemblies-key">
					<KeyRound size={32} strokeWidth={1.7} aria-hidden="true" />
				</div>
				<h1 className="assemblies-heading">{t("assemblies.welcome")}</h1>
				<p className="assemblies-copy">{t("assemblies.invitationCopy")}</p>
				<label className="assemblies-code-label" htmlFor={codeId}>
					{t("assemblies.accessCode")}
				</label>
				<AccessCodeInput
					id={codeId}
					label={t("assemblies.accessCode")}
					value={code}
					disabled={working || !sessionReady}
					errorId={error ? errorId : undefined}
					onChange={(value) => {
						setCode(value);
						setErrorKey("");
						if (isCompleteAccessCode(value)) void continueFromHome(value);
					}}
				/>
				{error ? (
					<p id={errorId} className="assemblies-error" role="alert">
						{error}
					</p>
				) : null}
				<button
					className="assemblies-continue"
					type="button"
					disabled={working || !sessionReady}
					aria-busy={working}
					onClick={() => void pasteFromClipboard()}
				>
					{working ? (
						<LoaderCircle
							className="assemblies-spinner"
							aria-label={t("common.loading")}
						/>
					) : (
						t("assemblies.paste")
					)}
				</button>
			</form>
		</main>
	);
}
