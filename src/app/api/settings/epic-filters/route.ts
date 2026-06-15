import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped /epics filter bar selection (BRDG-343). Permissive + passthrough
// so legacy/added fields survive a round-trip (mirrors saved-views tolerance).
const SETTING_KEY = "epic_filters";

const schema = z
  .object({
    teams: z.array(z.string().max(100)).max(100).optional(),
    noTeam: z.boolean().optional(),
    statuses: z.array(z.string().max(50)).max(50).optional(),
  })
  .passthrough();

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, schema, {});
