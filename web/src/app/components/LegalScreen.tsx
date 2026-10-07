import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "../hooks/useTranslation";
import legalContent, { type LegalKind } from "../legal/legalContent";

interface LegalScreenProps {
	kind: LegalKind;
	language: "en" | "es" | "he";
	onBack: () => void;
}

export function LegalScreen({ kind, language, onBack }: LegalScreenProps) {
	const { t } = useTranslation(language);
	const doc = useMemo(
		() => legalContent.getLegalDoc(kind, language),
		[kind, language],
	);

	return (
		<div className="legal-page">
			<div className="legal-hero">
				<div className="legal-hero-inner">
					<button className="legal-back" onClick={onBack} type="button">
						{t("settings.title")}
					</button>
					<h1 className="legal-title">{doc.title}</h1>
					{doc.lastUpdated && (
						<div className="legal-meta">
							<span className="legal-meta-label">{t("legal.lastUpdated")}</span>
							<span className="legal-meta-value">{doc.lastUpdated}</span>
						</div>
					)}
				</div>
			</div>

			<div className="legal-content">
				<div className="legal-divider" />
				<div className="legal-prose">
					<ReactMarkdown
						remarkPlugins={[remarkGfm]}
						components={{
							a: ({ href, children, ...props }) => (
								<a {...props} href={href} target="_blank" rel="noreferrer">
									{children}
								</a>
							),
						}}
					>
						{doc.body}
					</ReactMarkdown>
				</div>
			</div>
		</div>
	);
}
