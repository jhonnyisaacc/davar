import * as Haptics from "expo-haptics";
import { Pressable } from "react-native";
import type { BottomTabBarButtonProps } from "expo-router/js-tabs";

type HapticTabProps = BottomTabBarButtonProps;

export function HapticTab(props: HapticTabProps) {
  const { ref: _ref, ...pressableProps } = props;

  return (
    <Pressable
      {...pressableProps}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === "ios") {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
