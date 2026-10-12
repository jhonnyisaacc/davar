import { Pressable, StyleSheet, View } from "react-native";

import { getColors, radii } from "@/src/theme";
import { useAppStore } from "@/src/store/useAppStore";

type PillToggleProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  onDisabledPress?: () => void;
};

export const PillToggle = ({
  label,
  value,
  onChange,
  disabled = false,
  onDisabledPress,
}: PillToggleProps) => {
  const colors = getColors(useAppStore((state) => state.themeMode));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      aria-checked={value}
      accessibilityState={{ checked: value, disabled }}
      hitSlop={7}
      onPress={() => {
        if (disabled) onDisabledPress?.();
        else onChange(!value);
      }}
      style={[
        styles.track,
        { backgroundColor: value ? colors.primary : colors.border },
        disabled && { opacity: 0.5 },
      ]}
    >
      <View
        style={[styles.knob, { alignSelf: value ? "flex-end" : "flex-start" }]}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  track: {
    width: 52,
    height: 30,
    borderRadius: radii.full,
    padding: 3,
  },
  knob: {
    width: 24,
    height: 24,
    borderRadius: radii.full,
    backgroundColor: "#FFFFFF",
  },
});
