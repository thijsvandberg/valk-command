import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bridge",
    short_name: "Bridge",
    description: "PO Command Center for Valk Platform",
    start_url: "/",
    display: "standalone",
    // "tabbed" + tab_strip are Chromium-only extensions not in the TS types
    display_override: ["tabbed" as "standalone", "standalone"],
    tab_strip: {
      home_tab: "auto",
    },
    background_color: "#070b12",
    theme_color: "#0c1219",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  } as MetadataRoute.Manifest;
}
