import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped PO priority order per sprint (BRDG-343): maps a sprint id to an
// ordered list of ticket keys. Permissive bounds guard against abuse.
const SETTING_KEY = "sprint_board_po_priority";

const schema = z.record(z.string().max(100), z.array(z.string().max(100)).max(2000));

export const { GET, PUT } = createUserJsonSettingRoute<typeof schema>(SETTING_KEY, schema, {});
