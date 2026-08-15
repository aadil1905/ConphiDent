/**
 * Every internal link in the workspace has to land on a route that exists.
 *
 * A dead link cannot be caught by the type checker, and the only other way to
 * find one is to click every link on every screen against a live database. This
 * walks the app router for the routes that exist, then every href, redirect and
 * router.push for the links that are written, and fails when one has no home.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const appDir = join(root, "app");

/** Directories whose contents are never linked to from the clinic workspace. */
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build"]);

function walk(dir, onFile) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

// --- the routes that exist -------------------------------------------------

const routes = [];
walk(appDir, (file) => {
  const name = file.split(sep).pop();
  if (name !== "page.tsx" && name !== "page.ts" && name !== "route.ts" && name !== "route.tsx") return;

  const segments = relative(appDir, file)
    .split(sep)
    .slice(0, -1)
    // Route groups are organisational only and never appear in a URL.
    .filter((segment) => !(segment.startsWith("(") && segment.endsWith(")")))
    .filter((segment) => !segment.startsWith("@"));

  routes.push("/" + segments.join("/"));
});

/** A route as a matcher: [id] eats one segment, [...slug] eats the rest. */
function matches(route, path) {
  const routeParts = route.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);

  for (let index = 0; index < routeParts.length; index += 1) {
    const part = routeParts[index];
    if (part.startsWith("[...") || part.startsWith("[[...")) return pathParts.length >= index;
    if (index >= pathParts.length) return false;
    if (part.startsWith("[")) continue;
    if (part !== pathParts[index]) return false;
  }
  return routeParts.length === pathParts.length;
}

// --- the links that are written -------------------------------------------

const LINK_PATTERNS = [
  /href=["'](\/[^"'{}]*)["']/g,
  /href=\{`(\/[^`]*)`\}/g,
  /redirect\(\s*["'](\/[^"']*)["']/g,
  /redirect\(\s*`(\/[^`]*)`/g,
  /router\.(?:push|replace)\(\s*["'](\/[^"']*)["']/g,
  /router\.(?:push|replace)\(\s*`(\/[^`]*)`/g,
];

const found = new Map();
for (const dir of ["app", "components", "lib"]) {
  walk(join(root, dir), (file) => {
    if (!/\.tsx?$/.test(file)) return;
    const source = readFileSync(file, "utf8");
    for (const pattern of LINK_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        // Drop the query and hash, and template holes like /patients/${id}.
        const path = match[1].split("?")[0].split("#")[0].replace(/\$\{[^}]*\}/g, "1");
        if (path.startsWith("//")) continue;
        if (!found.has(path)) found.set(path, relative(root, file));
      }
    }
  });
}

// Static assets and files served from public/, not routes.
const isAsset = (path) => /\.[a-z0-9]{2,5}$/i.test(path);

const dead = [];
for (const [path, file] of found) {
  if (path === "/" || isAsset(path)) continue;
  if (!routes.some((route) => matches(route, path))) dead.push({ path, file });
}

if (dead.length > 0) {
  const lines = dead.map(({ path, file }) => `  ${path}  (${file})`).join("\n");
  throw new Error(`These links do not resolve to any route:\n${lines}`);
}

console.log(`Verified ${found.size} internal links against ${routes.length} routes.`);
