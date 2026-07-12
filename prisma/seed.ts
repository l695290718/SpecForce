import { spawn } from "node:child_process";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(command, ["--filter", "@specforge/mcp-server", "seed"], {
  cwd: process.cwd(),
  stdio: "inherit"
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
