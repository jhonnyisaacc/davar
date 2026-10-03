import { useMemo } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { AppIcon } from "@/src/components/ui/AppIcon";
import {
  getColors,
  getNeumorphHighlightStyle,
  getNeumorphShadowStyle,
  radii,
} from "@/src/theme";
import { useAppStore, type AppState } from "@/src/store/useAppStore";
import type { IconKey } from "@/src/constants/icons";

type NeumorphIconButtonProps = {
  icon: IconKey;
  onPress?: () => void;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
};

const createStyles = (colors: ReturnType<typeof getColors>, active: boolean) =>
  StyleSheet.create({
    container: {
      width: 44,
      height: 44,
      borderRadius: radii.full,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.neomorphBg,
      borderWidth: 0,
    },
    highlight: {
      ...StyleSheet.absoluteFill,
      borderRadius: radii.full,
      ...getNeumorphHighlightStyle(colors),
    },
    icon: {
      color: active ? colors.accentCopper : colors.textSecondary,
    },
  });

export const NeumorphIconButton = ({
  icon,
  onPress,
  active = false,
  style,
}: NeumorphIconButtonProps) => {
  const themeMode = useAppStore((state: AppState) => state.themeMode);
  const colors = getColors(themeMode);
  const styles = useMemo(() => createStyles(colors, active), [colors, active]);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        pressed
          ? getNeumorphShadowStyle("pressed", colors)
          : getNeumorphShadowStyle("raised", colors),
        style,
      ]}
    >
      <View pointerEvents="none" style={styles.highlight} />
      <LinearGradient
        pointerEvents="none"
        colors={["transparent", colors.neomorphCopperGlow]}
        start={{ x: 1, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.highlight}
      />
      <View pointerEvents="none">
        <AppIcon name={icon} size={20} color={styles.icon.color} />
      </View>
    </Pressable>
  );
};
