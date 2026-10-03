import { Linking } from "react-native";
import type {
  Assembly,
  MembershipRequest,
} from "@davar/shared/productContracts";
import { Action, Card, Copy, Field } from "../product/ui";
export type ManagementTab = "qahal" | "people" | "requests";
export function AssemblyManagement({
  selected,
  members,
  tab,
  setTab,
  name,
  setName,
  meeting,
  setMeeting,
  busy,
  onSave,
  onDecide,
}: {
  selected: Assembly;
  members: MembershipRequest[];
  tab: ManagementTab;
  setTab: (value: ManagementTab) => void;
  name: string;
  setName: (value: string) => void;
  meeting: string;
  setMeeting: (value: string) => void;
  busy: boolean;
  onSave: (name: string, meeting: string) => void;
  onDecide: (id: string, decision: "accepted" | "declined") => void;
}) {
  return (
    <>
      {(["qahal", "people", "requests"] as const).map((item) => (
        <Action
          key={item}
          label={
            item === "requests"
              ? "Requests (" +
                members.filter((m) => m.state === "requested").length +
                ")"
              : item
          }
          onPress={() => setTab(item)}
        />
      ))}
      {tab === "qahal" ? (
        <Card>
          <Field label="Assembly name" value={name} onChange={setName} />
          <Copy>{selected.city}</Copy>
          <Field
            label="Meeting link (HTTPS)"
            value={meeting}
            onChange={setMeeting}
          />
          <Action
            label="Save assembly"
            disabled={busy || !name.trim()}
            onPress={() => onSave(name.trim(), meeting.trim())}
          />
        </Card>
      ) : (
        members
          .filter(
            (m) => m.state === (tab === "people" ? "member" : "requested"),
          )
          .map((member) => (
            <Card key={member.id}>
              <Copy>{member.user.name}</Copy>
              {member.user.gender ? <Copy>{member.user.gender}</Copy> : null}
              {member.user.age !== null && member.user.age !== undefined ? (
                <Copy>{member.user.age} years</Copy>
              ) : null}
              {member.user.contact_url ? (
                <Action
                  label="Contact on Telegram"
                  onPress={() => void Linking.openURL(member.user.contact_url!)}
                />
              ) : null}
              {member.state === "requested"
                ? (["accepted", "declined"] as const).map((decision) => (
                    <Action
                      key={decision}
                      label={decision === "accepted" ? "Accept" : "Decline"}
                      disabled={busy}
                      onPress={() => onDecide(member.id, decision)}
                    />
                  ))
                : null}
            </Card>
          ))
      )}
    </>
  );
}
