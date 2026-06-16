import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

const SETTING_KEY = "sprint_board_backlog_drop_target";

// The chosen target is stored as a backlog sprint NAME (e.g. "GXP: Backlog"),
// not a numeric id: the name is stable when Jira re-creates a backlog sprint
// with a new id, and the drop tile already resolves the live sprint by name.
// Default "BT: Backlog" keeps the prior hard-coded behaviour for accounts that
// have never set it (BRDG-346).
const targetSchema = z.string().max(200);

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, targetSchema, "BT: Backlog");
