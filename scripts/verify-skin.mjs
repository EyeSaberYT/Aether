#!/usr/bin/env node
/**
 * Verifies `src/lib/skin.ts` against the CSS background positioning spec it
 * targets.
 *
 * The head crop is pure arithmetic over a spec that is easy to get subtly
 * wrong (percentages resolve against box - sheet, not the sheet), and nothing
 * about a rendered avatar makes the error obvious, so it is checked here
 * instead: every layer must land exactly on the avatar's edges, uniformly
 * scaled, at a spread of sizes — and legacy sheets must not pick up a hat
 * layer, whose source region mirrors the left half of the sheet rather than
 * holding a hat.
 *
 * Run with `npm test`. Exits non-zero on the first failed assertion group.
 */

import { readFile } from "node:fs/promises";
import ts from "typescript";

/**
 * Transpile the module with the project's own TypeScript so this script can
 * import it without a build step or an undeclared dependency. `import type` is
 * always erased, so nothing reaches out for React at runtime.
 */
async function loadHeadCrop() {
  const url = new URL("../src/lib/skin.ts", import.meta.url);
  const source = await readFile(url, "utf8");
  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: url.pathname,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const errors = (diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    const text = errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")).join("\n");
    throw new Error(`src/lib/skin.ts failed to transpile:\n${text}`);
  }

  const asDataUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
  return (await import(asDataUrl)).headCrop;
}

/** Split a `background-position`/`background-size` shorthand list into layers. */
function parseLayers(css) {
  const sizes = css.backgroundSize.split(",").map((value) => value.trim());
  const positions = css.backgroundPosition.split(",").map((value) => value.trim());
  const images = css.backgroundImage.split(",").map((value) => value.trim());
  if (sizes.length !== positions.length || sizes.length !== images.length) {
    throw new Error(`background layers disagree in length: ${JSON.stringify(css)}`);
  }
  return images.map((image, i) => ({ image, size: sizes[i], position: positions[i] }));
}

/** Percentages in a background shorthand are suffixed, so read them leniently. */
function percentages(shorthand) {
  return shorthand.split(/\s+/).map((token) => parseFloat(token));
}

/** Reproduce the CSS background positioning spec for one source pixel. */
function map(layer, box, sheet, sourceX, sourceY) {
  const [widthPct, heightPct] = percentages(layer.size);
  const [leftPct, topPct] = percentages(layer.position);
  const imageWidth = (widthPct / 100) * box;
  const imageHeight = (heightPct / 100) * box;
  const offsetX = (leftPct / 100) * (box - imageWidth);
  const offsetY = (topPct / 100) * (box - imageHeight);
  return {
    x: offsetX + sourceX * (imageWidth / sheet.width),
    y: offsetY + sourceY * (imageHeight / sheet.height),
    scaleX: imageWidth / sheet.width,
    scaleY: imageHeight / sheet.height,
  };
}

const SHEET = "https://textures.minecraft.net/texture/abc123";
const SIZES = [20, 24, 32, 36, 40, 48, 64, 96, 128];

let checks = 0;
const failures = [];

function expectEqual(label, actual, expected) {
  checks += 1;
  // NaN must never satisfy a check: `Math.abs(NaN) > tolerance` is false, so a
  // bad parse would otherwise look like a pass.
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > 1e-6) {
    failures.push(`${label}: got ${actual}, want ${expected}`);
  }
}

function expectTrue(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? `: ${detail}` : ""}`);
}

const headCrop = await loadHeadCrop();

// CSS paints the FIRST listed layer on top, and the hat must be that layer —
// otherwise the face hides it and skins with hair render flat. Legacy sheets
// get one layer only: x=40 on a 64x32 sheet is the mirrored back of the head.
const cases = [
  { name: "modern 64x64", sheet: { width: 64, height: 64 }, blocks: [40, 8] },
  { name: "legacy 64x32", sheet: { width: 64, height: 32 }, blocks: [8] },
];

for (const testCase of cases) {
  for (const box of SIZES) {
    const layers = parseLayers(headCrop(SHEET, testCase.sheet.height));
    expectTrue(
      `${testCase.name}@${box} layer count`,
      layers.length === testCase.blocks.length,
      `got ${layers.length}, want ${testCase.blocks.length}`,
    );
    if (layers.length !== testCase.blocks.length) continue;

    layers.forEach((layer, index) => {
      const sourceX = testCase.blocks[index];
      const top = map(layer, box, testCase.sheet, sourceX, 8);
      const bottom = map(layer, box, testCase.sheet, sourceX + 8, 16);
      expectEqual(`${testCase.name}@${box} L${index} left`, top.x, 0);
      expectEqual(`${testCase.name}@${box} L${index} top`, top.y, 0);
      expectEqual(`${testCase.name}@${box} L${index} right`, bottom.x, box);
      expectEqual(`${testCase.name}@${box} L${index} bottom`, bottom.y, box);
      expectEqual(
        `${testCase.name}@${box} L${index} uniform scale (no distortion)`,
        top.scaleX,
        top.scaleY,
      );
      expectTrue(
        `${testCase.name}@${box} L${index} texture url`,
        layer.image.includes(SHEET),
        layer.image,
      );
    });
  }
}

// Unknown heights stand in for "not decoded yet" and must assume modern.
expectTrue(
  "null height behaves as modern",
  JSON.stringify(headCrop(SHEET, null)) === JSON.stringify(headCrop(SHEET, 64)),
);
// Degenerate heights must clamp rather than divide by zero.
expectTrue("height 0 clamps to modern", parseLayers(headCrop(SHEET, 0)).length === 2);
expectTrue("height 16 clamps to modern", parseLayers(headCrop(SHEET, 16)).length === 2);

// The legacy mirror region (x=40) must fall outside the box, not over the face.
const legacy = parseLayers(headCrop(SHEET, 32));
const legacyBox = 36;
expectTrue("legacy has exactly one layer", legacy.length === 1);
if (legacy.length === 1) {
  const sheet = { width: 64, height: 32 };
  expectTrue(
    "legacy mirror region falls outside the box",
    map(legacy[0], legacyBox, sheet, 40, 8).x >= legacyBox,
  );
  expectEqual("legacy face lands on the origin", map(legacy[0], legacyBox, sheet, 8, 8).x, 0);
}

if (failures.length > 0) {
  console.error(`skin crop: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`skin crop: ${checks} checks passed`);
