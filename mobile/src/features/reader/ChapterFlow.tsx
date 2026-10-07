import { useCallback } from "react";
import { Pressable, Text } from "react-native";
import { getColors, typography } from "@/src/theme";
import type { TranslationFootnote } from "@/src/types/api";
import type { DisplayVerse } from "@/src/services/scripture";
import type { AppLanguage } from "@/src/services/storage";
import type { BesorahLanguage } from "@davar/shared/greekBesorah";
import { stripCantillation, stripMeteg, stripNikud } from "@/src/utils/hebrew";
import { renderTranslationFlowText } from "@/src/features/reader/translationFlow";
import { createStyles } from "@/src/features/reader/verseDetailStyles";

type ChapterFlowProps = {
  flowItems: DisplayVerse[];
  translationOnly: boolean;
  language: AppLanguage;
  styles: ReturnType<typeof createStyles>;
  colors: ReturnType<typeof getColors>;
  hebrewFontScale: number;
  textScale: number;
  besorahLanguage: BesorahLanguage;
  showNikud: boolean;
  showCantillation: boolean;
  selectedWordVerseId: string | null;
  selectedWord: DisplayVerse["words"][number] | null;
  onTogglePills: () => void;
  onWordPress: (
    word: DisplayVerse["words"][number] | null,
    verseId: string,
  ) => void;
  onFootnotePress: (footnote: TranslationFootnote) => void;
  t: (key: string) => string;
};

export const ChapterFlow = ({
  flowItems,
  translationOnly,
  language,
  styles,
  colors,
  hebrewFontScale,
  textScale,
  besorahLanguage,
  showNikud,
  showCantillation,
  selectedWordVerseId,
  selectedWord,
  onTogglePills,
  onWordPress,
  onFootnotePress,
  t,
}: ChapterFlowProps) => {
  const normalizeFlowHebrew = useCallback(
    (text: string) => {
      let normalized = text;
      if (!showNikud) {
        normalized = stripNikud(normalized);
      }
      if (!showCantillation) {
        normalized = stripCantillation(normalized);
      }
      normalized = stripMeteg(normalized);
      return normalized.replace(/\//g, "");
    },
    [showCantillation, showNikud],
  );

  return (
    <Pressable onPress={onTogglePills}>
      {translationOnly ? (
        <Text style={styles.chapterTranslationFlowText}>
          {flowItems.map((item, index) => (
            <Text key={item.id}>
              <Text style={styles.chapterTranslationVerseNumber}>
                [{item.verse}]
              </Text>{" "}
              {renderTranslationFlowText(
                language === "es" && !(item.translation ?? "").trim()
                  ? t("verse.missingSpanishTranslation")
                  : (item.translation ?? ""),
                language === "es" ? item.translation_footnotes : undefined,
                language === "es" ? onFootnotePress : undefined,
                colors.accentCopper,
                language === "es",
              )}
              {index < flowItems.length - 1 ? "\u200E " : ""}
            </Text>
          ))}
        </Text>
      ) : (
        <Text
          style={[
            styles.chapterHebrewFlowText,
            {
              fontSize:
                typography.sizes.hebrewVerseMedium *
                hebrewFontScale *
                1.06 *
                textScale,
              lineHeight:
                typography.sizes.hebrewVerseMedium *
                hebrewFontScale *
                textScale *
                typography.lineHeights.hebrewScripture,
            },
            besorahLanguage === "greek"
              ? {
                  textAlign: "left",
                  writingDirection: "ltr",
                }
              : undefined,
          ]}
        >
          {flowItems.flatMap((item) =>
            item.available === false ? (
              <Text key={item.id}>{t("verse.greekUnavailable")} </Text>
            ) : item.words.length ? (
              item.words.map((word, wordIndex) => (
                <Text
                  key={`${item.id}-${word.position}-${wordIndex}`}
                  testID={`sefer-${item.id}-${word.position}`}
                  accessibilityRole="button"
                  accessibilityLabel={normalizeFlowHebrew(word.text)}
                  onPress={() => onWordPress(word, item.id)}
                  style={
                    selectedWordVerseId === item.id &&
                    selectedWord?.position === word.position
                      ? { backgroundColor: colors.primaryLight }
                      : undefined
                  }
                >
                  {normalizeFlowHebrew(word.text)}{" "}
                </Text>
              ))
            ) : (
              <Text key={item.id}>{normalizeFlowHebrew(item.hebrew)} </Text>
            ),
          )}
        </Text>
      )}
    </Pressable>
  );
};
