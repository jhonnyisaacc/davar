import { useState } from "react";
import { productApi } from "../services/productApi";
export type CityChoice = {
	city: string;
	country: string;
	latitude: number;
	longitude: number;
	selection?: string;
};
export function CityChooser({
	authenticated = false,
	onChoose,
}: {
	authenticated?: boolean;
	onChoose: (city: CityChoice) => Promise<void>;
}) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<CityChoice[]>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	async function search() {
		setBusy(true);
		setError("");
		try {
			setResults(
				(
					await productApi.request<{ cities: CityChoice[] }>(
						`${authenticated ? "/cities" : "/calendar/locations"}?q=${encodeURIComponent(query)}`,
						{ public: !authenticated },
					)
				).cities,
			);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Unavailable");
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="space-y-3">
			<label className="flex flex-col gap-2">
				Your city
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					className="rounded-xl p-3 border border-[var(--neomorph-border)] bg-[var(--neomorph-bg)]"
				/>
			</label>
			<button
				type="button"
				disabled={busy || query.length < 2}
				onClick={() => void search()}
				className="rounded-full px-5 py-3 border border-[var(--neomorph-border)]"
			>
				Find city
			</button>
			{error ? <p role="status">{error}</p> : null}
			{results.map((city) => (
				<button
					type="button"
					key={
						city.selection || `${city.city}/${city.latitude}/${city.longitude}`
					}
					disabled={busy}
					className="block w-full text-start p-3 rounded-xl bg-[var(--neomorph-bg)]"
					onClick={() => {
						setBusy(true);
						void onChoose(city)
							.then(() => setResults([]))
							.catch((e) =>
								setError(e instanceof Error ? e.message : "Unavailable"),
							)
							.finally(() => setBusy(false));
					}}
				>
					{city.city}, {city.country}
				</button>
			))}
		</div>
	);
}
