import type { ReactNode } from "react";
import {
	ScrollView,
	Text,
	TextInput,
	Pressable,
	View,
	ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getColors } from "@/src/theme";
import { useAppStore } from "@/src/store/useAppStore";
export function useProductStyle() {
	const mode = useAppStore((s) => s.themeMode);
	const language = useAppStore((s) => s.language);
	const base = getColors(mode);
	const colors = {
		...base,
		background: mode === "dark" ? "#3C3836" : "#FAF6F0",
		surface: mode === "dark" ? "#3C3836" : "#FDF8F2",
		textPrimary: mode === "dark" ? "#FAF4E6" : "#000000",
		textSecondary: mode === "dark" ? "#A89A7F" : "#707070",
		primary: mode === "dark" ? "#92B5E8" : "#7AA0D6",
		border: mode === "dark" ? "#FFFFFF1A" : "#0000000A",
	};
	return { colors, rtl: language === "he", language };
}
export function Page({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	const { colors, rtl } = useProductStyle();
	return (
		<SafeAreaView
			edges={["top"]}
			style={{ flex: 1, backgroundColor: colors.background }}
		>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ padding: 24, paddingBottom: 120, gap: 16 }}
			>
				{title ? (
					<Text
						accessibilityRole="header"
						style={{
							fontSize: title === "Assemblies" ? 34 : 28,
							fontFamily: "Manrope_600SemiBold",
							fontWeight: "600",
							color: colors.textPrimary,
							textAlign:
								title === "Assemblies" ? "center" : rtl ? "right" : "left",
						}}
					>
						{title}
					</Text>
				) : null}
				{children}
			</ScrollView>
		</SafeAreaView>
	);
}
export function Copy({ children }: { children: ReactNode }) {
	const { colors, rtl } = useProductStyle();
	return (
		<Text
			selectable
			style={{
				fontFamily: "Inter_400Regular",
				fontSize: 14,
				lineHeight: 21,
				color: colors.textPrimary,
				textAlign: rtl ? "right" : "left",
				writingDirection: rtl ? "rtl" : "ltr",
			}}
		>
			{children}
		</Text>
	);
}
export function Card({ children }: { children: ReactNode }) {
	const { colors } = useProductStyle();
	return (
		<View
			style={{
				gap: 12,
				padding: 20,
				backgroundColor: colors.surface,
				borderRadius: 20,
				borderWidth: 1,
				borderColor: colors.border,
				shadowColor: colors.shadowDark,
				shadowOffset: { width: 3, height: 3 },
				shadowOpacity: 0.2,
				shadowRadius: 8,
				elevation: 2,
			}}
		>
			{children}
		</View>
	);
}
export function Action({
	label,
	onPress,
	disabled = false,
}: {
	label: string;
	onPress: () => void;
	disabled?: boolean;
}) {
	const { colors } = useProductStyle();
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={label}
			disabled={disabled}
			onPress={onPress}
			style={({ pressed }) => ({
				padding: 14,
				borderRadius: 24,
				borderWidth: 1,
				borderColor: colors.primary,
				backgroundColor: pressed ? colors.primary : colors.surface,
				opacity: disabled ? 0.45 : 1,
			})}
		>
			<Text
				style={{
					color: colors.textPrimary,
					textAlign: "center",
					fontWeight: "600",
				}}
			>
				{label}
			</Text>
		</Pressable>
	);
}
export function Field({
	label,
	value,
	onChange,
	secret = false,
	multiline = false,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	secret?: boolean;
	multiline?: boolean;
}) {
	const { colors, rtl } = useProductStyle();
	return (
		<View style={{ gap: 6 }}>
			<Copy>{label}</Copy>
			<TextInput
				accessibilityLabel={label}
				value={value}
				onChangeText={onChange}
				secureTextEntry={secret}
				multiline={multiline}
				autoCapitalize="none"
				style={{
					borderWidth: 1,
					borderColor: colors.border,
					borderRadius: 12,
					padding: 14,
					color: colors.textPrimary,
					textAlign: rtl ? "right" : "left",
					minHeight: multiline ? 90 : 48,
				}}
			/>
		</View>
	);
}
export function Busy() {
	return <ActivityIndicator accessibilityLabel="Loading" />;
}
