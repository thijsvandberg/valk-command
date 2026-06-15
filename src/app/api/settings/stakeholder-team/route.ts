import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped stakeholder-view team selection (null = none) (BRDG-343).
const SETTING_KEY = "stakeholder_team";

const schema = z.string().max(100).nullable();

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, schema, null);
