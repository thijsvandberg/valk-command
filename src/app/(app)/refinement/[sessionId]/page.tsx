"use client";

import { use, Suspense, useCallback } from "react";
import { useRouter } from "next/navigation";
import { RefinementPageContent } from "@/components/refinement-session/RefinementPageContent";

export default function RefinementSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  return (
    <Suspense>
      <RefinementSessionWrapper sessionId={sessionId} />
    </Suspense>
  );
}

function RefinementSessionWrapper({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  const handleSessionChange = useCallback(
    (id: string) => {
      router.push(`/refinement/${id}`);
    },
    [router],
  );

  return (
    <RefinementPageContent
      initialSessionId={sessionId}
      onSessionChange={handleSessionChange}
    />
  );
}
