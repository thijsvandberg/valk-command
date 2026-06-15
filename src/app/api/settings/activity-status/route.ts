import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped activity-log status filter ("" = all) (BRDG-343).
const SETTING_KEY = "activity_status";

const schema = z.string().max(100);

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, schema, "");
