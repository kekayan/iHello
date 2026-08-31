import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const client = join(root, "dist", "client");
const out = join(root, "..", "public", "admin");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(client, "assets"), join(out, "assets"), { recursive: true });

const shell = readFileSync(join(client, "_shell.html"));
// Strip accidental NUL bytes from the Start stream barrier payload.
const html = Buffer.from(shell.filter((b) => b !== 0)).toString("utf8");
writeFileSync(join(out, "index.html"), html);
console.log(`Copied SPA → ${out}`);
