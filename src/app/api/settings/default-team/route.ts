import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";
import { TEAMS } from "@/lib/sprint-utils";

// Account-scoped "default team": the PO's own team (BT/BM/BO/GXP/HT), or null
// when none is chosen. This is the single source of truth for "which team is
// mine", consumed by the New stories inbox (BRDG-356) to sort the PO's own
// team to the top. Built on the BRDG-343 user-scoped foundation so it follows
// the Clerk account across browsers, ports, and devices.
const SETTING_KEY = "default_team";

const schema = z.enum(TEAMS).nullable();

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, schema, null);
