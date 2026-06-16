import { z } from "zod";
import { createUserJsonSettingRoute } from "@/lib/user-settings";

// Account-scoped Jira identity (BRDG-360): maps the logged-in Clerk user to their
// stable Jira accountId so "me" comparisons (inbox self-exclude, "my work"
// filters) key on the GUID instead of a brittle display-name string. Stored as a
// per-account setting rather than resolved automatically because the Jira
// user-search / "/myself" API is outside the token's scope. null when unset.
const SETTING_KEY = "my_jira_identity";

const schema = z
  .object({
    accountId: z.string().min(1),
    email: z.string().email().nullable(),
  })
  .nullable();

export const { GET, PUT } = createUserJsonSettingRoute(SETTING_KEY, schema, null);
