import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped epic children list/sprint view toggle (BRDG-343).
const SETTING_KEY = "epic_children_view";

const schema = z.enum(["list", "sprint"]);

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, schema, "list");
