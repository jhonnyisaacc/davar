export function centeredListScrollTop({
	listTop,
	listHeight,
	buttonTop,
	buttonHeight,
	scrollTop,
}: {
	listTop: number;
	listHeight: number;
	buttonTop: number;
	buttonHeight: number;
	scrollTop: number;
}): number {
	const delta = buttonTop - listTop - (listHeight - buttonHeight) / 2;
	return Math.max(0, scrollTop + delta);
}
