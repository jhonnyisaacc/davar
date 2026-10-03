// eslint-disable-next-line import/no-unresolved -- Bun test runner built-in
import {describe, expect, test} from "bun:test";
import {assemblyMembershipLabel, assembliesErrorMessage, canCreateAssembly, canRequestAssembly, hasAssemblyLocation} from "@davar/shared/assembliesPresentation";
import {isCompleteAccessCode, normalizeAccessCode} from "@davar/shared/assemblyAccessCode";
import type {Account, Assembly} from "@davar/shared/productContracts";
import {ProductApiError} from "@davar/shared/productClient";
const account: Account = {id: "qa", display_name: "QA", admitted: true, onboarding_complete: true, leader_verified: false, providers: ["email"], profile: {experience: "experienced", gender: "female"}, settings: {}, settings_version: 0, consultations_remaining: 1, discoverable: false, contact_visible: false};
const assembly: Assembly = {id: "local", name: "QA", kind: "in_person", city: "City", can_manage: false, member_state: "not_member", distance_km: null, meeting_url: null};
describe("shared Assemblies behavior on mobile", () => {
  test("invitation normalization preserves leading zeroes and rejects incomplete codes", () => {
    expect(normalizeAccessCode(" 012-3456 ")).toBe("0123456");
    expect(isCompleteAccessCode("0123456")).toBe(true);
    for (const value of ["", "123456", "12345678", "DAVAR01"]) expect(isCompleteAccessCode(value)).toBe(false);
  });
  test("city coordinates at zero are valid and missing or non-finite values are not", () => {
    expect(hasAssemblyLocation({latitude: 0, longitude: 0})).toBe(true);
    expect(hasAssemblyLocation({latitude: 0})).toBe(false);
    expect(hasAssemblyLocation({latitude: NaN, longitude: 0})).toBe(false);
  });
  test("join actions respect Starting members leaders and existing membership", () => {
    expect(canRequestAssembly(account, assembly)).toBe(true);
    expect(canRequestAssembly({...account, profile: {experience: "starting"}}, assembly)).toBe(false);
    expect(canRequestAssembly(account, {...assembly, member_state: "requested"})).toBe(false);
    expect(canRequestAssembly(account, {...assembly, can_manage: true})).toBe(false);
    expect(canRequestAssembly({...account, active_assembly_id: "other"}, assembly)).toBe(false);
  });
  test("creation requires verification complete onboarding and no current assembly", () => {
    const leader = {...account, leader_verified: true, profile: {experience: "leader" as const, gender: "male" as const}};
    expect(canCreateAssembly(leader)).toBe(true);
    expect(canCreateAssembly({...leader, active_assembly_id: "local"})).toBe(false);
    expect(canCreateAssembly({...leader, onboarding_complete: false})).toBe(false);
    expect(canCreateAssembly(account)).toBe(false);
  });
  test("states and errors are human readable without leaking raw server failures", () => {
    expect(assemblyMembershipLabel("requested")).toBe("Request pending");
    expect(assembliesErrorMessage(new ProductApiError("already_member_elsewhere", 409))).toContain("already belong");
    expect(assembliesErrorMessage(new TypeError("private server details"))).not.toContain("private server details");
  });
});
