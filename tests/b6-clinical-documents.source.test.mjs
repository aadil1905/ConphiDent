import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * Source is normalised to LF before matching.
 *
 * `core.autocrlf` is true, so a Windows working copy has CRLF endings, and any
 * pattern that spans lines then silently fails to match. That looked exactly
 * like the code having drifted away from the test, which is part of why these
 * files sat unrun. Normalised, the patterns mean what they say on any platform.
 */
const lf = (value) => value.replace(/\r\n/g, "\n");

const source = lf(await readFile(
  new URL("../components/documents/B6ClinicalDocuments.tsx", import.meta.url),
  "utf8",
));

test("print output uses one exact physical page definition without double padding", () => {
  // A4, not B6, since 21 Aug 2026: the B6 sheet declared its own 125×176mm
  // page and a clinic printer loaded with A4 rendered it as a small block
  // floating on the sheet. The class names keep their b6- prefix as history.
  assert.equal(source.match(/@page \{/g)?.length, 1);
  assert.match(source, /@page \{[\s\S]*?size: A4;[\s\S]*?margin: 12mm;/);
  assert.match(source, /\.b6-document-sheet \{[\s\S]*?min-height: 265mm !important;[\s\S]*?padding: 0 !important;/);
  assert.match(source, /data-document-format="A4-210x297mm"/);
});

test("every printed page repeats clinic, document, footer, and page identity", () => {
  assert.match(source, /\.b6-page-table thead \{ display: table-header-group; \}/);
  assert.match(source, /\.b6-page-table tfoot \{ display: table-footer-group; \}/);
  assert.match(source, /content: "Page " counter\(page\) " of " counter\(pages\);/);
  assert.match(source, /<thead>[\s\S]*?<DocumentHeader clinic=\{clinic\} title=\{title\} number=\{number\}/);
  // `right` gained a fallback to the clinic name, so it is no longer a bare
  // identifier. What matters is that the footer is inside the repeating tfoot.
  assert.match(source, /<tfoot>[\s\S]*?<DocumentFooter left=\{footerLeft\} right=\{footerRight/);
  assert.match(source, /footerLeft=\{`\$\{number\} · Issued clinical record for \$\{prescription\.patient\.fullName\}`\}/);
  assert.match(source, /const footerLeft = `\$\{document\.documentNumber\} ·/);
  assert.doesNotMatch(source, /position: fixed|b6-running-header|b6-running-footer/);
});

test("medications and invoice lines are individual break-safe table rows", () => {
  assert.match(source, /\.b6-document-sheet \{[\s\S]*?display: block !important;/);
  assert.match(source, /overflow: visible !important;/);
  assert.match(source, /<tr key=\{item\.id\} className="b6-break-avoid"/);
  assert.match(source, /lines\.map\(\(line, index\) => <tr key=\{line\.id\} className="b6-break-avoid/);
  assert.match(source, /\.b6-page-fill \{ display: none !important; \}/);
  // The invoice table's column headers repeat on every printed page. The
  // column was renamed Description -> Treatment in the billing redesign, so the
  // header cells are asserted by structure and by the names they carry now.
  assert.match(source, /repeatingHeader=\{<>[\s\S]*?<th[^>]*>#<\/th>/);
  assert.match(source, /repeatingHeader=\{<>[\s\S]*?<th[^>]*>Treatment<\/th>/);
});
