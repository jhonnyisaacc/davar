import { Redirect } from "expo-router";
import { destinationById } from "@davar/shared/destinations";

const verseTabHref = `/(tabs)/${destinationById("verse").id as "verse"}` as const;

export default function TabIndex() {
  return <Redirect href={verseTabHref} />;
}
