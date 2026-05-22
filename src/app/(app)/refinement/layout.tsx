import { RefinementSessionProvider } from "@/contexts/RefinementSessionContext";

export default function RefinementLayout({ children }: { children: React.ReactNode }) {
  return <RefinementSessionProvider>{children}</RefinementSessionProvider>;
}
