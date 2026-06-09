import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  // Dev (port 3100) and prod (port 3101) run the same checkout; branch the
  // installed-app name and colours so the two PWAs are distinguishable.
  const isDev = process.env.NODE_ENV !== "production";
  const name = isDev ? "Bridge (dev)" : "Bridge";
  // Match the icon: dev is a light tile, prod the dark brand tile.
  const backgroundColor = isDev ? "#f4f5f5" : "#021a19";
  const themeColor = isDev ? "#14a8a3" : "#021a19";

  return {
    name,
    short_name: name,
    description: "PO Command Center for Valk Platform",
    start_url: "/",
    display: "standalone",
    // "tabbed" + tab_strip are Chromium-only extensions not in the TS types
    display_override: ["tabbed" as "standalone", "standalone"],
    tab_strip: {
      home_tab: "auto",
    },
    background_color: backgroundColor,
    theme_color: themeColor,
    icons: [
      {
        src: "/app-icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/app-icon?size=512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/app-icon?size=192&maskable=1",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/app-icon?size=512&maskable=1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  } as MetadataRoute.Manifest;
}
