import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";
import { INBOX_DEFAULT_VISIBLE_TAGS } from "@/components/sprint-board/filter-bar-types";

// Account-scoped New story inbox inline row fields (BRDG-357). Independent of the
// sprint board's row-fields key so the two Display configs never collide.
const SETTING_KEY = "inbox_row_fields";

const schema = z.array(z.string().max(50)).max(50);

export const { GET, PUT } = createUserJsonSettingRoute(
  SETTING_KEY,
  schema,
  [...INBOX_DEFAULT_VISIBLE_TAGS],
);
