import { runControl } from "../../server/src/cli/control.ts";

const code = await runControl(process.argv.slice(2));
process.exit(code);
