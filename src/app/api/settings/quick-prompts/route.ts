import { NextResponse } from "next/server";
import { db } from "@/db";
import { appSetting } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { logger } from "@/lib/logger";

export type QuickPrompt = {
  id: string;
  label: string;
  text: string;
  enableCodebase?: boolean;
};

export type QuickPromptsConfig = Record<string, QuickPrompt[]>;

const SETTING_KEY = "story_writer_quick_prompts";

const DEFAULT_PROMPTS: QuickPromptsConfig = {
  story: [
    {
      id: "d-story-0",
      label: "Improve my story",
      text: "Improve my story. Make the problem statement sharper, the acceptance criteria more testable, and the scope clearer. Keep the original intent.",
    },
    { id: "d-story-1", label: "Add test scenarios", text: "Add test scenarios" },
    {
      id: "d-story-2",
      label: "Technical analysis",
      text: "Do a technical analysis of this story. Identify affected code areas, dependencies, and potential risks.",
      enableCodebase: true,
    },
    {
      id: "d-story-3",
      label: "Suggest title",
      text: "Suggest 3 concise, action-oriented titles for this user story. Each title should start with a verb, be under 12 words, and clearly describe the user value.",
    },
  ],
  bug: [
    {
      id: "d-bug-0",
      label: "Improve this bug report",
      text: "Improve this bug report. Make the reproduction steps precise and complete, separate expected from actual behavior, and add any missing context that would help a developer reproduce it.",
    },
    { id: "d-bug-1", label: "Add test scenarios", text: "Add test scenarios" },
    {
      id: "d-bug-2",
      label: "Root cause analysis",
      text: "Analyze the root cause of this bug. Identify the affected code, why it fails, and suggest a fix approach.",
      enableCodebase: true,
    },
    {
      id: "d-bug-3",
      label: "Suggest title",
      text: "Suggest 3 clear, specific bug report titles for this issue. Each title should describe the broken behavior and its context in under 12 words, without using the word 'bug'.",
    },
  ],
  task: [
    {
      id: "d-task-0",
      label: "Improve this task",
      text: "Improve this task description. Make the goal and deliverable explicit, add a clear definition of done, and remove any ambiguity about scope.",
    },
    { id: "d-task-1", label: "Add test scenarios", text: "Add test scenarios" },
    {
      id: "d-task-2",
      label: "Suggest title",
      text: "Suggest 3 concise titles for this task. Each title should start with a verb, be under 12 words, and clearly state what needs to be done.",
    },
  ],
  subtask: [
    {
      id: "d-subtask-0",
      label: "Improve this subtask",
      text: "Improve this subtask. Make it describe exactly one atomic unit of work, with a clear output and enough detail for a developer to start without asking questions.",
    },
    {
      id: "d-subtask-1",
      label: "Suggest title",
      text: "Suggest 3 short, specific titles for this subtask. Each title should start with a verb, be under 12 words, and describe one concrete piece of work.",
    },
  ],
  spike: [
    {
      id: "d-spike-0",
      label: "Improve this spike",
      text: "Improve this spike. Define the research question precisely, describe the investigation approach, specify what output or decision this spike should produce, and set a clear definition of done.",
    },
    {
      id: "d-spike-1",
      label: "Structure investigation",
      text: "Structure this spike as an investigation with clear questions to answer, approach, and definition of done.",
    },
    {
      id: "d-spike-2",
      label: "Suggest title",
      text: "Suggest 3 titles for this spike. Each title should start with 'Investigate' or 'Research', be under 8 words, and clearly state the open question being explored.",
    },
  ],
};

export async function GET() {
  try {
    const row = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, SETTING_KEY),
    });
    if (!row) {
      return NextResponse.json({ prompts: DEFAULT_PROMPTS });
    }
    return NextResponse.json({ prompts: JSON.parse(row.value) as QuickPromptsConfig });
  } catch {
    return NextResponse.json({ prompts: DEFAULT_PROMPTS });
  }
}

const quickPromptSchema = z.object({
  id: z.string().max(100),
  label: z.string().max(200),
  text: z.string().max(5000),
  enableCodebase: z.boolean().optional(),
});

const quickPromptsBodySchema = z.object({
  prompts: z.record(z.string(), z.array(quickPromptSchema).max(20)),
});

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const parsed = quickPromptsBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid prompts format" }, { status: 400 });
    }
    const prompts = parsed.data.prompts;
    const payload = JSON.stringify(prompts);

    const existing = await db.query.appSetting.findFirst({
      where: (r, { eq: eqFn }) => eqFn(r.key, SETTING_KEY),
    });

    if (existing) {
      await db.update(appSetting).set({ value: payload }).where(eq(appSetting.key, SETTING_KEY));
    } else {
      await db.insert(appSetting).values({ key: SETTING_KEY, value: payload });
    }

    return NextResponse.json({ prompts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("settings", "Failed to save prompts", message);
    return NextResponse.json({ error: "Failed to save prompts" }, { status: 500 });
  }
}
