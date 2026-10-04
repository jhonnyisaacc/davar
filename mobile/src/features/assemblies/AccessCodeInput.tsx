import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useProductStyle } from "../product/ui";
import { ACCESS_CODE_LENGTH, normalizeAccessCode } from "./accessCode";

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
  const [focused, setFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selection, setSelection] = useState<{ start: number; end: number }>();
  // The slot row displays digits; the full-size input stays available to assistive technology.
  const displayValue = normalizeAccessCode(value).slice(0, ACCESS_CODE_LENGTH);
  const characters = Array.from(displayValue);
  const selectFirstSlot = () => {
    setSelection({ start: 0, end: Math.min(1, characters.length) });
    setActiveIndex(0);
  };

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
        accessibilityLabel={label}
        value={displayValue}
        onChangeText={(text) => {
          setSelection(undefined);
          onChange(normalizeAccessCode(text).slice(0, ACCESS_CODE_LENGTH));
        }}
        selection={selection}
        onSelectionChange={({ nativeEvent }) => {
          setActiveIndex(nativeEvent.selection.start);
        }}
        onFocus={() => {
          setFocused(true);
          selectFirstSlot();
        }}
        onPress={selectFirstSlot}
        onBlur={() => setFocused(false)}
        autoCapitalize="characters"
        autoCorrect={false}
        spellCheck={false}
        caretHidden
        selectionColor="transparent"
        keyboardType="number-pad"
        inputMode="numeric"
        showSoftInputOnFocus
        editable={editable}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        style={styles.input}
      />
      <View
        style={styles.row}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: ACCESS_CODE_LENGTH }, (_, index) => {
          const active =
            focused && index === Math.min(activeIndex, ACCESS_CODE_LENGTH - 1);
          return (
            <View
              key={index}
              accessible={false}
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
            </View>
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
    zIndex: 1,
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    color: "transparent",
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
