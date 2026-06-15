import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped activity-log type filter (BRDG-343).
const SETTING_KEY = "activity_types";

const schema = z.array(z.string().max(100)).max(100);

export const { GET, PUT } = createUserJsonSettingRoute<typeof schema>(SETTING_KEY, schema, []);
