import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped "hide deprecated subtasks" toggle (BRDG-343).
const SETTING_KEY = "subtask_hide_deprecated";

const schema = z.boolean();

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, schema, true);
