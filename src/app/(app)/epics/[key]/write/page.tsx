"use client";

import { use } from "react";
import { usePageTitle } from "@/hooks/usePageTitle";
import { EpicWriterLayout } from "@/components/epic-writer/EpicWriterLayout";

export default function EpicWriterPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = use(params);
  const pageTitle = usePageTitle(`${key} - Epic Writer`);

  return (
    <>
      {pageTitle}
      <div className="h-full">
        <EpicWriterLayout epicKey={key} />
      </div>
    </>
  );
}
