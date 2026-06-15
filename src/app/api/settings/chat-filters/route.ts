import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped chat conversation-category filters (BRDG-343).
// Permissive strings so a renamed/added category never drops the stored value.
const SETTING_KEY = "chat_filters";

const schema = z.array(z.string().max(50)).max(50);

export const { GET, PUT } = createUserJsonSettingRoute<typeof schema>(SETTING_KEY, schema, []);
