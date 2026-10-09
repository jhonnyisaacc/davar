import type { ProductCapabilities } from "./productCapabilities";

export const DESTINATIONS = [
  { id: "home", path: "/home" },
  { id: "assemblies", path: "/assemblies", flag: "assemblies" },
  { id: "commentary", path: "/commentary", flag: "commentary" },
  { id: "widgets", path: "/widgets" },
  { id: "verse", path: "/verse", primary: true },
  { id: "settings", path: "/settings" },
  { id: "account", path: "/account" },
  { id: "sources", path: "/sources" },
  { id: "commentarySources", path: "/commentary-sources" },
  { id: "support", path: "/support" },
  { id: "donate", path: "/donate" },
  { id: "features", path: "/features" },
  { id: "terms", path: "/terms" },
  { id: "privacy", path: "/privacy" },
  { id: "feedback", path: "/feedback" },
  { id: "notFound", path: "/" },
  { id: "connectionError", path: "/" },
] as const;

export type Destination = (typeof DESTINATIONS)[number];
export type DestinationId = Destination["id"];

const destinationsById = new Map<DestinationId, Destination>(
  DESTINATIONS.map((destination) => [destination.id, destination]),
);

export const destinationById = (id: DestinationId): Destination => {
  const destination = destinationsById.get(id);
  if (!destination) {
    throw new Error(`Unknown destination: ${id}`);
  }
  return destination;
};

export function destinationOpen(capabilities: ProductCapabilities, id: DestinationId): boolean {
  const destination = destinationById(id);
  if (!("flag" in destination)) return true;
  return capabilities.flags[destination.flag] === true;
}
