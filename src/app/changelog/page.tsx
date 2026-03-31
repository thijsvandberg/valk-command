import Link from "next/link";
import changelogData from "@/data/changelog.json";
import type { ChangelogGroup } from "@/types/changelog";

const changelog = changelogData as ChangelogGroup[];

const CATEGORY_COLORS: Record<string, string> = {
  New: "bg-[var(--color-brand-600)]/20 text-[var(--color-brand-300)] border-[var(--color-brand-600)]/30",
  Fixed: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  Improved: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  Documentation: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  Maintenance: "bg-white/5 text-white/50 border-white/10",
  Testing: "bg-teal-500/10 text-teal-400 border-teal-500/20",
  Other: "bg-white/5 text-white/40 border-white/10",
};

function formatDate(dateStr: string) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function ChangelogPage() {
  return (
    <div className="noise-overlay relative min-h-screen bg-[var(--color-surface-base)] text-white overflow-hidden">
      {/* Background radial gradients */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <div className="absolute top-[-20%] left-[20%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--color-brand-900)_0%,transparent_70%)] opacity-30" />
        <div className="absolute bottom-[-10%] right-[10%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,var(--color-brand-950)_0%,transparent_70%)] opacity-40" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity duration-200 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] cursor-pointer"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-600)]">
            <span className="font-[var(--font-display)] text-sm font-bold tracking-tight text-white">
              V
            </span>
          </div>
          <span className="font-[var(--font-body)] text-sm font-medium tracking-wide text-white/70">
            valk-command
          </span>
        </Link>
        <Link
          href="/"
          className="font-[var(--font-body)] text-sm text-white/30 transition-colors duration-200 hover:text-white/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] cursor-pointer"
        >
          Back to home
        </Link>
      </nav>

      {/* Content */}
      <main className="relative z-10 mx-auto max-w-2xl px-6 pt-12 pb-24 sm:px-10 sm:pt-16">
        <header className="mb-12">
          <h1 className="font-[var(--font-display)] text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
            Changelog
          </h1>
          <p className="mt-4 font-[var(--font-body)] text-base leading-[1.7] text-white/50">
            What has been shipped, fixed, and improved.
          </p>
        </header>

        {changelog.length === 0 ? (
          <p className="font-[var(--font-body)] text-sm text-white/30">
            No entries yet. Changes will appear here after the first merge.
          </p>
        ) : (
          <div className="space-y-12">
            {changelog.map((group) => (
              <section key={group.date}>
                <h2 className="mb-6 font-[var(--font-display)] text-lg font-semibold tracking-tight text-white/80">
                  {formatDate(group.date)}
                </h2>
                <div className="space-y-3">
                  {group.entries.map((entry) => (
                    <article
                      key={entry.hash}
                      className="group rounded-xl border border-white/[0.06] bg-[var(--color-surface-elevated)] px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.3),0_4px_16px_rgba(0,0,0,0.15)]"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 font-[var(--font-body)] text-[11px] font-medium tracking-wide ${CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.Other}`}
                        >
                          {entry.category}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-[var(--font-body)] text-sm leading-relaxed text-white/80">
                            {entry.description}
                          </p>
                          {entry.longDescription && (
                            <p className="mt-1.5 font-[var(--font-body)] text-xs leading-[1.7] text-white/35">
                              {entry.longDescription}
                            </p>
                          )}
                          <a
                            href={entry.commitUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-block font-[var(--font-body)] text-xs font-mono text-white/20 transition-colors duration-200 hover:text-[var(--color-brand-400)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] cursor-pointer"
                          >
                            {entry.shortHash}
                          </a>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
