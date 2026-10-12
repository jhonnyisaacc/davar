import { useEffect, useState } from "react";
import type { Article } from "@davar/shared/productContracts";
import { COMMENTARY_SOURCE_URL } from "@davar/shared/settingsResources";
import { productApi } from "../services/productApi";
import { useTranslation, type AppLanguage } from "../hooks/useTranslation";
import { ResourcePage } from "./ResourcePage";
import { NeumorphCard } from "./NeumorphCard";

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
	const sourceLink = (url: string) => (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex min-h-11 items-center text-sm text-[var(--accent-deep)] underline underline-offset-4"
		>
			{t("commentarySources.openSource")}
		</a>
	);
	return (
		<ResourcePage
			title={t("settings.links.commentarySources")}
			language={language}
			onBack={onBack}
		>
			<p className="text-[var(--text-secondary)]">
				{t("commentarySources.description")}
			</p>
			<NeumorphCard className="p-5 space-y-3">
				<h2 className="text-xl">Shaul</h2>
				<p dir="ltr" className="text-sm text-[var(--text-secondary)]">
					{COMMENTARY_SOURCE_URL}
				</p>
				{sourceLink(COMMENTARY_SOURCE_URL)}
			</NeumorphCard>
			{loading ? (
				<p role="status">{t("common.loading")}</p>
			) : failed ? (
				<div role="status">
					<p>{t("commentarySources.unavailable")}</p>
					<button
						type="button"
						className="min-h-11 underline"
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
					<NeumorphCard key={article.id} className="p-5 space-y-3">
						<h2>{article.title}</h2>
						<p className="text-sm text-[var(--text-secondary)]">
							{article.attribution}
						</p>
						{sourceLink(article.source_url)}
					</NeumorphCard>
				))
			) : (
				<p>{t("commentarySources.empty")}</p>
			)}
		</ResourcePage>
	);
}
