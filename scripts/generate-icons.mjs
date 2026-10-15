// Generates the Aether app icons (PNG + ICO + ICNS) with zero dependencies.
//
// The mark is a stylised "A" chevron on a dark rounded square, matching
// `public/aether.svg`. Run with: `node scripts/generate-icons.mjs`
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "icons");

// ---------------------------------------------------------------------------
// Tiny PNG encoder
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

/** Encode raw RGBA pixels as a PNG buffer. */
function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Logo rasteriser
// ---------------------------------------------------------------------------

const BG = [0x0b, 0x0f, 0x14];
const GREEN = [0x17, 0xc0, 0x7c];
const LIGHT_GREEN = [0x3e, 0xd9, 0x98];

/** Signed area / barycentric point-in-triangle test. */
function inTriangle(px, py, a, b, c) {
  const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
  const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
  const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Colour of a single sample point in normalised [0,1] space, or null for clear. */
function sample(x, y) {
  // Rounded-square background.
  const radius = 0.22;
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  const outside = Math.hypot(x - cx, y - cy) > radius;
  if (outside) return null;

  // Outer chevron (the "A").
  const outer = [
    [0.5, 0.18],
    [0.86, 0.83],
    [0.14, 0.83],
  ];
  const inner = [
    [0.5, 0.44],
    [0.66, 0.83],
    [0.34, 0.83],
  ];

  if (inTriangle(x, y, ...outer)) {
    if (inTriangle(x, y, ...inner)) return BG;
    // Top half lighter for a subtle gradient.
    return y < 0.5 ? LIGHT_GREEN : GREEN;
  }
  return BG;
}

/** Render a `size x size` RGBA buffer with 3x3 supersampling. */
function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const samples = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          const colour = sample(x, y);
          if (colour) {
            r += colour[0];
            g += colour[1];
            b += colour[2];
            a += 255;
          }
        }
      }
      const total = samples * samples;
      const offset = (py * size + px) * 4;
      const alpha = a / total;
      // Premultiply-safe averaging: divide colour by covered samples only.
      const covered = a / 255 || 1;
      rgba[offset] = Math.round(r / covered);
      rgba[offset + 1] = Math.round(g / covered);
      rgba[offset + 2] = Math.round(b / covered);
      rgba[offset + 3] = Math.round(alpha);
    }
  }
  return rgba;
}

// ---------------------------------------------------------------------------
// Container writers
// ---------------------------------------------------------------------------

/** ICO container holding PNG-compressed frames. */
function encodeIco(frames) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let offset = 6 + frames.length * 16;
  const entries = [];
  const blobs = [];
  for (const { size, png } of frames) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32BE(0, 8);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    blobs.push(png);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...blobs]);
}

/** ICNS container holding PNG-compressed frames. */
function encodeIcns(frames) {
  const bodies = frames.map(({ type, png }) => {
    const header = Buffer.alloc(8);
    header.write(type, 0, 4, "ascii");
    header.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([header, png]);
  });
  const total = 8 + bodies.reduce((sum, body) => sum + body.length, 0);
  const header = Buffer.alloc(8);
  header.write("icns", 0, 4, "ascii");
  header.writeUInt32BE(total, 4);
  return Buffer.concat([header, ...bodies]);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

const png = (size) => encodePng(size, render(size));

const targets = [
  ["32x32.png", 32],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["icon.png", 512],
  ["Square30x30Logo.png", 30],
  ["Square44x44Logo.png", 44],
  ["Square71x71Logo.png", 71],
  ["Square89x89Logo.png", 89],
  ["Square107x107Logo.png", 107],
  ["Square142x142Logo.png", 142],
  ["Square150x150Logo.png", 150],
  ["Square284x284Logo.png", 284],
  ["Square310x310Logo.png", 310],
  ["StoreLogo.png", 50],
];

for (const [name, size] of targets) {
  writeFileSync(join(OUT_DIR, name), png(size));
}

writeFileSync(
  join(OUT_DIR, "icon.ico"),
  encodeIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: png(size) }))),
);

writeFileSync(
  join(OUT_DIR, "icon.icns"),
  encodeIcns([
    { type: "ic07", png: png(128) },
    { type: "ic08", png: png(256) },
    { type: "ic09", png: png(512) },
    { type: "ic10", png: png(1024) },
    { type: "ic11", png: png(32) },
    { type: "ic12", png: png(64) },
    { type: "ic13", png: png(256) },
    { type: "ic14", png: png(512) },
  ]),
);

console.log(`Wrote ${targets.length + 2} icon files to ${OUT_DIR}`);
