import { useTranslation } from "@/src/i18n/useTranslation";
import { SandboxBanner } from "@/src/features/product/SandboxBanner";
import { Tabs } from "expo-router";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutRectangle,
} from "react-native";
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import {
  BookOpen,
  Calendar,
  ScrollText,
  Settings,
  Users,
} from "lucide-react-native";
import { useAppStore } from "@/src/store/useAppStore";
import { destinationOpen, type DestinationId } from "@davar/shared/destinations";
import { useProductCapabilities } from "@/src/features/product/useProductCapabilities";
import {
  NAVIGATION_DOCK_HEIGHT,
  getNavigationDockBottomInset,
} from "@/src/constants/navigationDock";

const destinations = [
  { id: "assemblies", labelKey: "tabs.assemblies", icon: Users },
  { id: "commentary", labelKey: "tabs.commentary", icon: ScrollText },
  { id: "verse", labelKey: "tabs.scripture", icon: BookOpen },
  { id: "widgets", labelKey: "calendar.nav", icon: Calendar },
  { id: "settings", labelKey: "tabs.settings", icon: Settings },
];
const hidden = ["home", "index", "search", "bookmarks", "explore"];

function NavigationDock({ state, navigation }: BottomTabBarProps) {
  const { capabilities } = useProductCapabilities();
  const visibleDestinations = destinations.filter(({ id }) =>
    destinationOpen(capabilities, id as DestinationId),
  );
  const { t } = useTranslation();
  const dark = useAppStore((s) => s.themeMode === "dark");
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const dockWidth = Math.min(374, width - 16);
  const [itemLayouts, setItemLayouts] = useState<
    Partial<Record<string, LayoutRectangle>>
  >({});
  const selectedId = state.routes[state.index].name;
  const selectedLayout = visibleDestinations.some(({ id }) => id === selectedId)
    ? itemLayouts[selectedId]
    : undefined;
  const indicatorPositioned = useRef(false);
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const indicatorOpacity = useSharedValue(0);

  useEffect(() => {
    if (!selectedLayout) {
      indicatorOpacity.set(0);
      return;
    }

    // Use measured positions so the highlight also follows RTL and size changes.
    indicatorWidth.set(selectedLayout.width);
    indicatorX.set(
      indicatorPositioned.current
        ? withSpring(selectedLayout.x, {
            stiffness: 320,
            damping: 30,
            mass: 0.8,
            reduceMotion: ReduceMotion.System,
          })
        : selectedLayout.x,
    );
    indicatorOpacity.set(1);
    indicatorPositioned.current = true;
  }, [selectedLayout, indicatorX, indicatorWidth, indicatorOpacity]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: indicatorWidth.get(),
    opacity: indicatorOpacity.get(),
    transform: [{ translateX: indicatorX.get() }],
  }));

  return (
    <View
      style={{
        position: "absolute",
        left: "50%",
        transform: [{ translateX: -dockWidth / 2 }],
        bottom: getNavigationDockBottomInset(insets.bottom),
        width: dockWidth,
        height: NAVIGATION_DOCK_HEIGHT,
        borderRadius: 32,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 14,
        elevation: 6,
      }}
    >
      <View
        style={{
          flex: 1,
          overflow: "hidden",
          borderRadius: 32,
          borderWidth: 1,
          borderColor: dark ? "#FFFFFF26" : "#FFFFFFCC",
        }}
      >
        <BlurView
          tint={dark ? "dark" : "light"}
          intensity={28}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            padding: 6,
            gap: 2,
            backgroundColor: dark ? "#3C3836B3" : "#FDF8F2B3",
          }}
        >
          <Animated.View
            pointerEvents="none"
            accessible={false}
            style={[
              {
                position: "absolute",
                // Match the physical left origin of the measured tab positions.
                start: 0,
                direction: "ltr",
                top: selectedLayout?.y ?? 0,
                height: 56,
                borderRadius: 20,
                backgroundColor: dark ? "#92B5E81A" : "#7AA0D61F",
              },
              indicatorStyle,
            ]}
          />
          {visibleDestinations.map(({ id, labelKey, icon: Icon }) => {
            const label = t(labelKey);
            const route = state.routes.find((route) => route.name === id)!;
            const selected = state.routes[state.index].key === route.key;
            const color = selected
              ? dark
                ? "#BCD8FF"
                : "#4C72A8"
              : dark
                ? "#A89A7F"
                : "#707070";
            return (
              <Pressable
                key={id}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected }}
                onLayout={({ nativeEvent: { layout } }) => {
                  setItemLayouts((previous) => {
                    const current = previous[id];
                    if (
                      current?.x === layout.x &&
                      current.y === layout.y &&
                      current.width === layout.width &&
                      current.height === layout.height
                    ) {
                      return previous;
                    }
                    return { ...previous, [id]: layout };
                  });
                }}
                style={{
                  flex: 1,
                  height: 56,
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                }}
                onPress={() => {
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!selected && !event.defaultPrevented)
                    navigation.navigate(route.name, route.params);
                }}
              >
                <Icon
                  size={selected ? 22 : 20}
                  color={color}
                  strokeWidth={1.7}
                />
                <Text
                  style={{
                    fontFamily: selected
                      ? "Inter_600SemiBold"
                      : "Inter_400Regular",
                    fontSize: 9,
                    color,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: process.env.EXPO_PUBLIC_DEV_SANDBOX === "1",
        header: () => <SandboxBanner />,
      }}
      tabBar={(props) => <NavigationDock {...props} />}
    >
      {destinations.map(({ id, labelKey }) => (
        <Tabs.Screen key={id} name={id} options={{ title: t(labelKey) }} />
      ))}
      {hidden.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}
