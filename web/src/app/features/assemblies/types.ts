import type { ReactNode } from "react";
export type AssemblyButton = (
	label: string,
	action: () => Promise<void>,
	disabled?: boolean,
) => ReactNode;
