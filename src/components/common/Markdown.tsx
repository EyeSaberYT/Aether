import ReactMarkdown from "react-markdown";

import { system } from "@/lib/api";
import { rehypePlugins, remarkPlugins } from "@/lib/markdown";
import { cn } from "@/lib/utils";

/**
 * Renders a Modrinth project body: Markdown plus the raw HTML those bodies
 * legitimately contain. The plugin pipeline (parse, then sanitize) lives in
 * `src/lib/markdown.ts`; links open in the system browser rather than
 * navigating the launcher's webview.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert",
        "prose-a:text-brand-400 hover:prose-a:text-brand-300",
        "prose-img:rounded-md prose-img:border",
        "prose-headings:mt-4 prose-headings:mb-2 first:prose-headings:mt-0",
        "prose-code:rounded prose-code:px-1 prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-muted prose-pre:text-foreground",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={{
          // Open links externally; in-page anchors keep their default
          // behaviour so a table of contents still scrolls.
          a: ({ href, children: linkText, node: _node, ...props }) => (
            <a
              {...props}
              href={href}
              onClick={(event) => {
                if (!href || href.startsWith("#")) return;
                event.preventDefault();
                void system.openUrl(href);
              }}
            >
              {linkText}
            </a>
          ),
          // Keep a wall of screenshots from blowing out the card width.
          img: ({ node: _node, ...props }) => (
            <img {...props} loading="lazy" className="h-auto max-w-full" />
          ),
          // Wide version/compatibility tables scroll instead of overflowing.
          table: ({ children: tableChildren, node: _node, ...props }) => (
            <div className="overflow-x-auto">
              <table {...props}>{tableChildren}</table>
            </div>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
