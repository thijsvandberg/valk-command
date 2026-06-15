import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

const SETTING_KEY = "sprint_board_saved_views";
const MAX_VIEWS = 50;

// Permissive shape: saved views have accumulated legacy fields over time
// (poStatus, deprecated columnConfig.visible/order), so unknown keys pass
// through rather than dropping a PO's older view. Bounds guard against abuse.
const stringArray = z.array(z.string().max(200)).max(200);

const savedViewSchema = z
  .object({
    id: z.string().max(100),
    title: z.string().min(1).max(200),
    filters: z
      .object({
        status: stringArray.optional(),
        epic: stringArray.optional(),
        assignee: stringArray.optional(),
        readiness: stringArray.optional(),
        poStatus: stringArray.optional(),
        editState: stringArray.optional(),
        issueType: stringArray.optional(),
        gaps: stringArray.optional(),
        team: stringArray.optional(),
        sprint: stringArray.optional(),
      })
      .passthrough(),
    sort: z.object({
      field: z.string().max(50),
      direction: z.string().max(10),
    }),
    columnConfig: z
      .object({
        visibleTags: z.array(z.string().max(50)).max(50).optional(),
        visible: z.array(z.string().max(50)).max(50).optional(),
        order: z.array(z.string().max(50)).max(50).optional(),
      })
      .optional(),
  })
  .passthrough();

const savedViewsSchema = z.array(savedViewSchema).max(MAX_VIEWS);

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, savedViewsSchema, []);
