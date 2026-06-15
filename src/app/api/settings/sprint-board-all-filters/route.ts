import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped All-view filter set (BRDG-343). Same shape as the sprint-view
// filters; kept as a separate key so the All view remembers its own selection.
const SETTING_KEY = "sprint_board_all_filters";

const stringArray = z.array(z.string().max(200)).max(500);

const filtersSchema = z
  .object({
    status: stringArray.optional(),
    epic: stringArray.optional(),
    assignee: stringArray.optional(),
    readiness: stringArray.optional(),
    editState: stringArray.optional(),
    issueType: stringArray.optional(),
    gaps: stringArray.optional(),
    team: stringArray.optional(),
    sprint: stringArray.optional(),
  })
  .passthrough();

const DEFAULT = { status: [], epic: [], assignee: [], readiness: [], editState: [], issueType: [], gaps: [], team: [], sprint: [] };

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, filtersSchema, DEFAULT);
