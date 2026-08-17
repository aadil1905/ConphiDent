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

// --- every screen has a way in ---------------------------------------------
//
// A redesign can leave a working screen with nothing pointing at it, which is
// how treatment plans and prescriptions fell out of reach. A whole section —
// /dashboard/<something> — has to be in the navigation. Anything deeper only
// needs a link from somewhere.

const navSource = readFileSync(join(root, "components/shell/nav-items.ts"), "utf8");
const inNav = new Set([...navSource.matchAll(/href:\s*"([^"]+)"/g)].map((match) => match[1]));

/** Kept only so an old bookmark still lands somewhere; nothing links to these. */
const isLegacyAlias = (route) => {
  const file = join(appDir, route.replace("/dashboard", "dashboard"), "page.tsx");
  try {
    const source = readFileSync(file, "utf8");
    return /redirect\(|notFound\(/.test(source) && source.split("\n").length < 15;
  } catch {
    return false;
  }
};

/**
 * Screens that are deliberately not in the sidebar because the section they
 * belong to already carries them on its own tab bar. Putting them in both
 * places was duplication, not discoverability.
 */
const REACHED_ANOTHER_WAY = new Set([
  // ⌘K from every screen, and the search box in the top bar.
  "/dashboard/search",
  // The five tabs across the top of Messages.
]);

const stranded = [];
for (const route of routes) {
  if (!route.startsWith("/dashboard/") || route.includes("[")) continue;
  const isSection = route.split("/").filter(Boolean).length === 2;
  if (!isSection) continue;
  if (inNav.has(route) || REACHED_ANOTHER_WAY.has(route) || isLegacyAlias(route)) continue;
  stranded.push(route);
}

if (stranded.length > 0) {
  throw new Error(
    `These screens are not in the navigation, so nobody can find them:\n${stranded
      .map((route) => `  ${route}`)
      .join("\n")}\nAdd them to components/shell/nav-items.ts, or make the page a redirect.`,
  );
}

console.log(
  `Verified ${found.size} internal links against ${routes.length} routes, and every section reachable from the nav.`,
);
