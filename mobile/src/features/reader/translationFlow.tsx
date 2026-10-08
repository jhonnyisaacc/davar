import type { ReactNode } from "react";
import { Text } from "react-native";
import { typography } from "@/src/theme";
import type { TranslationFootnote } from "@/src/types/api";
import {
  sanitizeEmTags,
  buildMarkerRegex,
  createFootnoteLookup,
  DEFAULT_FOOTNOTE_MARKER_COLOR,
  collectMarkerMatches,
  resolveFootnoteForMarker,
  formatMarkerForDisplay,
} from "@/src/utils/footnoteUtils";

const renderTranslationSegment = (
  text: string,
  keyPrefix: string,
  markerRegex: RegExp | null,
  footnoteLookup: Map<string, TranslationFootnote>,
  onFootnotePress?: (footnote: TranslationFootnote) => void,
  isItalic = false,
  markerColor = DEFAULT_FOOTNOTE_MARKER_COLOR,
  renderUnmappedSuperscripts = false,
): ReactNode[] => {
  const sanitized = sanitizeEmTags(text);
  if (!sanitized) {
    return [];
  }

  const markerMatches = collectMarkerMatches(
    sanitized,
    markerRegex,
    renderUnmappedSuperscripts,
  );

  if (markerMatches.length === 0) {
    return isItalic
      ? [
          <Text key={`${keyPrefix}-italic`} style={{ fontStyle: "italic" }}>
            {sanitized}
          </Text>,
        ]
      : [sanitized];
  }
  const nodes: ReactNode[] = [];

  let lastIndex = 0;

  for (let i = 0; i < markerMatches.length; i += 1) {
    const markerMatch = markerMatches[i];
    const plainText = sanitized.slice(lastIndex, markerMatch.start);
    if (plainText) {
      if (isItalic) {
        nodes.push(
          <Text key={`${keyPrefix}-text-${i}`} style={{ fontStyle: "italic" }}>
            {plainText}
          </Text>,
        );
      } else {
        nodes.push(plainText);
      }
    }

    const marker = markerMatch.content;
    const footnote = resolveFootnoteForMarker(footnoteLookup, marker);
    const markerText = formatMarkerForDisplay(marker);

    nodes.push(
      <Text
        key={`${keyPrefix}-marker-${i}`}
        onPress={
          footnote && onFootnotePress
            ? () => onFootnotePress(footnote)
            : undefined
        }
        style={{
          color: markerColor,
          fontSize: typography.sizes.caption,
          lineHeight: typography.sizes.caption + 2,
          includeFontPadding: false,
          transform: [{ translateY: -5 }],
        }}
      >
        {markerText}
      </Text>,
    );

    lastIndex = markerMatch.end;
  }

  const trailingText = sanitized.slice(lastIndex);
  if (trailingText) {
    if (isItalic) {
      nodes.push(
        <Text key={`${keyPrefix}-text-tail`} style={{ fontStyle: "italic" }}>
          {trailingText}
        </Text>,
      );
    } else {
      nodes.push(trailingText);
    }
  }

  return nodes;
};

export const renderTranslationFlowText = (
  translation: string,
  footnotes?: TranslationFootnote[],
  onFootnotePress?: (footnote: TranslationFootnote) => void,
  markerColor = DEFAULT_FOOTNOTE_MARKER_COLOR,
  renderUnmappedSuperscripts = false,
): ReactNode[] => {
  const footnoteLookup = createFootnoteLookup(footnotes);
  const markerRegex = buildMarkerRegex(footnoteLookup);

  const segments: ReactNode[] = [];
  const emPattern = /<em>(.*?)<\/em>/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = emPattern.exec(translation)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    const plainText = translation.slice(lastIndex, start);
    if (plainText) {
      segments.push(
        ...renderTranslationSegment(
          plainText,
          `plain-${index}`,
          markerRegex,
          footnoteLookup,
          onFootnotePress,
          false,
          markerColor,
          renderUnmappedSuperscripts,
        ),
      );
    }

    segments.push(
      ...renderTranslationSegment(
        match[1],
        `em-${index}`,
        markerRegex,
        footnoteLookup,
        onFootnotePress,
        true,
        markerColor,
        renderUnmappedSuperscripts,
      ),
    );

    lastIndex = end;
    index += 1;
  }

  const trailingText = translation.slice(lastIndex);
  if (trailingText) {
    segments.push(
      ...renderTranslationSegment(
        trailingText,
        "trailing",
        markerRegex,
        footnoteLookup,
        onFootnotePress,
        false,
        markerColor,
        renderUnmappedSuperscripts,
      ),
    );
  }

  return segments;
};
