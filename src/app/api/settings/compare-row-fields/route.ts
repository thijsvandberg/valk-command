import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";
import { DEFAULT_VISIBLE_TAGS } from "@/components/sprint-board/filter-bar-types";

// Account-scoped Compare-view inline row fields. Kept independent from the main
// sprint board's row fields ("sprint_board_row_fields") so toggling badges in the
// Compare view only affects that view. Default matches the board default.
const SETTING_KEY = "compare_row_fields";

const schema = z.array(z.string().max(50)).max(50);

export const { GET, PUT } = createUserJsonSettingRoute(
  SETTING_KEY,
  schema,
  [...DEFAULT_VISIBLE_TAGS],
);
