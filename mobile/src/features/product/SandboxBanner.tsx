import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { productApi } from "../account/session";
export function SandboxBanner() {
  const [mailbox, setMailbox] = useState<string | null>(null);
  const [liveAi, setLiveAi] = useState(false);
  useEffect(() => {
    if (process.env.EXPO_PUBLIC_DEV_SANDBOX !== "1") return;
    void productApi
      .request<{
        sandbox: boolean;
        mailbox_url: string;
        commentary_provider?: string;
      }>("/development/status", { public: true })
      .then((s) => {
        if (s.sandbox) {
          setMailbox(s.mailbox_url);
          setLiveAi(s.commentary_provider === "openrouter");
        }
      })
      .catch(() => {});
  }, []);
  if (!mailbox) return null;
  return (
    <View
      style={{
        padding: 8,
        backgroundColor: "#FDF8F2",
        borderBottomWidth: 1,
        borderColor: "#7AA0D6",
      }}
    >
      <Text style={{ color: "#4C72A8", fontSize: 12, textAlign: "center" }}>
        Development sandbox · synthetic data ·{" "}
        {liveAi ? "live AI via OpenRouter" : "no live AI"}
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL(mailbox)}
      >
        <Text
          style={{
            color: "#4C72A8",
            fontSize: 12,
            textAlign: "center",
            textDecorationLine: "underline",
          }}
        >
          Open local email inbox
        </Text>
      </Pressable>
    </View>
  );
}
