import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped New story inbox filter set (BRDG-357). Independent of the sprint
// board filter keys so the board's filters are never affected. Only the inbox
// whitelist categories are stored; passthrough keeps any future field on a
// round-trip.
const SETTING_KEY = "inbox_filters";

const stringArray = z.array(z.string().max(200)).max(500);

const filtersSchema = z
  .object({
    status: stringArray.optional(),
    epic: stringArray.optional(),
    assignee: stringArray.optional(),
    creator: stringArray.optional(),
    issueType: stringArray.optional(),
    team: stringArray.optional(),
    sprint: stringArray.optional(),
  })
  .passthrough();

const DEFAULT = { status: [], epic: [], assignee: [], creator: [], issueType: [], team: [], sprint: [] };

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, filtersSchema, DEFAULT);
