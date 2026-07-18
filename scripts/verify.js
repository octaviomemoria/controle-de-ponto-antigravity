const { spawnSync } = require("child_process");

const steps = [
  ["typecheck:web", ["npm", "run", "typecheck:web"]],
  ["build:web", ["npm", "run", "build:web"]],
  ["smoke:api", ["npm", "run", "smoke:api"]]
];

for (const [label, commandParts] of steps) {
  const [, , scriptName] = commandParts;
  console.log(`[verify] ${label}`);
  const result = spawnSync("npm", ["run", scriptName], {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("[verify] ok");
