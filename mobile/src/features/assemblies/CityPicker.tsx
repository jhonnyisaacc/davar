import { useState } from "react";
import { productApi, useSession } from "../account/session";
import { Action, Copy, Field } from "../product/ui";
export function CityPicker() {
	const [query, setQuery] = useState("");
	const [error, setError] = useState("");
	const [cities, setCities] = useState<
		{ city: string; country: string; selection: string }[]
	>([]);
	const refresh = useSession((s) => s.refresh);
	const [busy, setBusy] = useState(false);
	async function search() {
		setBusy(true);
		setError("");
		try {
			setCities(
				(
					await productApi.request<{ cities: typeof cities }>(
						`/cities?q=${encodeURIComponent(query)}`,
					)
				).cities,
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Unavailable");
		} finally {
			setBusy(false);
		}
	}
	async function choose(selection: string) {
		setBusy(true);
		setError("");
		try {
			await productApi.request("/account/city", {
				method: "PATCH",
				body: { selection },
			});
			await refresh();
			setCities([]);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Unavailable");
		} finally {
			setBusy(false);
		}
	}
	return (
		<>
			<Field label="Search your city" value={query} onChange={setQuery} />
			<Action
				label="Find city"
				disabled={busy || query.length < 2}
				onPress={() => void search()}
			/>
			{error ? <Copy>{error}</Copy> : null}
			{cities.map((c) => (
				<Action
					key={c.selection}
					label={c.city + ", " + c.country}
					disabled={busy}
					onPress={() => void choose(c.selection)}
				/>
			))}
		</>
	);
}
