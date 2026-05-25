"use client";

import { Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefinementPageContent } from "@/components/refinement-session/RefinementPageContent";

export default function RefinementPage() {
  return (
    <Suspense>
      <RefinementPageWrapper />
    </Suspense>
  );
}

function RefinementPageWrapper() {
  const router = useRouter();

  const handleSessionChange = useCallback(
    (id: string) => {
      router.push(`/refinement/${id}`);
    },
    [router],
  );

  return (
    <RefinementPageContent onSessionChange={handleSessionChange} />
  );
}
