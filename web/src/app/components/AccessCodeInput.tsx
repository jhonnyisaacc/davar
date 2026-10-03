import { useLayoutEffect, useRef, useState } from "react";
import {
	ACCESS_CODE_LENGTH,
	normalizeAccessCode,
} from "../../../../shared/assemblyAccessCode";

const CODE_SLOTS = [0, 1, 2, 3, 4, 5, 6] as const;

export function AccessCodeInput({
	id,
	label,
	value,
	onChange,
	disabled = false,
	errorId,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	errorId?: string;
}) {
	const input = useRef<HTMLInputElement>(null);
	const [focused, setFocused] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const selection = useRef<{ start: number; end: number } | null>(null);
	const displayValue = normalizeAccessCode(value).slice(0, ACCESS_CODE_LENGTH);

	useLayoutEffect(() => {
		if (!selection.current) return;
		input.current?.setSelectionRange(
			Math.min(selection.current.start, displayValue.length),
			Math.min(selection.current.end, displayValue.length),
		);
		selection.current = null;
	}, [displayValue]);

	return (
		<div className="assemblies-code" data-disabled={disabled}>
			{/* One input preserves paste, keyboard navigation, and screen reader editing. */}
			<input
				ref={input}
				id={id}
				aria-label={label}
				aria-describedby={errorId}
				aria-invalid={!!errorId}
				className="assemblies-code-input"
				dir="ltr"
				type="text"
				value={displayValue}
				onChange={(event) => {
					const field = event.currentTarget;
					const text = field.value;
					const normalize = (value: string) =>
						normalizeAccessCode(value).slice(0, ACCESS_CODE_LENGTH);
					const start = normalize(
						text.slice(0, field.selectionStart ?? text.length),
					).length;
					const end = normalize(
						text.slice(0, field.selectionEnd ?? text.length),
					).length;
					selection.current = { start, end };
					// Keep the caret in its slot when normalization changes the input's text.
					field.value = normalize(text);
					field.setSelectionRange(start, end);
					setActiveIndex(start);
					onChange(field.value);
				}}
				onSelect={(event) =>
					setActiveIndex(event.currentTarget.selectionStart ?? 0)
				}
				onFocus={() => setFocused(true)}
				onBlur={() => setFocused(false)}
				autoCapitalize="characters"
				autoComplete="off"
				autoCorrect="off"
				spellCheck={false}
				inputMode="numeric"
				pattern="[0-9]*"
				enterKeyHint="go"
				disabled={disabled}
			/>
			<div className="assemblies-code-row" dir="ltr" aria-hidden="true">
				{CODE_SLOTS.map((index) => (
					<button
						key={index}
						type="button"
						tabIndex={-1}
						disabled={disabled}
						className="assemblies-code-slot"
						data-active={
							focused && index === Math.min(activeIndex, ACCESS_CODE_LENGTH - 1)
						}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => {
							const start = Math.min(index, displayValue.length);
							input.current?.focus();
							input.current?.setSelectionRange(
								start,
								Math.min(start + 1, displayValue.length),
							);
							setActiveIndex(start);
						}}
					>
						{displayValue[index] || ""}
					</button>
				))}
			</div>
		</div>
	);
}
