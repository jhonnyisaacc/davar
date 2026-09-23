import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { destinationById } from "@davar/shared/destinations";

import { getColors, spacing, typography } from "../src/theme";
import { useAppStore, type AppState } from "../src/store/useAppStore";

const createStyles = (
  colors: ReturnType<typeof getColors>,
  themeMode: AppState["themeMode"],
) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
    },
    gradient: {
      flex: 1,
    },
    container: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing[6],
    },
    logo: {
      width: 180,
      height: 180,
      tintColor: themeMode === "dark" ? colors.textPrimary : undefined,
    },
    subtitle: {
      fontFamily: typography.families.latinUI,
      fontSize: typography.sizes.bodySmall,
      color: colors.textSecondary,
      marginTop: spacing[3],
    },
  });

export default function SplashScreen() {
  const themeMode = useAppStore((state: AppState) => state.themeMode);
  const colors = getColors(themeMode);
  const styles = useMemo(
    () => createStyles(colors, themeMode),
    [colors, themeMode],
  );
  const opacity = useSharedValue(0);
  const scale = useSharedValue(1);

  const gradientColors = useMemo<[string, string, string]>(() => {
    if (themeMode === "dark") {
      return ["#0F0E12", "#17161A", "#1B2536"];
    }
    return ["#FDFDF9", "#F8F7F3", "#A8C8F0"];
  }, [themeMode]);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 500 });
    scale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1250 }),
        withTiming(1, { duration: 1250 }),
      ),
      -1,
      true,
    );

    const fadeOutTimeout = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 500 });
    }, 2500);

    const navigateTimeout = setTimeout(() => {
      router.replace(`/(tabs)/${destinationById("verse").id as "verse"}`);
    }, 3000);

    return () => {
      clearTimeout(fadeOutTimeout);
      clearTimeout(navigateTimeout);
      cancelAnimation(opacity);
      cancelAnimation(scale);
    };
  }, [opacity, scale]);

  const fadeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const breatheStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <LinearGradient colors={gradientColors} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.container}>
          <Animated.Image
            source={require("../assets/images/davar_nobackground.png")}
            resizeMode="contain"
            accessibilityRole="image"
            accessibilityLabel="Davar logo"
            style={[styles.logo, fadeStyle, breatheStyle]}
          />
          <Animated.Text style={[styles.subtitle, fadeStyle]}>
            Quiet the mind. Hear the word.
          </Animated.Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}
