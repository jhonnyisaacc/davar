interface PillToggleProps {
	label: string;
	value: boolean;
	onChange: (value: boolean) => void;
	disabled?: boolean;
	disabledReason?: string;
}

export function PillToggle({
	label,
	value,
	onChange,
	disabled = false,
	disabledReason,
}: PillToggleProps) {
	return (
		<button
			type="button"
			role="switch"
			aria-label={label}
			aria-checked={value}
			disabled={disabled}
			title={disabled ? disabledReason : undefined}
			onClick={() => onChange(!value)}
			className="-m-[7px] flex h-11 w-[66px] shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-50"
		>
			<span
				aria-hidden="true"
				className={`relative h-[30px] w-[52px] rounded-full transition-colors motion-reduce:transition-none ${value ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
			>
				<span
					className={`absolute top-[3px] left-[3px] size-6 rounded-full bg-white transition-transform motion-reduce:transition-none ${value ? "translate-x-[22px]" : "translate-x-0"}`}
				/>
			</span>
		</button>
	);
}
