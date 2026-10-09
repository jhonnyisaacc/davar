import type { LucideIcon } from "lucide-react";
export function productControls(busy: boolean) {
	const field = (
		label: string,
		value: string,
		set: (value: string) => void,
		secret = false,
	) => (
		<label className="flex flex-col gap-2">
			{label}
			<input
				aria-label={label}
				placeholder={label === "Ask Davar" ? "Ask Davar…" : undefined}
				type={secret ? "password" : "text"}
				value={value}
				onChange={(e) => set(e.target.value)}
				className="rounded-xl p-3 border border-[var(--neomorph-border)] bg-[var(--neomorph-bg)]"
			/>
		</label>
	);
	const button = (label: string, action: () => void, Icon?: LucideIcon) => (
		<button
			type="button"
			disabled={busy}
			onClick={action}
			className="inline-flex items-center gap-2 rounded-full px-5 py-3 border border-[var(--primary)] bg-[var(--neomorph-bg)] disabled:opacity-50"
		>
			{Icon ? <Icon size={18} aria-hidden="true" /> : null}
			{label}
		</button>
	);

	return { field, button };
}
