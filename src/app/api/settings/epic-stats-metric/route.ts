import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped epic stats metric toggle (items / story points / business value) (BRDG-343).
const SETTING_KEY = "epic_stats_metric";

const schema = z.enum(["items", "sp", "bv"]);

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, schema, "items");
