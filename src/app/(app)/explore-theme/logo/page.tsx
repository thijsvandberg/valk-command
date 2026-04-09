import type { Metadata } from "next";
import { LogoExplorer } from "./LogoExplorer";

export const metadata: Metadata = { title: "Logo Explorer" };

export default function LogoExplorerPage() {
  return <LogoExplorer />;
}
