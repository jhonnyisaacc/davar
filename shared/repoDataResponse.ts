export async function repoDataResponse(
	pathname: string,
	dataRoot: URL,
): Promise<Response | null> {
	const marker = "/data/";
	const index = pathname.lastIndexOf(marker);
	if (index === -1) return null;
	const relative = pathname.slice(index + marker.length);
	const file = Bun.file(new URL(relative, dataRoot));
	if (!(await file.exists())) {
		return new Response("missing", { status: 404 });
	}
	return new Response(await file.text(), {
		headers: { "content-type": "application/json" },
	});
}
