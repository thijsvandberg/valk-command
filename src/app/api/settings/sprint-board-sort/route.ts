import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped sprint-board sort (field + direction) (BRDG-343). Permissive
// strings so a new sort field never drops the stored value.
const SETTING_KEY = "sprint_board_sort";

const sortSchema = z.object({
  field: z.string().max(50),
  direction: z.string().max(10),
});

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, sortSchema, {
  field: "rank",
  direction: "asc",
});
