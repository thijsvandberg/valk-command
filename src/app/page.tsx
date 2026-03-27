export default function Home() {
  return (
    <div className="noise-overlay relative min-h-screen bg-[var(--color-surface-base)] text-white overflow-hidden">
      {/* Background radial gradients for depth */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        <div className="absolute top-[-30%] left-[10%] h-[800px] w-[800px] rounded-full bg-[radial-gradient(circle,var(--color-brand-900)_0%,transparent_70%)] opacity-40" />
        <div className="absolute bottom-[-20%] right-[5%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--color-brand-950)_0%,transparent_70%)] opacity-60" />
        <div className="absolute top-[40%] left-[60%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,var(--color-brand-800)_0%,transparent_70%)] opacity-20" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand-600)]">
            <span className="font-[var(--font-display)] text-sm font-bold tracking-tight text-white">
              V
            </span>
          </div>
          <span className="font-[var(--font-body)] text-sm font-medium tracking-wide text-white/70">
            valk-command
          </span>
        </div>
        <div className="hidden items-center gap-8 sm:flex">
          <span className="font-[var(--font-body)] text-sm text-white/30">
            Features
          </span>
          <span className="font-[var(--font-body)] text-sm text-white/30">
            Docs
          </span>
          <span className="font-[var(--font-body)] text-sm text-white/30">
            Changelog
          </span>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center justify-center px-6 pt-24 pb-32 text-center sm:pt-36 sm:pb-40">
        {/* Badge */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-[var(--color-surface-elevated)] px-4 py-1.5 shadow-[0_1px_3px_rgba(46,145,73,0.08),0_4px_12px_rgba(0,0,0,0.2)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand-400)]" />
          <span className="font-[var(--font-body)] text-xs font-medium tracking-wide text-white/50">
            PO Command Center
          </span>
        </div>

        {/* Title */}
        <h1 className="font-[var(--font-display)] text-5xl font-bold leading-[1.05] tracking-[-0.03em] text-white sm:text-7xl">
          valk-command
        </h1>

        {/* Tagline */}
        <p className="mt-6 max-w-md font-[var(--font-body)] text-lg leading-[1.7] text-white/50 sm:text-xl">
          Your sprint cockpit. Chat, track, test.
        </p>

        {/* CTA */}
        <a
          href="#"
          className="group mt-10 inline-flex items-center gap-2 rounded-xl bg-[var(--color-brand-600)] px-7 py-3.5 font-[var(--font-body)] text-sm font-semibold text-white shadow-[0_2px_8px_rgba(46,145,73,0.25),0_8px_24px_rgba(46,145,73,0.15)] transition-transform transition-shadow duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.03] hover:shadow-[0_4px_12px_rgba(46,145,73,0.35),0_12px_32px_rgba(46,145,73,0.2)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand-400)] active:scale-[0.98] cursor-pointer"
        >
          Get Started
          <svg
            className="h-4 w-4 transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </a>

        {/* Feature hints */}
        <div className="mt-20 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
          {[
            { label: "Sprint Management", desc: "Plan and track your sprints" },
            { label: "AI Chat", desc: "Talk to your agents directly" },
            { label: "Test Oversight", desc: "Monitor quality at a glance" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-white/[0.04] bg-[var(--color-surface-elevated)] px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.3),0_4px_16px_rgba(0,0,0,0.15)] transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-[1.02]"
            >
              <p className="font-[var(--font-body)] text-sm font-medium text-white/80">
                {item.label}
              </p>
              <p className="mt-1 font-[var(--font-body)] text-xs leading-[1.7] text-white/35">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
