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

function destinationIsPrimary(id: string): boolean {
  const destination = destinationsById.get(id as DestinationId);
  return destination != null && "primary" in destination && destination.primary === true;
}

export function centerPrimaryDestination<T extends { id: string }>(
  items: readonly T[],
  isPrimary: (item: T) => boolean = (item) => destinationIsPrimary(item.id),
): T[] {
  const index = items.findIndex((item) => isPrimary(item));
  if (index < 0) return [...items];
  const primary = items[index];
  if (!primary) return [...items];
  const left = items.slice(0, index);
  const right = items.slice(index + 1);
  while (right.length - left.length > 1) {
    const moved = right.shift();
    if (moved) left.push(moved);
  }
  while (left.length - right.length > 1) {
    const moved = left.pop();
    if (moved) right.unshift(moved);
  }
  return [...left, primary, ...right];
}
