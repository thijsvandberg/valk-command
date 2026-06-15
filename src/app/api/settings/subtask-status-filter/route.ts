import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped subtask status filter ("all" or a Jira status) (BRDG-343).
// Permissive string so a new/renamed status never drops the stored value.
const SETTING_KEY = "subtask_status_filter";

const schema = z.string().max(50);

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, schema, "all");
