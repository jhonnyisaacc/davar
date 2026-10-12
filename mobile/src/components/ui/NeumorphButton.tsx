import { useEffect, useMemo, useRef } from "react";
import {
  Animated,
  I18nManager,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import {
  getColors,
  getNeumorphHighlightStyle,
  getNeumorphShadowStyle,
  radii,
  spacing,
  typography,
} from "@/src/theme";
import { useAppStore, type AppState } from "@/src/store/useAppStore";

type NeumorphButtonVariant = "primary" | "secondary" | "text";
type NeumorphButtonSize = "sm" | "md" | "lg";

type NeumorphButtonProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  variant?: NeumorphButtonVariant;
  size?: NeumorphButtonSize;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const createStyles = (
  colors: ReturnType<typeof getColors>,
  variant: NeumorphButtonVariant,
) =>
  StyleSheet.create({
    pressable: {
      alignSelf: "flex-start",
    },
    shadowWrapper: {
      borderRadius: radii.xl,
    },
    lightShadowLayer: {
      ...StyleSheet.absoluteFill,
      borderRadius: radii.xl,
      backgroundColor: "transparent",
      ...getNeumorphHighlightStyle(colors),
    },
    container: {
      borderRadius: radii.xl,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 0,
      backgroundColor: variant === "text" ? "transparent" : colors.neomorphBg,
      overflow: "hidden",
    },
    raisedGlow: {
      ...StyleSheet.absoluteFill,
    },
    insetShadow: {
      ...StyleSheet.absoluteFill,
    },
    label: {
      fontFamily: typography.families.latinUI,
      fontSize: typography.sizes.body,
      fontWeight: typography.weights.medium,
      color:
        variant === "primary"
          ? colors.primaryDarker
          : variant === "secondary"
            ? colors.textPrimary
            : colors.textPrimary,
    },
    disabled: {
      opacity: 0.5,
    },
  });

export const NeumorphButton = ({
  label,
  onPress,
  disabled,
  variant = "primary",
  size = "md",
  style,
  textStyle,
}: NeumorphButtonProps) => {
  const themeMode = useAppStore((state: AppState) => state.themeMode);
  const colors = getColors(themeMode);
  const styles = useMemo(
    () => createStyles(colors, variant),
    [colors, variant],
  );
  // Animated scale keeps the press feedback subtle and meditative.
  const scale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0.65)).current;
  // Mirror gradient direction in RTL so the highlight feels balanced for Hebrew UI.
  const rtlStart = I18nManager.isRTL ? 1 : 0;
  const rtlEnd = I18nManager.isRTL ? 0 : 1;

  const sizeStyles = useMemo(() => {
    const base = {
      sm: {
        borderRadius: radii.lg,
        paddingVertical: spacing[2],
        paddingHorizontal: spacing[4],
        minHeight: 40,
      },
      md: {
        borderRadius: 20,
        paddingVertical: spacing[3],
        paddingHorizontal: spacing[6],
        minHeight: 44,
      },
      lg: {
        borderRadius: radii.xl,
        paddingVertical: spacing[4],
        paddingHorizontal: spacing[8],
        minHeight: 52,
      },
    } as const;

    return base[size];
  }, [size]);

  const handlePressIn = () => {
    // Small spring compression to emulate soft, tactile depth.
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 18,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    // Return to rest without bounce to avoid visual noise.
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 18,
      bounciness: 0,
    }).start();
  };

  useEffect(() => {
    // Slow, gentle twinkle for contemplative presence.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.9,
          duration: 9000,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0.65,
          duration: 9000,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [glowOpacity]);

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.pressable}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.shadowWrapper,
            sizeStyles,
            pressed
              ? getNeumorphShadowStyle("pressed", colors)
              : getNeumorphShadowStyle("raised", colors),
            { transform: [{ scale }] },
            style,
          ]}
        >
          {variant !== "text" && (
            <View
              pointerEvents="none"
              style={[styles.lightShadowLayer, sizeStyles]}
            />
          )}
          <View
            style={[
              styles.container,
              sizeStyles,
              pressed &&
                variant !== "text" && { backgroundColor: colors.neomorphBg },
              disabled && styles.disabled,
            ]}
          >
            {variant !== "text" && (
              <>
                {/* Top-left glow simulates the light bevel seen in the reference. */}
                <Animated.View
                  pointerEvents="none"
                  style={[styles.raisedGlow, { opacity: glowOpacity }]}
                >
                  <LinearGradient
                    pointerEvents="none"
                    colors={[colors.neomorphShadowLight, "transparent"]}
                    start={{ x: rtlStart, y: 0 }}
                    end={{ x: rtlEnd, y: 1 }}
                    style={styles.raisedGlow}
                  />
                </Animated.View>
                {/* Subtle copper sheen for a warm, sacred glow. */}
                <LinearGradient
                  pointerEvents="none"
                  colors={["transparent", colors.neomorphCopperGlow]}
                  start={{ x: rtlEnd, y: 0 }}
                  end={{ x: rtlStart, y: 1 }}
                  style={styles.raisedGlow}
                />
                {pressed && (
                  <>
                    {/* Pressed state: layered gradients mimic inset shadows without native modules. */}
                    <LinearGradient
                      pointerEvents="none"
                      colors={[colors.neomorphShadowDark, "transparent"]}
                      start={{ x: rtlStart, y: 0 }}
                      end={{ x: rtlEnd, y: 1 }}
                      style={styles.insetShadow}
                    />
                    <LinearGradient
                      pointerEvents="none"
                      colors={["transparent", colors.neomorphShadowLight]}
                      start={{ x: rtlEnd, y: 0 }}
                      end={{ x: rtlStart, y: 1 }}
                      style={styles.insetShadow}
                    />
                  </>
                )}
              </>
            )}
            <View pointerEvents="none">
              <Text style={[styles.label, textStyle]}>{label}</Text>
            </View>
          </View>
        </Animated.View>
      )}
    </Pressable>
  );
};
