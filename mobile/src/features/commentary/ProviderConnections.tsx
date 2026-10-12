import { useState } from "react";
import type { ProviderConnection } from "@davar/shared/productContracts";
import { useTranslation } from "@/src/i18n/useTranslation";
import { productApi, useSession } from "../account/session";
import { SignIn } from "../account/SignIn";
import { Action, Card, Copy, Field } from "../product/ui";
import { capabilitiesStore } from "../product/useProductCapabilities";

export function ProviderConnections({
  providers,
  connections,
  onConnections,
}: {
  providers: string[];
  connections: ProviderConnection[];
  onConnections: (connections: ProviderConnection[]) => void;
}) {
  const account = useSession((s) => s.account);
  const { t } = useTranslation();
  const [selected, setSelected] = useState(providers[0]);
  const provider = providers.includes(selected) ? selected : providers[0];
  const [credential, setCredential] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setCredential("");
      onConnections(
        (
          await productApi.request<{ connections: ProviderConnection[] }>(
            "/provider_connections",
          )
        ).connections,
      );
      await capabilitiesStore.refresh();
    } catch {
      setCredential("");
      setError(t("featureAvailability.aiUnavailable"));
    } finally {
      setBusy(false);
    }
  }
  if (!account?.providers.length) return <SignIn link={!!account} />;
  return (
    <Card>
      <Copy>{t("featureAvailability.providerApiNotice")}</Copy>
      {providers.map((id) => (
        <Action
          key={id}
          label={(id === provider ? "✓ " : "") + id}
          onPress={() => setSelected(id)}
        />
      ))}
      <Field
        label={t("featureAvailability.apiKey")}
        value={credential}
        onChange={setCredential}
        secret
      />
      <Field
        label={t("featureAvailability.modelId")}
        value={model}
        onChange={setModel}
      />
      <Action
        label={t("featureAvailability.connectProvider")}
        disabled={busy || !provider || !credential || !model}
        onPress={() =>
          void save(() =>
            productApi.request("/provider_connections", {
              method: "POST",
              body: { provider, credential, model },
            }),
          )
        }
      />
      {connections.map((connection) => (
        <Action
          key={connection.id}
          label={`${t("featureAvailability.disconnect")} ${connection.provider}`}
          disabled={busy}
          onPress={() =>
            void save(() =>
              productApi.request(`/provider_connections/${connection.id}`, {
                method: "DELETE",
              }),
            )
          }
        />
      ))}
      {error && <Copy>{error}</Copy>}
    </Card>
  );
}
