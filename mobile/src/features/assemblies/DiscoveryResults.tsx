import { Pressable, Text, View } from "react-native";
import { ChevronRight, Users } from "lucide-react-native";
import type { Assembly, AssemblyPerson } from "@davar/shared/productContracts";
import { Action, Card, Copy, useProductStyle } from "../product/ui";

export function DiscoveryResults({
  assemblies,
  people,
  searched,
  busy,
  onOpen,
  onContact,
}: {
  assemblies: Assembly[];
  people: AssemblyPerson[];
  searched: boolean;
  busy: boolean;
  onOpen: (assembly: Assembly) => void;
  onContact: (url: string) => void;
}) {
  const { colors, rtl } = useProductStyle();
  return (
    <>
      <View>
        {assemblies.map((assembly) => (
          <Pressable
            key={assembly.id}
            accessibilityRole="button"
            accessibilityLabel={assembly.name}
            onPress={() => onOpen(assembly)}
            style={{
              flexDirection: rtl ? "row-reverse" : "row",
              gap: 16,
              alignItems: "center",
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Users size={28} color={colors.primaryDeep} strokeWidth={1.7} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text
                style={{
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 22,
                  color: colors.textPrimary,
                }}
              >
                {assembly.name}
              </Text>
              <Text
                style={{
                  fontFamily: "Inter_400Regular",
                  fontSize: 13,
                  color: colors.textSecondary,
                }}
              >
                {assembly.city || "Online"}
                {assembly.distance_km !== null
                  ? " · " + assembly.distance_km + " km"
                  : ""}
                {assembly.can_manage ? " · Your Qahal" : ""}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </Pressable>
        ))}
      </View>
      {searched && !assemblies.length ? (
        <Copy>No assemblies found for this search.</Copy>
      ) : null}
      {people.map((person) => (
        <Card key={person.id}>
          <Copy>
            {person.name} · {person.area}
          </Copy>
          {person.contact_url ? (
            <Action
              label="Contact on Telegram"
              disabled={busy}
              onPress={() => onContact(person.contact_url!)}
            />
          ) : null}
        </Card>
      ))}
    </>
  );
}
