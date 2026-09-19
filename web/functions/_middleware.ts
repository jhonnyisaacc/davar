import {
	applySocialPreviewToHtml,
	buildPreviewMetadata,
	shouldRewritePreviewPath,
} from "../shared/socialPreview";

type PagesContext = {
	request: Request;
	next: () => Promise<Response>;
};

export const onRequest = async (context: PagesContext): Promise<Response> => {
	const { request } = context;
	if (request.method !== "GET" && request.method !== "HEAD") {
		return context.next();
	}

	const url = new URL(request.url);
	if (!shouldRewritePreviewPath(url.pathname)) {
		return context.next();
	}

	const response = await context.next();
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.includes("text/html")) {
		return response;
	}

	const html = await response.text();
	const metadata = buildPreviewMetadata({
		requestUrl: request.url,
		acceptLanguage: request.headers.get("accept-language"),
	});
	const rewritten = applySocialPreviewToHtml(html, metadata);
	const headers = new Headers(response.headers);
	headers.delete("content-length");

	if (request.method === "HEAD") {
		return new Response(null, {
			status: response.status,
			headers,
		});
	}

	return new Response(rewritten, {
		status: response.status,
		headers,
	});
};
