/**
 * Pure (no-I/O) Bitbucket deploy-detection heuristics, shared by `bitbucket-client.ts`
 * (ticket dev-info) and `pipeline-sync.ts` (background deploy classification). Previously
 * each file carried its own slightly-divergent copy of environment detection and the
 * deploy-step classifier — a correctness hazard (BRDG-379). This is the single source.
 */

export type EnvType = "Production" | "Staging" | "Test";

/**
 * Order matters: production wins, then a specific UAT number (any N, space/-/_ separators,
 * covers uat-4), then generic staging, then test. This is the superset of the two former
 * copies — `bitbucket-client` only handled UAT1/2/3, which silently missed higher UAT envs.
 */
export function detectEnvironment(text: string): { environment: string; type: EnvType } | null {
  if (/prod(uction)?/i.test(text)) return { environment: "Production", type: "Production" };
  const uat = text.match(/uat[\s_-]*(\d+)/i);
  if (uat) return { environment: `UAT${uat[1]}`, type: "Staging" };
  if (/staging/i.test(text)) return { environment: "Staging", type: "Staging" };
  if (/test/i.test(text)) return { environment: "Test", type: "Test" };
  return null;
}

/**
 * Infer a deployment environment from a branch name, restricted to the staging deploy
 * convention (`staging/...` or exactly `staging`). Some repos auto-deploy on these branches
 * via GitOps with no `deploy` step in the pipeline, so the branch is the only signal. The
 * restriction prevents ordinary feature branches that merely contain "uat"/"test" from being
 * misread as deployments (BRDG-257).
 */
export function inferEnvironmentFromBranch(branch: string): { environment: string; type: EnvType } | null {
  const b = branch.toLowerCase();
  if (b !== "staging" && !b.startsWith("staging/")) return null;
  return detectEnvironment(branch) ?? { environment: "Staging", type: "Staging" };
}

/**
 * Pure deployment classifier: given a pipeline's steps, return the deployment
 * environment if any step is a deploy step matching an environment pattern.
 * Single source of truth for the deploy-step heuristic; no I/O so it is unit-testable.
 */
export function classifyStepsForDeployment(
  steps: Array<{ name: string }>,
): { environment: string; type: EnvType } | null {
  let detectedEnv: { environment: string; type: EnvType } | null = null;
  for (const step of steps) {
    const envFromStep = detectEnvironment(step.name);
    if (envFromStep) detectedEnv = envFromStep;
    const lower = step.name.toLowerCase();
    if (lower.includes("deploy") && !lower.includes("set build") && detectedEnv) {
      return detectedEnv;
    }
  }
  return null;
}

export function shortRepoName(slug: string): string {
  return slug.replace(/^valk-/, "");
}
