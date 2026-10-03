import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useProductStyle } from "../product/ui";

const CODE_LENGTH = 7;
const SLOT_GAP = 4;

export function AccessCodeInput({
  label,
  value,
  onChange,
  editable = true,
  onSubmit,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  editable?: boolean;
  onSubmit: () => void;
}) {
  const { colors } = useProductStyle();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number }>();
  // The API ignores hyphens and letter case. Keep those separators out of the slots.
  const displayValue = value
    .replaceAll("-", "")
    .toUpperCase()
    .slice(0, CODE_LENGTH);
  const characters = Array.from(displayValue);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: colors.shadowDark,
          opacity: editable ? 1 : 0.6,
        },
      ]}
    >
      {/* One native input preserves paste, backspace, and screen reader editing. */}
      <TextInput
        ref={input}
        accessibilityLabel={label}
        value={displayValue}
        onChangeText={(text) => {
          setSelection(undefined);
          onChange(
            text.replaceAll("-", "").toUpperCase().slice(0, CODE_LENGTH),
          );
        }}
        selection={selection}
        onSelectionChange={({ nativeEvent }) => {
          setActiveIndex(nativeEvent.selection.start);
          setSelection(undefined);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
        editable={editable}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        style={styles.input}
      />
      <View style={styles.row}>
        {Array.from({ length: CODE_LENGTH }, (_, index) => {
          const active =
            focused && index === Math.min(activeIndex, CODE_LENGTH - 1);
          return (
            <Pressable
              key={index}
              accessible={false}
              focusable={false}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              disabled={!editable}
              onPress={() => {
                const start = Math.min(index, characters.length);
                setSelection({
                  start,
                  end: Math.min(start + 1, characters.length),
                });
                setActiveIndex(start);
                input.current?.focus();
              }}
              style={[
                styles.slot,
                {
                  backgroundColor: colors.background,
                  borderColor: active
                    ? colors.primary
                    : `${colors.textPrimary}33`,
                  borderWidth: active ? 2 : 1,
                },
              ]}
            >
              <Text style={[styles.character, { color: colors.textPrimary }]}>
                {characters[index] || ""}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    borderWidth: 1,
    borderRadius: 20,
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 1,
  },
  input: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
  row: { flexDirection: "row", direction: "ltr", gap: SLOT_GAP },
  slot: {
    flex: 1,
    minWidth: 0,
    height: 84,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  character: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 28,
    textAlign: "center",
    writingDirection: "ltr",
  },
});
