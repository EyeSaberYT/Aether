import type { Options } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

/**
 * Rendering pipeline for Modrinth project bodies.
 *
 * Modrinth bodies are Markdown with raw HTML mixed in — authors ship
 * `<center>`, `<img>` and tables directly, so the HTML must be parsed
 * (`rehype-raw`) rather than escaped. That is only safe because a sanitizer
 * runs *after* the parse: `rehype-sanitize` applies a GitHub-style allowlist
 * that drops scripts, event handlers, `javascript:` URLs, inline `style` and
 * comments. The order of these two plugins is the security property;
 * `scripts/verify-markdown.mjs` asserts it.
 *
 * `center` is the one addition to the stock allowlist: Modrinth's own editor
 * emits it to centre images, and it is presentational only.
 */

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "center"],
};

export const remarkPlugins: Options["remarkPlugins"] = [remarkGfm];

export const rehypePlugins: Options["rehypePlugins"] = [
  [rehypeRaw],
  [rehypeSanitize, sanitizeSchema],
];
