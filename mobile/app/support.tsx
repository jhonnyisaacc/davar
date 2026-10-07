import { Linking } from "react-native";
import {
  CREATOR_TELEGRAM_HANDLE,
  CREATOR_TELEGRAM_URL,
  SUPPORT_EMAIL,
} from "@davar/shared/settingsResources";
import { ResourcePage } from "@/src/components/ResourcePage";
import { Action, Card, Copy } from "@/src/features/product/ui";
import { useTranslation } from "@/src/i18n/useTranslation";

export default function SupportScreen() {
  const { t } = useTranslation();
  return (
    <ResourcePage title={t("settings.links.support")}>
      <Copy>{t("support.description")}</Copy>
      <Card>
        <Copy>{t("support.emailLabel")}</Copy>
        <Copy>{SUPPORT_EMAIL}</Copy>
        <Action
          label={t("support.emailAction")}
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        />
      </Card>
      <Card>
        <Copy>{t("support.creator")}</Copy>
        <Copy>{CREATOR_TELEGRAM_HANDLE}</Copy>
        <Action
          label={t("support.telegramAction")}
          onPress={() => void Linking.openURL(CREATOR_TELEGRAM_URL)}
        />
      </Card>
    </ResourcePage>
  );
}
