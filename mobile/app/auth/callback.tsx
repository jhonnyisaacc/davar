import { useEffect, useRef, useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { completeSignIn } from "@/src/features/account/session";
import { Page, Copy, Action } from "@/src/features/product/ui";
export default function AuthCallback() {
  const {code} = useLocalSearchParams<{code?: string}>();
  const attempted = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!code || attempted.current) return;
    attempted.current = true;
    completeSignIn(code).then(() => router.replace("/assemblies" as never))
      .catch(err => setError(err instanceof Error ? err.message : "Sign-in failed"));
  }, [code]);
  return <Page title="Davar"><Copy>{error || "Completing sign-in…"}</Copy>{error ? <Action label="Back to Scripture" onPress={() => router.replace("/verse")} /> : null}</Page>;
}
