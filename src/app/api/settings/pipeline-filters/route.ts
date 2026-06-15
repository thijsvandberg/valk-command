import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped /pipelines filter bar selection (BRDG-343). Permissive +
// passthrough so legacy/added fields survive a round-trip.
const SETTING_KEY = "pipeline_filters";

const schema = z
  .object({
    sprints: z.array(z.string().max(100)).max(200).optional(),
    creators: z.array(z.string().max(100)).max(200).optional(),
    status: z.string().max(50).optional(),
    dateRange: z.string().max(50).optional(),
    repo: z.string().max(200).nullable().optional(),
    unlinked: z.boolean().optional(),
  })
  .passthrough();

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, schema, {});
