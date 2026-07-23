// Node module customization hook (see node:module docs). The codebase's lib/ modules use
// extensionless relative imports (bundler-style resolution, as configured in tsconfig.json's
// "moduleResolution": "bundler"), which Next.js's webpack/turbopack resolver handles natively but
// Node's own ESM loader does not — it requires an explicit file extension for relative specifiers.
// This hook restores that resolution behavior for `node --test`: for an extensionless relative
// specifier, it probes the filesystem for a matching source file and appends the extension before
// delegating back to Node's default resolver. No new dependency — built entirely on node: builtins.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];

export async function resolve(specifier, context, nextResolve) {
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier.split("?")[0]);
  if (isRelative && !hasExtension && context.parentURL) {
    const base = new URL(specifier, context.parentURL);
    for (const ext of EXTENSIONS) {
      if (existsSync(fileURLToPath(base) + ext)) {
        return nextResolve(specifier + ext, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
