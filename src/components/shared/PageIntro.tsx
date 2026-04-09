interface PageIntroProps {
  title: string;
  description?: string;
}

export function PageIntro({ title, description }: PageIntroProps) {
  return (
    <div>
      <h1 className="font-[var(--font-display)] text-3xl font-bold tracking-[-0.03em] text-white">
        {title}
      </h1>
      {description && (
        <p className="mt-2 max-w-lg font-[var(--font-body)] text-base leading-[1.7] text-white/50">
          {description}
        </p>
      )}
    </div>
  );
}
