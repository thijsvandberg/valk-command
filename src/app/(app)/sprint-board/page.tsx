export default function SprintBoardPage() {
  return (
    <div className="px-8 py-8 lg:px-12 lg:py-10">
      <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white">
        Sprint Board
      </h1>
      <p className="mt-2 max-w-lg font-[var(--font-body)] text-base leading-[1.7] text-white/50">
        Jira tickets with PO metadata: readiness scores, notes, and status.
      </p>
    </div>
  );
}
