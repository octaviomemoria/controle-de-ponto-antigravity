const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const logDir = path.join(repoRoot, ".dev");
const stdoutPath = path.join(logDir, "smoke-api.stdout.log");
const stderrPath = path.join(logDir, "smoke-api.stderr.log");
const port = process.env.SMOKE_API_PORT || "3302";

fs.mkdirSync(logDir, { recursive: true });
fs.rmSync(stdoutPath, { force: true });
fs.rmSync(stderrPath, { force: true });

const stdout = fs.createWriteStream(stdoutPath);
const stderr = fs.createWriteStream(stderrPath);
const apiProcess = spawn(process.execPath, ["apps/api/src/index.js"], {
  cwd: repoRoot,
  env: { ...process.env, PORT: port },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

apiProcess.stdout.pipe(stdout);
apiProcess.stderr.pipe(stderr);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function stopProcess() {
  if (!apiProcess.killed && apiProcess.exitCode === null) {
    apiProcess.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => apiProcess.once("exit", resolve)),
      sleep(2000).then(() => {
        if (apiProcess.exitCode === null) apiProcess.kill("SIGKILL");
      })
    ]);
  }
  stdout.end();
  stderr.end();
}

async function main() {
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  const readyUrl = `http://127.0.0.1:${port}/api/ready`;
  let healthResponse = null;
  let readyResponse = null;

  try {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      await sleep(500);
      if (apiProcess.exitCode !== null) break;
      try {
        healthResponse = await getJson(healthUrl);
        readyResponse = await getJson(readyUrl);
        if (healthResponse?.status === "ok" && readyResponse?.status === "ready") {
          console.log(`Smoke test da API OK em ${healthUrl} e ${readyUrl}`);
          return;
        }
      } catch {
        // Retry until timeout; final error includes process logs.
      }
    }

    const out = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, "utf8") : "";
    const err = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, "utf8") : "";
    throw new Error(
      [
        `Smoke test da API falhou em ${healthUrl} e ${readyUrl}.`,
        `Health: ${JSON.stringify(healthResponse)}`,
        `Ready: ${JSON.stringify(readyResponse)}`,
        `STDOUT:\n${out}`,
        `STDERR:\n${err}`
      ].join("\n")
    );
  } finally {
    await stopProcess();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
