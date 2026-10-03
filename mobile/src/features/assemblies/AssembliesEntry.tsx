import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useIsFocused } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { KeyRound } from "lucide-react-native";
import { ProductApiError } from "@davar/shared/productClient";
import { getNavigationDockContentPadding } from "@/src/constants/navigationDock";
import { useTranslation } from "@/src/i18n/useTranslation";
import { productApi, useSession } from "../account/session";
import { SignIn } from "../account/SignIn";
import { Action, Page, useProductStyle } from "../product/ui";
import { AccessCodeInput } from "./AccessCodeInput";
import { isCompleteAccessCode, normalizeAccessCode } from "./accessCode";
import {
  clearPendingAssemblyCode,
  hasSeenAssembliesSplash,
  loadPendingAssemblyCode,
  markAssembliesSplashSeen,
  savePendingAssemblyCode,
} from "./entryStorage";

type EntryStage = "loading" | "splash" | "home" | "signIn";

export function AssembliesEntry({ children }: { children: ReactNode }) {
  const { colors, rtl } = useProductStyle();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const account = useSession((s) => s.account);
  const sessionReady = useSession((s) => s.ready);
  const refresh = useSession((s) => s.refresh);
  const [stage, setStage] = useState<EntryStage>("loading");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [error, setError] = useState("");
  const redeeming = useRef(false);
  const readingClipboard = useRef(false);
  const hasIdentity = !!account?.providers.length;
  const hasAccess = hasIdentity && !!account?.admitted;
  const working = busy || pasting;

  useEffect(() => {
    let active = true;
    void Promise.all([hasSeenAssembliesSplash(), loadPendingAssemblyCode()])
      .then(([seen, pending]) => {
        if (!active) return;
        setCode(pending || "");
        setStage(seen ? (pending ? "signIn" : "home") : "splash");
      })
      .catch(() => {
        if (active) setStage("splash");
      });
    return () => {
      active = false;
    };
  }, []);

  const finishSplash = useCallback(() => {
    void markAssembliesSplashSeen().catch(() => {});
    setStage(code ? "signIn" : "home");
  }, [code]);

  useEffect(() => {
    if (stage !== "splash" || !focused) return;
    const timer = setTimeout(finishSplash, 1600);
    return () => clearTimeout(timer);
  }, [stage, focused, finishSplash]);

  const redeem = useCallback(
    async (invitationCode = code) => {
      if (redeeming.current) return;
      redeeming.current = true;
      setBusy(true);
      setError("");
      try {
        await productApi.request("/account/admission", {
          method: "POST",
          body: { code: normalizeAccessCode(invitationCode) },
        });
        await clearPendingAssemblyCode();
        await refresh();
        setCode("");
        setStage("home");
      } catch (cause) {
        await clearPendingAssemblyCode().catch(() => {});
        setError(
          cause instanceof ProductApiError && cause.code === "invalid_code"
            ? t("assemblies.invalidCode")
            : t("assemblies.accessUnavailable"),
        );
        setStage("home");
      } finally {
        redeeming.current = false;
        setBusy(false);
      }
    },
    [code, refresh, t],
  );

  useEffect(() => {
    if (hasAccess) {
      let active = true;
      void clearPendingAssemblyCode()
        .catch(() => {})
        .then(() => {
          if (!active) return;
          if (code) setCode("");
          if (stage === "signIn") setStage("home");
        });
      return () => {
        active = false;
      };
    } else if (stage === "signIn" && hasIdentity && code && focused) {
      let active = true;
      void loadPendingAssemblyCode()
        .then((pending) => {
          if (active && pending === code.trim()) void redeem();
        })
        .catch(() => {
          if (!active) return;
          setError(t("assemblies.accessUnavailable"));
          setStage("home");
        });
      return () => {
        active = false;
      };
    }
  }, [stage, hasAccess, hasIdentity, code, focused, redeem, t]);

  async function continueFromHome(value = code) {
    if (busy || !sessionReady) return;
    const invitationCode = normalizeAccessCode(value);
    if (!isCompleteAccessCode(invitationCode)) {
      setError(t("assemblies.invalidCode"));
      return;
    }
    Keyboard.dismiss();
    if (hasIdentity) {
      await redeem(invitationCode);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await savePendingAssemblyCode(invitationCode);
      setStage("signIn");
    } catch {
      setError(t("assemblies.accessUnavailable"));
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard() {
    if (working || readingClipboard.current || !sessionReady) return;
    readingClipboard.current = true;
    setPasting(true);
    setError("");
    try {
      const Clipboard = await import("expo-clipboard");
      const invitationCode = normalizeAccessCode(
        await Clipboard.getStringAsync(),
      );
      if (!isCompleteAccessCode(invitationCode)) {
        setError(t("assemblies.invalidCode"));
        return;
      }
      setCode(invitationCode);
      await continueFromHome(invitationCode);
    } catch {
      setError(t("assemblies.clipboardUnavailable"));
    } finally {
      readingClipboard.current = false;
      setPasting(false);
    }
  }

  if (stage === "loading") {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  if (stage === "splash") {
    return (
      <Modal
        visible={focused}
        animationType="fade"
        onRequestClose={finishSplash}
      >
        <SafeAreaView
          style={[styles.splash, { backgroundColor: colors.background }]}
        >
          <Text style={[styles.mark, { color: colors.textPrimary }]}>דבר</Text>
          <Text style={[styles.splashLabel, { color: colors.primaryDeep }]}>
            {t("assemblies.splashLabel")}
          </Text>
        </SafeAreaView>
      </Modal>
    );
  }

  if (hasAccess) return children;

  if (stage === "signIn") {
    return (
      <Page title={t("assemblies.welcome")}>
        {hasIdentity ? (
          <Text style={[styles.copy, { color: colors.textSecondary }]}>
            {t("common.loading")}
          </Text>
        ) : (
          <SignIn link={!!account} />
        )}
        {busy || hasIdentity ? (
          <ActivityIndicator accessibilityLabel={t("common.loading")} />
        ) : null}
        <Action
          label={t("assemblies.back")}
          disabled={busy}
          onPress={() => {
            void clearPendingAssemblyCode().catch(() => {});
            setStage("home");
          }}
        />
      </Page>
    );
  }

  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            styles.home,
            {
              paddingBottom:
                getNavigationDockContentPadding(insets.bottom) + 32,
            },
          ]}
        >
          <View style={styles.content}>
            <View style={styles.icon}>
              <KeyRound size={32} color={colors.primary} strokeWidth={1.7} />
            </View>
            <Text
              accessibilityRole="header"
              style={[styles.heading, { color: colors.textPrimary }]}
            >
              {t("assemblies.welcome")}
            </Text>
            <Text
              style={[
                styles.copy,
                {
                  color: colors.textSecondary,
                  writingDirection: rtl ? "rtl" : "ltr",
                },
              ]}
            >
              {t("assemblies.invitationCopy")}
            </Text>
            <Text
              style={[
                styles.label,
                {
                  color: colors.textPrimary,
                  textAlign: rtl ? "right" : "left",
                },
              ]}
            >
              {t("assemblies.accessCode")}
            </Text>
            <AccessCodeInput
              label={t("assemblies.accessCode")}
              value={code}
              onChange={(value) => {
                setCode(value);
                setError("");
                if (isCompleteAccessCode(value)) void continueFromHome(value);
              }}
              editable={!working && sessionReady}
              onSubmit={() => void continueFromHome()}
            />
            {error ? (
              <Text
                accessibilityRole="alert"
                style={[styles.error, { color: colors.textPrimary }]}
              >
                {error}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("assemblies.paste")}
              accessibilityState={{
                disabled: working || !sessionReady,
                busy: working,
              }}
              disabled={working || !sessionReady}
              onPress={() => void pasteFromClipboard()}
              style={({ pressed }) => [
                styles.button,
                {
                  shadowColor: colors.shadowDark,
                  opacity: pressed || working ? 0.7 : 1,
                },
              ]}
            >
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.gradient}
              >
                {working ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.buttonLabel}>
                    {t("assemblies.paste")}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  splash: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  mark: { fontFamily: "Inter_700Bold", fontSize: 42, writingDirection: "rtl" },
  splashLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 2,
  },
  home: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  content: { width: "100%", maxWidth: 420, alignSelf: "center", gap: 18 },
  icon: { height: 44, alignItems: "center", justifyContent: "center" },
  heading: {
    fontFamily: "Manrope_400Regular",
    fontSize: 34,
    lineHeight: 38,
    textAlign: "center",
  },
  copy: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20.3,
    textAlign: "center",
  },
  label: { fontFamily: "Inter_500Medium", fontSize: 12 },
  error: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  button: {
    borderRadius: 16,
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 2,
  },
  gradient: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  buttonLabel: {
    color: "#FFFFFF",
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
});
