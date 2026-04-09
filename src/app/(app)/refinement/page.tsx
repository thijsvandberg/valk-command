import type { Metadata } from "next";
import { PageIntro } from "@/components/shared/PageIntro";

export const metadata: Metadata = { title: "Refinement" };

export default function RefinementPage() {
  return (
    <div className="noise-overlay relative min-h-full">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute top-[-20%] left-[15%] h-[600px] w-[600px] rounded-full bg-[radial-gradient(circle,var(--color-brand-900)_0%,transparent_70%)] opacity-30" />
        <div className="absolute bottom-[-10%] right-[10%] h-[400px] w-[400px] rounded-full bg-[radial-gradient(circle,var(--color-brand-950)_0%,transparent_70%)] opacity-50" />
      </div>

      <div className="relative z-10 px-8 py-8 lg:px-12 lg:py-10">
        <PageIntro
          title="Refinement"
          description="Backlog preparation view and fullscreen refinement mode for grooming sessions with the team."
        />
      </div>
    </div>
  );
}
