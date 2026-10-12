import { runControl } from "../../api/src/cli/control.ts";

const code = await runControl(process.argv.slice(2));
process.exit(code);
