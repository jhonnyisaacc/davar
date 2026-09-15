import { Linking, StyleSheet, Text, View } from "react-native";

import { useTranslation } from "@/src/i18n/useTranslation";
import { typography } from "@/src/theme";

const ATTRIBUTION_URL = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;

type GreekAttributionProps = {
  mutedColor: string;
  titleColor: string;
};

function attributionHref(value: string) {
  const trimmed = value.replace(/[),.;]+$/u, "");
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

function openAttributionUrl(value: string) {
  void Linking.openURL(attributionHref(value));
}

function AttributionNotice({
  text,
  color,
}: {
  text: string;
  color: string;
}) {
  const parts = text.split(ATTRIBUTION_URL);
  return (
    <Text style={[styles.notice, { color }]}>
      {parts.map((part) => {
        const isUrl = part.startsWith("http") || part.startsWith("www.");
        if (!isUrl) {
          return part;
        }
        const visible = part.replace(/[),.;]+$/u, "");
        const trailing = part.slice(visible.length);
        return (
          <Text key={visible}>
            <Text onPress={() => openAttributionUrl(visible)} style={styles.link}>
              {visible}
            </Text>
            {trailing}
          </Text>
        );
      })}
    </Text>
  );
}

export function GreekAttribution({
  mutedColor,
  titleColor,
}: GreekAttributionProps) {
  const { t } = useTranslation();
  const notices = [
    t("home.attribution.stepbible"),
    t("home.attribution.sblgnt"),
    t("home.attribution.ubs"),
  ];

  return (
    <View>
      <Text style={[styles.title, { color: titleColor }]}>
        {t("home.attributionTitle")}
      </Text>
      {notices.map((notice) => (
        <AttributionNotice key={notice.slice(0, 48)} text={notice} color={mutedColor} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: typography.families.latinUIBold,
    fontSize: typography.sizes.bodySmall,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  notice: {
    fontFamily: typography.families.latinUIMedium,
    fontSize: 11,
    lineHeight: 18,
    marginBottom: 10,
  },
  link: {
    textDecorationLine: "underline",
  },
});
