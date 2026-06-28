"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import type { Element } from "hast";
import CodeBlock from "./CodeBlock";

/** Walk a HAST node and concatenate raw text values (for line numbers + copy). */
function nodeToText(node: Element | undefined): string {
  if (!node) return "";
  const walk = (n: unknown): string => {
    if (!n || typeof n !== "object") return "";
    const v = (n as { value?: unknown }).value;
    if (typeof v === "string") return v;
    const children = (n as { children?: unknown[] }).children;
    if (Array.isArray(children)) return children.map(walk).join("");
    return "";
  };
  return walk(node);
}

// Defined outside the component so the object reference is stable across renders.
// An inline object would be a new reference every render, causing react-markdown
// to re-process and re-render repeatedly (triggering Iconify's internal useEffect
// setState loop → "Maximum update depth exceeded").
const MD_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>["components"] = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, node }) => {
    const match = /language-(\w+)/.exec(className || "");
    if (match) {
      return (
        <CodeBlock lang={match[1]} code={nodeToText(node as Parameters<typeof nodeToText>[0])}>
          {children}
        </CodeBlock>
      );
    }
    return <code className="prose-code">{children}</code>;
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  ),
};

export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm text-zinc-300 leading-relaxed space-y-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_strong]:text-zinc-100 [&_strong]:font-medium [&_a]:text-indigo-400 [&_a]:underline [&_h1]:text-base [&_h1]:font-semibold [&_h1]:text-zinc-100 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:text-zinc-100 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-zinc-200 [&_blockquote]:border-l-2 [&_blockquote]:border-zinc-700 [&_blockquote]:pl-3 [&_blockquote]:text-zinc-400 [&_table]:w-full [&_th]:text-left [&_th]:text-zinc-400 [&_th]:font-medium [&_th]:py-1 [&_th]:pr-3 [&_td]:py-1 [&_td]:pr-3 [&_hr]:border-zinc-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={MD_COMPONENTS}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}