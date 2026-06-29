import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped timestamp of the PO's last inbox visit (BRDG-434). Stored per
// user so the "new since last visit" markers follow the account across devices,
// rather than being device-local. An ISO datetime, or null when never visited.
const SETTING_KEY = "inbox_last_viewed";

const schema = z.string().datetime().nullable();

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, schema, null);
