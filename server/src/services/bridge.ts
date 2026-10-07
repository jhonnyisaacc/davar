import { DomainError } from "../lib/errors.js";

export interface BridgeOptions {
	timeoutMs?: number;
	pythonBin?: string;
	failureCode?: string;
}

export async function runBridge<T>(
	script: string,
	payload: unknown,
	options: BridgeOptions = {},
): Promise<T> {
	const timeoutMs = options.timeoutMs ?? 15000;
	const python = options.pythonBin ?? process.env.PYTHON_BIN ?? "python3";
	const failure = new DomainError(options.failureCode ?? "calendar_domain_unavailable", 503);
	let proc: ReturnType<typeof Bun.spawn>;
	try {
		proc = Bun.spawn([python, script], {
			stdin: "pipe",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch {
		throw failure;
	}
	const stdin = proc.stdin;
	const stdout = proc.stdout;
	const stderr = proc.stderr;
	if (typeof stdin === "number" || !stdin || typeof stdout === "number" || !stdout) {
		throw failure;
	}
	try {
		stdin.write(JSON.stringify(payload));
		stdin.end();
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			try {
				proc.kill();
			} catch {
				// The child may have exited between the timeout and the kill.
			}
		}, timeoutMs);
		try {
			const stderrDrain = (async () => {
				if (typeof stderr === "number" || !stderr) return "";
				const text = await new Response(stderr).text();
				return text.slice(0, 4000);
			})();
			const [output, exitCode, stderrText] = await Promise.all([
				new Response(stdout).text(),
				proc.exited,
				stderrDrain,
			]);
			if (timedOut || exitCode !== 0) throw failure;
			try {
				return JSON.parse(output) as T;
			} catch {
				throw failure;
			} finally {
				if (stderrText.trim()) {
					console.warn(`Bridge ${script} stderr: ${stderrText.trim().slice(0, 500)}`);
				}
			}
		} finally {
			clearTimeout(timer);
		}
	} catch (error) {
		if (error instanceof DomainError) throw error;
		throw failure;
	}
}
