import type { ProductClient } from "./productClient";
import type {
	Assembly,
	AssemblyDiscovery,
	MembershipRequest,
} from "./productContracts";

export function createAssembliesClient(api: Pick<ProductClient, "request">) {
	return {
		search: (
			filters: {
				kind: Assembly["kind"];
				radius: string;
				latitude?: number;
				longitude?: number;
				city?: string;
			},
			cache = false,
		) => {
			const query = new URLSearchParams({
				kind: filters.kind,
				radius_km: filters.radius,
				latitude: String(filters.latitude ?? ""),
				longitude: String(filters.longitude ?? ""),
				...(filters.city !== undefined ? { city: filters.city } : {}),
			});
			return api.request<AssemblyDiscovery>(`/assemblies?${query}`, { cache });
		},
		members: async (id: string) =>
			(
				await api.request<{ memberships: MembershipRequest[] }>(
					`/assemblies/${id}/members`,
				)
			).memberships,
	};
}
