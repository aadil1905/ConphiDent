import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../components/documents/B6ClinicalDocuments.tsx", import.meta.url),
  "utf8",
);

test("B6 print output uses one exact physical page definition without double padding", () => {
  assert.equal(source.match(/@page \{/g)?.length, 1);
  assert.match(source, /@page \{[\s\S]*?size: 125mm 176mm;[\s\S]*?margin: 8mm;/);
  assert.match(source, /\.b6-document-sheet \{[\s\S]*?min-height: 160mm !important;[\s\S]*?padding: 0 !important;/);
  assert.match(source, /data-document-format="B6-125x176mm"/);
});

test("every printed page repeats clinic, document, footer, and page identity", () => {
  assert.match(source, /\.b6-page-table thead \{ display: table-header-group; \}/);
  assert.match(source, /\.b6-page-table tfoot \{ display: table-footer-group; \}/);
  assert.match(source, /content: "Page " counter\(page\) " of " counter\(pages\);/);
  assert.match(source, /<thead>[\s\S]*?<DocumentHeader clinic=\{clinic\} title=\{title\} number=\{number\}/);
  assert.match(source, /<tfoot>[\s\S]*?<DocumentFooter left=\{footerLeft\} right=\{footerRight\}/);
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
  assert.match(source, /repeatingHeader=\{<>[\s\S]*?<th[^>]*>Description<\/th>/);
});
