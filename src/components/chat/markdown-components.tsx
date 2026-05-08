import type { Components } from "react-markdown";

export const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 font-[var(--font-display)] text-base font-semibold tracking-[-0.02em] text-text-primary first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 font-[var(--font-display)] text-sm font-semibold tracking-[-0.01em] text-text-primary first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 font-[var(--font-display)] text-sm font-semibold text-text-primary first:mt-0">
      {children}
    </h3>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-2 space-y-1 pl-4 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-4 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="relative pl-2 before:absolute before:left-[-0.75rem] before:text-text-tertiary before:content-['–']">
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
  em: ({ children }) => <em className="italic text-text-secondary">{children}</em>,
  code: ({ children }) => (
    <code className="rounded bg-overlay-default px-1.5 py-0.5 font-mono text-xs text-[var(--color-brand-300)]">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-overlay-default p-3 font-mono text-xs last:mb-0">
      {children}
    </pre>
  ),
  hr: () => <hr className="my-3 border-border-strong" />,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2 last:mb-0">
      <table className="min-w-full text-xs border-collapse">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border-b border-border-strong px-3 py-1.5 text-left text-label font-semibold text-text-secondary uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border-subtle px-3 py-1.5 text-text-secondary">
      {children}
    </td>
  ),
};
