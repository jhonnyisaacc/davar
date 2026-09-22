export const DESTINATIONS = [
  { id: "home", path: "/home" },
  { id: "verse", path: "/verse", primary: true },
  { id: "settings", path: "/settings" },
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
