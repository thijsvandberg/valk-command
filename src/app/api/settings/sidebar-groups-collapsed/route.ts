import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped chat-sidebar collapsed group labels (BRDG-343). Stored as a
// string[] of group labels; the client reconstructs a Set.
const SETTING_KEY = "sidebar_groups_collapsed";

const schema = z.array(z.string().max(100)).max(100);

export const { GET, PUT } = createUserJsonSettingRoute<typeof schema>(SETTING_KEY, schema, []);
