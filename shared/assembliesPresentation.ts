import type { Account, Assembly } from "./productContracts";
import { ProductApiError } from "./productClient";

export function hasAssemblyLocation(profile: Account["profile"]) {
  return typeof profile.latitude === "number" && Number.isFinite(profile.latitude) &&
    typeof profile.longitude === "number" && Number.isFinite(profile.longitude);
}

export function canRequestAssembly(account: Account, assembly: Assembly) {
  return account.onboarding_complete && account.profile.experience !== "starting" &&
    !assembly.can_manage && assembly.member_state === "not_member" &&
    (!account.active_assembly_id || account.active_assembly_id === assembly.id);
}

export function canCreateAssembly(account: Account) {
  return account.onboarding_complete && account.leader_verified &&
    account.profile.gender === "male" && !account.active_assembly_id;
}

export function assemblyMembershipLabel(state: Assembly["member_state"]) {
  return {not_member: "Not a member", requested: "Request pending", member: "Member"}[state];
}

export function assembliesErrorMessage(error: unknown) {
  if (!(error instanceof ProductApiError)) return "Unable to connect. Please try again.";
  const messages: Record<string, string> = {
    authentication_required: "Please sign in again.",
    admission_required: "Enter a valid invitation code to continue.",
    onboarding_required: "Complete your profile before continuing.",
    invalid_area: "Select a city and a supported search radius.",
    city_selection_required: "Select your city before creating a local assembly.",
    starting_cannot_join: "The Starting path allows browsing. Joining requires the Experienced path.",
    already_member_elsewhere: "You already belong to an assembly. Leave it before joining or creating another.",
    leader_verification_required: "Leader verification is required before you can create an assembly.",
    leader_cannot_leave: "An assembly leader cannot leave their own assembly.",
    request_not_pending: "This request has already been decided. Refresh to see its current state.",
    conflict: "This request already exists. Refresh to see its current state.",
    contact_support: "An endorsement was declined. Contact support before continuing verification.",
    two_endorsers_maximum: "You can request endorsements from two different leaders.",
    telegram_contact_required: "Link Telegram before sharing your contact.",
    invalid_city_selection: "Your city selection has expired. Search for your city again.",
    validation_failed: "Check the name and enter a complete HTTPS meeting link.",
    rate_limited: "Too many requests. Wait a minute and try again.",
    not_found: "This assembly or request is no longer available. Refresh and try again.",
    forbidden: "Only the assembly leader can perform this action.",
  };
  return messages[error.code] || "This action is unavailable. Please try again.";
}
