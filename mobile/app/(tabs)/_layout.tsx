import { Tabs } from "expo-router";
import {
	Pressable,
	StyleSheet,
	Text,
	View,
	useWindowDimensions,
} from "react-native";
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

const destinations = [
	{ id: "assemblies", label: "Assemblies", icon: Users },
	{ id: "commentary", label: "Commentary", icon: ScrollText },
	{ id: "verse", label: "Scripture", icon: BookOpen },
	{ id: "widgets", label: "Widgets", icon: Calendar },
	{ id: "settings", label: "Settings", icon: Settings },
];
const hidden = ["home", "index", "search", "bookmarks", "explore"];
export default function TabLayout() {
	const dark = useAppStore((s) => s.themeMode === "dark");
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const dockWidth = Math.min(374, width - 16);
	return (
		<Tabs
			initialRouteName="index"
			screenOptions={{ headerShown: false }}
			tabBar={({ state, navigation }) => (
				<View
					style={{
						position: "absolute",
						left: "50%",
						transform: [{ translateX: -dockWidth / 2 }],
						bottom: Math.max(insets.bottom, 8),
						width: dockWidth,
						height: 72,
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
							{destinations.map(({ id, label, icon: Icon }) => {
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
										style={{
											flex: 1,
											height: 56,
											borderRadius: 20,
											alignItems: "center",
											justifyContent: "center",
											gap: 3,
											backgroundColor: selected
												? dark
													? "#92B5E81A"
													: "#7AA0D61F"
												: "transparent",
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
			)}
		>
			{destinations.map(({ id, label }) => (
				<Tabs.Screen key={id} name={id} options={{ title: label }} />
			))}
			{hidden.map((name) => (
				<Tabs.Screen key={name} name={name} options={{ href: null }} />
			))}
		</Tabs>
	);
}
