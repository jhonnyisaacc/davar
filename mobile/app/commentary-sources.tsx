import { useEffect, useState } from "react";
import { Linking } from "react-native";
import type { Article } from "@davar/shared/productContracts";
import { COMMENTARY_SOURCE_URL } from "@davar/shared/settingsResources";
import { ResourcePage } from "@/src/components/ResourcePage";
import { Action, Busy, Card, Copy } from "@/src/features/product/ui";
import { productApi } from "@/src/features/account/session";
import { useTranslation } from "@/src/i18n/useTranslation";

export default function CommentarySourcesScreen() {
  const { t } = useTranslation();
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
    <ResourcePage title={t("settings.links.commentarySources")}>
      <Copy>{t("commentarySources.description")}</Copy>
      <Card>
        <Copy>Shaul</Copy>
        <Copy>{COMMENTARY_SOURCE_URL}</Copy>
        <Action
          label={t("commentarySources.openSource")}
          onPress={() => void Linking.openURL(COMMENTARY_SOURCE_URL)}
        />
      </Card>
      {loading ? (
        <Busy />
      ) : failed ? (
        <>
          <Copy>{t("commentarySources.unavailable")}</Copy>
          <Action
            label={t("common.retry")}
            onPress={() => {
              setLoading(true);
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          />
        </>
      ) : articles.length ? (
        articles.map((article) => (
          <Card key={article.id}>
            <Copy>{article.title}</Copy>
            <Copy>{article.attribution}</Copy>
            <Action
              label={t("commentarySources.openSource")}
              onPress={() => void Linking.openURL(article.source_url)}
            />
          </Card>
        ))
      ) : (
        <Copy>{t("commentarySources.empty")}</Copy>
      )}
    </ResourcePage>
  );
}
