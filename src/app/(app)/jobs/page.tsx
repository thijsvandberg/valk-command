export default function JobsPage() {
  return (
    <div className="noise-overlay relative min-h-full">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute top-[-20%] left-[15%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--color-brand-900)_0%,transparent_70%)] opacity-30" />
        <div className="absolute bottom-[-10%] right-[10%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,var(--color-brand-950)_0%,transparent_70%)] opacity-50" />
      </div>

      <div className="relative z-10 px-8 py-8 lg:px-12 lg:py-10">
        <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white">
          Scheduled Jobs
        </h1>
        <p className="mt-2 max-w-lg font-[var(--font-body)] text-base leading-[1.7] text-white/50">
          Manage recurring workspace tasks and scheduled automation jobs for the remote agent.
        </p>
      </div>
    </div>
  );
}
