import { NextResponse } from "next/server";
import { executeLocalSearch } from "@/lib/local-search-engine";

export type { LocalSearchResult, ConversationSearchResult, CommentSearchResult, GroupedSearchResponse } from "@/lib/local-search-engine";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  const statusFilter = (searchParams.get("status") ?? "").split(",").map((s) => s.toUpperCase()).filter(Boolean);
  const poStatusFilter = (searchParams.get("poStatus") ?? "").split(",").filter(Boolean);
  const typeFilter = (searchParams.get("type") ?? "").split(",").map((s) => s.toLowerCase()).filter(Boolean);
  const assigneeFilter = (searchParams.get("assignee") ?? "").split(",").filter(Boolean);
  const sprintFilter = (searchParams.get("sprint") ?? "").split(",").filter(Boolean);
  const dateRange = searchParams.get("dateRange");

  if (dateRange?.startsWith("custom:")) {
    const range = dateRange.slice(7);
    const [from, to] = range.split("..");
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    if ((from && !isoDate.test(from)) || (to && !isoDate.test(to))) {
      return NextResponse.json({ error: "Invalid date range format" }, { status: 400 });
    }
  }

  try {
    const result = await executeLocalSearch({
      q,
      statusFilter,
      poStatusFilter,
      typeFilter,
      assigneeFilter,
      sprintFilter,
      dateRange,
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
