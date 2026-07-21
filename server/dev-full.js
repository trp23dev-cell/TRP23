import { spawn } from "node:child_process";

const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

const api = spawn(npmCmd, ["run", "dev:api"], { stdio: "inherit" });
const web = spawn(npmCmd, ["run", "dev"], { stdio: "inherit" });

function shutdown() {
  api.kill("SIGTERM");
  web.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
