import type { CSSProperties } from "react";

/**
 * Minecraft skin sheets are always 64px wide, and the head's front face is an
 * 8x8 block of pixels starting at (8, 8).
 */
const SHEET_WIDTH = 64;
const HEAD_SIZE = 8;

/** Where the head's front face and its outer "hat" layer begin, in pixels. */
const FACE = { x: 8, y: 8 };
const HAT = { x: 40, y: 8 };

/** Legacy (pre-1.8) sheets are 64x32 and have no hat layer. */
const LEGACY_HEIGHT = 32;

/**
 * `background-position` for one axis, as a percentage.
 *
 * Percentages resolve against (box - sheet), i.e. the image is displaced by
 * `p% * (box - sheet)`. Source pixel `px` renders `px * box / HEAD_SIZE` into
 * the image and must land on the box's edge, so
 *
 *     p * (box - sheet) = -px * box / HEAD_SIZE
 *
 * which rearranges to the expression below, with `boxes` standing for how many
 * head-sized boxes the sheet renders across that axis.
 */
function axisOffset(sourcePx: number, sheetPx: number, boxes: number): number {
  return (100 * sourcePx * boxes) / (sheetPx * (boxes - 1));
}

/**
 * Crop a Minecraft skin sheet down to a head, as a `background-image` style.
 *
 * The front face is composited with the outer "hat" layer, because hair, hoods
 * and helmets live there and are drawn over the face in-game — cropping only
 * the face would flatten every skin that uses it. Legacy 64x32 sheets are the
 * exception: their right half is a mirror of the left rather than a hat, so
 * only the face is used there.
 *
 * Everything is expressed in percentages so one rule works at any avatar size.
 * `sheetHeight` comes from the preloaded image rather than a guess, because it
 * is what tells the two sheet layouts apart; pass `null` while it is still
 * unknown to assume the modern one.
 */
export function headCrop(sheetUrl: string, sheetHeight: number | null): CSSProperties {
  // Anything under 32px cannot be a skin sheet, so assume the modern square
  // one rather than risk dividing by zero below.
  const height = sheetHeight !== null && sheetHeight >= LEGACY_HEIGHT ? sheetHeight : SHEET_WIDTH;
  const widthBoxes = SHEET_WIDTH / HEAD_SIZE;
  const heightBoxes = height / HEAD_SIZE;
  const size = `${widthBoxes * 100}% ${heightBoxes * 100}%`;

  const face = `${axisOffset(FACE.x, SHEET_WIDTH, widthBoxes)}% ${axisOffset(
    FACE.y,
    height,
    heightBoxes,
  )}%`;

  // Legacy sheets have no hat layer; their right half mirrors the left.
  if (height <= LEGACY_HEIGHT) {
    return {
      backgroundImage: `url("${sheetUrl}")`,
      backgroundSize: size,
      backgroundPosition: face,
      backgroundRepeat: "no-repeat",
    };
  }

  // CSS paints the first layer of each list on top, so the hat is listed
  // first — which is also the order the game draws them in.
  const hat = `${axisOffset(HAT.x, SHEET_WIDTH, widthBoxes)}% ${axisOffset(
    HAT.y,
    height,
    heightBoxes,
  )}%`;

  return {
    backgroundImage: `url("${sheetUrl}"), url("${sheetUrl}")`,
    backgroundSize: `${size}, ${size}`,
    backgroundPosition: `${hat}, ${face}`,
    backgroundRepeat: "no-repeat, no-repeat",
  };
}

// ---------------------------------------------------------------------------
// Rendered heads
// ---------------------------------------------------------------------------

/** The service that renders a player's head from their username. */
const HEAD_SERVICE = "https://skinmc.net/api/v1/face/username";

/** Edge length of a rendered head, in pixels. */
const DEFAULT_FACE_SIZE = 600;

/**
 * A rendered front view of a player's head.
 *
 * Rendered by the service rather than cropped out of the sheet in CSS: it
 * composites the hat layer for us and only needs a username, so it also covers
 * accounts whose texture the launcher never managed to fetch. The size is the
 * square edge in pixels — 600 keeps the head crisp at every size Aether draws
 * it, from the account menu up to a full profile view.
 */
export function faceUrl(username: string, size: number = DEFAULT_FACE_SIZE): string {
  return `${HEAD_SERVICE}/${encodeURIComponent(username)}/${size}`;
}
