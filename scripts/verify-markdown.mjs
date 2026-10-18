#!/usr/bin/env node
/**
 * Verifies the Modrinth body renderer in `src/lib/markdown.ts`.
 *
 * Project bodies are author-supplied HTML rendered inside the launcher, so
 * the two properties worth pinning down are (1) legitimate Modrinth markup —
 * `<center>`, `<img>`, HTML comments — actually renders instead of leaking as
 * text, and (2) hostile markup never becomes live DOM. The second property
 * depends on `rehype-raw` running *before* `rehype-sanitize`; swap that order
 * and the script/script-handler assertions below fail, which is the point:
 * nothing about a rendered page makes that regression obvious by itself.
 *
 * The pipeline is loaded by transpiling the real module with the project's
 * own TypeScript, so this test always exercises what the app ships.
 *
 * Run with `npm test`. Exits non-zero if any assertion fails.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import ts from "typescript";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Transpile `src/lib/markdown.ts` and import it from a real file, so its
 * bare imports resolve the same way they do under Vite. */
async function loadPipeline() {
  const url = pathToFileURL(join(projectRoot, "src", "lib", "markdown.ts")).href;
  const source = await readFile(join(projectRoot, "src", "lib", "markdown.ts"), "utf8");
  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: "markdown.ts",
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const errors = (diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const text = errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n");
    throw new Error(`src/lib/markdown.ts failed to transpile:\n${text}`);
  }

  // node_modules/.cache is always present in a built tree and never committed.
  const temp = join(projectRoot, "node_modules", ".cache", "verify-markdown.mjs");
  await mkdir(dirname(temp), { recursive: true });
  await writeFile(temp, outputText, "utf8");
  try {
    // Query string defeats the ESM cache when `npm test` runs twice in a row.
    return await import(`${pathToFileURL(temp).href}?v=${Date.now()}`);
  } finally {
    await rm(temp, { force: true });
  }
}

/**
 * A body in the shape Modrinth actually publishes: the centered image block
 * (with its load-bearing comment) alongside the XSS vectors a sanitizer has
 * to stop.
 */
const body = `**Sodium** is a performance mod.

<center>
 <img src="https://cdn.modrinth.com/data/AANobbMI/images/5ca2e8f6c72f3d543dd3dc95b706964c5678d80e.png" width="150" alt="Sodium 0.4 Comparison"></img>
 <p>
   <!-- This paragraph is load bearing, and ensures a margin is added before the following Markdown -->
 </p>
</center>

# Heading

[link](https://example.com)

| Mod | FPS |
| --- | --- |
| Sodium | 120 |

- [x] done
- [ ] open

<script>alert('xss')</script>
<img src="x" onerror="alert(1)">
<div style="position:fixed;inset:0">styled</div>

[bad](javascript:alert(1))
<a href="javascript:alert(1)">raw bad link</a>
`;

const { rehypePlugins, remarkPlugins } = await loadPipeline();

const html = renderToStaticMarkup(
  React.createElement(ReactMarkdown, { remarkPlugins, rehypePlugins }, body),
);

/** [description, assertion] pairs — `false` means the contract is broken. */
const checks = [
  ["centered image renders", html.includes("5ca2e8f6c72f3d543dd3dc95b706964c5678d80e.png")],
  // Author-supplied sizing and alt text are part of the stock allowlist; a
  // narrower schema would quietly lose both (every icon row of every body).
  ["image alt text survives sanitization", html.includes('alt="Sodium 0.4 Comparison"')],
  ["image width survives sanitization", html.includes('width="150"')],
  ["center tag is preserved", html.includes("<center>") && html.includes("</center>")],
  ["margin paragraph kept", /<p>\s*<\/p>/.test(html)],
  ["html comment stripped", !html.includes("load bearing")],
  ["script element stripped", !html.includes("<script") && !html.includes("alert('xss')")],
  ["event handler stripped", !html.includes("onerror")],
  // The literal text "javascript:..." is harmless — what must never survive
  // is a href/src actually carrying the protocol. So: every href and src in
  // the output has to be an allowed protocol (or a relative URL).
  [
    "every href/src uses an allowed protocol",
    [...html.matchAll(/\s(?:href|src)\s*=\s*"([^"]*)"/gi)].every(([_, url]) =>
      /^(?:https?:|mailto:|\/|#|\.\.?\/|[^:]*$)/i.test(url),
    ),
  ],
  ["inline style stripped", !html.includes("style=")],
  ["raw html is not escaped as text", !html.includes("&lt;img") && !html.includes("&lt;center")],
  ["markdown heading renders", html.includes("<h1")],
  ["markdown link renders", html.includes('href="https://example.com"')],
  ["gfm table renders", html.includes("<table")],
  ["gfm task list renders", html.includes('type="checkbox"')],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? "  ok" : "FAIL"}  ${name}`);
  if (!ok) failed += 1;
}

console.log(`\n${checks.length - failed}/${checks.length} markdown checks passed`);
if (failed > 0) process.exit(1);
