import { z } from "zod";

/** What a scripted run tells the conversation, shared by the recorded data and the views. */

/** Each activity step is one `ACTIVITY_SNAPSHOT` that updates in place as the step finishes. */
export const stepActivity = "step";
/** Suggested questions that follow a reply, as one `ACTIVITY_SNAPSHOT`. */
export const suggestionsActivity = "suggestions";

export const scriptIds = ["changes", "venue"] as const;

export type ScriptId = (typeof scriptIds)[number];

export type StepContent = {
  /** What Merit AI is doing, as one line. */
  label: string;
  /** The step as a lower-case phrase for the summary line, such as "read 2 submissions". */
  summary: string;
  status: "running" | "done";
};

export type SuggestionsContent = { scripts: ScriptId[] };

/** What the page the person has open tells Merit AI; sent with each question. */
export const pageContextSchema = z.object({
  applicationRef: z.string(),
  /** The page is the Workshop Saturdays example, whose scripts were recorded. */
  isExample: z.boolean(),
});

export type PageContext = z.infer<typeof pageContextSchema>;

export const askApplicantName = "ask_applicant";

/**
 * What the model supplies for the proposal: who it is for and what it says. The title and the
 * consequence of approving are the feature's own copy, never the model's.
 */
export const askApplicantInput = z.object({
  recipient: z.object({ name: z.string(), organization: z.string() }),
  message: z.string(),
});

export type AskApplicantInput = z.infer<typeof askApplicantInput>;

/** Where the panel's width is kept between visits; neither call may fail the panel. */
export type PanelWidthStorage = {
  read: () => number | undefined;
  save: (width: number) => void;
};
