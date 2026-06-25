import type { NextConfig } from "next";
import path from "node:path";

const securityHeaders = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-XSS-Protection",
    value: "0",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net https://*.atlassian.com https://*.atl-paas.net https://img.clerk.com",
      "font-src 'self'",
      "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const isProductionBuild = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  distDir: isProductionBuild ? ".next-build" : ".next",
  devIndicators: {
    position: "bottom-right",
  },
  experimental: {
    // App Router route handlers ignore the Pages-Router bodyParser config, so
    // the inbound body size cap is enforced in middleware (see src/middleware.ts).
    // This setting bounds Server Action payloads as a complementary measure.
    serverActions: {
      bodySizeLimit: "1mb",
    },
    optimizePackageImports: [
      "@tiptap/react",
      "@tiptap/core",
      "@tiptap/pm",
      "@tiptap/starter-kit",
      "@tiptap/extension-color",
      "@tiptap/extension-image",
      "@tiptap/extension-link",
      "@tiptap/extension-table",
      "@tiptap/extension-text-style",
      "lucide-react",
      "fuse.js",
      "@dnd-kit/core",
      "@dnd-kit/sortable",
      "@dnd-kit/utilities",
      "prismjs",
      "react-markdown",
      "marked",
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  // instrumentation.ts is compiled for both the Node and Edge runtimes. Its
  // register() eager-inits the DB and reads env, but only behind a
  // NEXT_RUNTIME === "nodejs" guard, so that code never runs in Edge. Webpack
  // (used by `next build`) still traces the dynamic import("@/db") into the Edge
  // bundle, where better-sqlite3's node-only deps (path/fs) cannot resolve and
  // the build fails. Nothing legitimately reachable in the Edge runtime — only
  // middleware, which imports neither — uses these modules, so stub them out for
  // the Edge layer to keep the unreachable boot code from breaking that build.
  webpack(config, { nextRuntime }) {
    if (nextRuntime === "edge") {
      // Alias by both the source request and its resolved absolute path:
      // Next resolves "@/..." via a tsconfig-paths plugin, so the bare-specifier
      // alias alone may be bypassed. `false` makes webpack treat the module as
      // empty for this layer only.
      const emptyForEdge = {
        "@/db$": false as const,
        "@/lib/env$": false as const,
        [path.resolve(__dirname, "src/db/index.ts")]: false as const,
        [path.resolve(__dirname, "src/lib/env.ts")]: false as const,
      };
      config.resolve = config.resolve ?? {};
      config.resolve.alias = { ...(config.resolve.alias ?? {}), ...emptyForEdge };
    }
    return config;
  },
};

export default nextConfig;
