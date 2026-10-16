import type { Article } from "@davar/shared/productContracts";
import { COMMENTARY_SOURCE_URL } from "@davar/shared/settingsResources";
import { FileText, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { type AppLanguage, useTranslation } from "../hooks/useTranslation";
import { productApi } from "../services/productApi";
import { ResourceLinkRow, ResourcePage } from "./ResourcePage";

const sourceHost = COMMENTARY_SOURCE_URL.replace(/^https?:\/\//, "").replace(
	/\/$/,
	"",
);

export function CommentarySourcesScreen({
	language,
	onBack,
}: {
	language: AppLanguage;
	onBack: () => void;
}) {
	const { t } = useTranslation(language);
	const [articles, setArticles] = useState<Article[]>([]);
	const [loading, setLoading] = useState(true);
	const [failed, setFailed] = useState(false);
	const [attempt, setAttempt] = useState(0);
	useEffect(() => {
		let active = true;
		productApi
			.request<{ articles: Article[] }>("/articles", {
				public: true,
				cache: attempt === 0,
			})
			.then((result) => {
				if (active) setArticles(result.articles);
			})
			.catch(() => {
				if (active) setFailed(true);
			})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, [attempt]);
	return (
		<ResourcePage
			flat
			title={t("settings.links.commentarySources")}
			lede={t("commentarySources.description")}
			language={language}
			onBack={onBack}
		>
			<section>
				<p className="pb-2.5 text-[11px] font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
					{t("commentarySources.sourceLabel")}
				</p>
				<div className="border-t border-[var(--border)]">
					<ResourceLinkRow
						href={COMMENTARY_SOURCE_URL}
						icon={Globe}
						label={sourceHost}
						value="Shaul"
						action={t("commentarySources.open")}
					/>
				</div>
			</section>
			<section className="pt-10">
				<p className="pb-2.5 text-[11px] font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
					{t("commentarySources.publishedLabel")}
				</p>
				<div className="border-t border-[var(--border)]">
					{loading ? (
						<p
							role="status"
							className="py-[18px] text-sm text-[var(--text-secondary)]"
						>
							{t("common.loading")}
						</p>
					) : failed ? (
						<div
							role="status"
							className="flex flex-col items-start gap-2 py-[18px]"
						>
							<p>{t("commentarySources.unavailable")}</p>
							<button
								type="button"
								className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--accent-deep)]"
								onClick={() => {
									setLoading(true);
									setFailed(false);
									setAttempt((value) => value + 1);
								}}
							>
								{t("common.retry")}
							</button>
						</div>
					) : articles.length ? (
						articles.map((article) => (
							<ResourceLinkRow
								key={article.id}
								href={article.source_url}
								icon={FileText}
								label={article.attribution}
								value={article.title}
								action={t("commentarySources.read")}
							/>
						))
					) : (
						<p className="py-[18px] text-sm text-[var(--text-secondary)]">
							{t("commentarySources.empty")}
						</p>
					)}
				</div>
			</section>
		</ResourcePage>
	);
}
