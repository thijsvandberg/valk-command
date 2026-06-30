import type { Instrumentation } from "next";

// Instrumentation is bundled for BOTH the Node and Edge runtimes. All the
// Node-only logic (process crash handlers, eager DB init, the server logger that
// pulls in node:async_hooks) lives in ./instrumentation-node and is reached only
// through the dynamic imports below, gated on NEXT_RUNTIME === "nodejs". Next
// constant-folds process.env.NEXT_RUNTIME per bundle, so in the Edge bundle the
// branch is statically false and the import (with everything it pulls in) is
// dead-code-eliminated, keeping the Edge runtime free of unsupported Node APIs.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const mod = await import("./instrumentation-node");
  await mod.register();
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const mod = await import("./instrumentation-node");
  mod.onRequestError(error, request, context);
};
