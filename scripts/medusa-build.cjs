/**
 * Run `medusa build` with NODE_ENV=development so the CLI keeps ts-node
 * registered and `medusa-config.ts` can load (required for Docker / Cloud
 * images that set NODE_ENV=production in the environment before building).
 */
process.env.NODE_ENV = "development";

const { execSync } = require("node:child_process");

execSync("npx medusa build", {
  stdio: "inherit",
  env: process.env,
});
