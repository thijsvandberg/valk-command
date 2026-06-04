import { SkeletonLine } from "@/components/shared/Skeleton";

// Content-level fallback for settings sub-pages. The settings layout (header and
// tab bar) stays mounted while the page resolves, so only the inner form area
// swaps. Rendered inside the layout's max-w-2xl content column.
export default function SettingsLoading() {
  return (
    <div className="space-y-8">
      {[0, 1, 2].map((section) => (
        <div key={section} className="space-y-3">
          <SkeletonLine width="w-40" height="h-4" />
          <SkeletonLine width="w-full" height="h-9" />
          <SkeletonLine width="w-2/3" height="h-3" />
        </div>
      ))}
    </div>
  );
}
