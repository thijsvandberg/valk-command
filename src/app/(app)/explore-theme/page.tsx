import type { Metadata } from "next";
import { ThemeExplorer } from "./ThemeExplorer";

export const metadata: Metadata = { title: "Theme Explorer" };

export default function ExploreThemePage() {
  return <ThemeExplorer />;
}
