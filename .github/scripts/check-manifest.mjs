// Validates paseo-plugin.json against package.json. Passes when the plugin does not exist yet.
import { existsSync, readFileSync } from "node:fs";

const fail = (m) => { console.log(`::error::${m}`); process.exit(1); };

if (!existsSync("paseo-plugin.json")) {
  console.log("No paseo-plugin.json yet; nothing to validate.");
  process.exit(0);
}
let m;
try { m = JSON.parse(readFileSync("paseo-plugin.json", "utf8")); } catch (e) { fail(`paseo-plugin.json is not valid JSON: ${e.message}`); }

if (m.id !== "paseo-mail") fail(`paseo-plugin.json: id must be "paseo-mail", got "${m.id}"`);
for (const k of ["name", "description"]) {
  if (typeof m[k] !== "string" || !m[k]) fail(`paseo-plugin.json: "${k}" must be a non-empty string`);
}
if (m.requirements?.paseo !== undefined && typeof m.requirements.paseo !== "string") {
  fail('paseo-plugin.json: "requirements.paseo" must be a semver range string');
}
for (const f of m.media ?? []) {
  if (!existsSync(f)) fail(`paseo-plugin.json: media file "${f}" does not exist`);
}
if (existsSync("package.json")) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  if (pkg.name !== m.id) fail(`package.json name "${pkg.name}" differs from plugin id "${m.id}"`);
}
console.log(`paseo-plugin.json OK (${m.id})`);
