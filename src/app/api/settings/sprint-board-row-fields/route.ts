import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";
import { DEFAULT_VISIBLE_TAGS } from "@/components/sprint-board/filter-bar-types";

// Account-scoped sprint-board inline row fields (BRDG-343). Default matches the
// client default so an unset value yields the standard visible tags.
const SETTING_KEY = "sprint_board_row_fields";

const schema = z.array(z.string().max(50)).max(50);

export const { GET, PUT } = createUserJsonSettingRoute(
  SETTING_KEY,
  schema,
  [...DEFAULT_VISIBLE_TAGS],
);
