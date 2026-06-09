import { renderAppIcon } from "@/lib/app-icon";

export const runtime = "nodejs";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  // Full-bleed square: iOS applies its own squircle mask and renders transparent
  // corners as black, so we don't round the tile ourselves.
  return renderAppIcon(180, { rounded: false });
}
