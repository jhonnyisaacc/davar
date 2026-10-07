export function logDevelopmentJob(env: string, job: string, source: string): void {
	if (env !== "development") return;
	console.log(JSON.stringify({ event: "job", job, source }));
}
