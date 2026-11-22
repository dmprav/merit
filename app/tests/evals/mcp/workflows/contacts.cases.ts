import { defineWorkflow, manager, workspaceFixture } from "../definition.ts";

export const contactCases = defineWorkflow(
  "contacts",
  manager,
  () => import("./contact-cases.ts"),
  workspaceFixture,
  {
    "archived-directory": {
      prepare: (steps, ctx) => steps.archivedDirectory(ctx),
      prompt: "Show me all the archived people in Alder’s shared directory.",
      setup: "Includes active contacts and multiple pages of archived contacts.",
      tools: ["list_contacts"],
      outcome: "Returns every archived contact and no active ones.",
    },
    "contact-profile": {
      prepare: (steps, ctx) => steps.contactProfile(ctx),
      relatedTools: ["update_contact"],
      prompt: "What email address is on Jo Bell’s shared contact card?",
      setup: "Jo’s current address is jo@example.test.",
      tools: ["get_contact", "list_contacts"],
      toolMatch: "any",
      outcome:
        "Reports Jo Bell's email from her directory entry or contact card without changing any record.",
    },
    "contact-applications": {
      prepare: (steps, ctx) => steps.contactApplications(ctx),
      prompt: "Which applications has Jo Bell been involved with, including past reviews?",
      setup: "Applicant contact on one application and historical assessment on another.",
      tools: ["list_contact_applications"],
      outcome: "Lists both applications and distinguishes the relationships.",
    },
    "new-contact": {
      prepare: (steps, ctx) => steps.newContact(ctx, false),
      prompt: "Add Sam Reed from Review Panel to our contacts at sam@example.test.",
      setup: "Manager in Alder. No matching contact exists.",
      tools: ["create_contact"],
      outcome: "One active contact with the supplied profile. No invitation or membership.",
    },
    "change-contact": {
      prepare: (steps, ctx) => steps.changeContact(ctx),
      prompt: "Change Jo Bell’s shared email address to jo.new@example.test.",
      setup: "Jo’s profile records an affiliation and links to an application.",
      tools: ["update_contact"],
      outcome: "Same contact and affiliation. Linked application’s intake revision unchanged.",
    },
    "archive-contact": {
      prepare: (steps, ctx) => steps.archiveContact(ctx),
      prompt: "Take Jo Bell off the active contacts list and keep her past work.",
      setup: "Active contact with review history and no outstanding request.",
      tools: ["archive_contact"],
      outcome: "Archived; past references and profile preserved.",
    },
    "restore-contact": {
      prepare: (steps, ctx) => steps.restoreContact(ctx),
      prompt: "Put Jo Bell back on the active contact list.",
      setup: "Archived shared contact with known profile details.",
      tools: ["restore_contact"],
      outcome: "Same contact active again with original details.",
    },
    "blocked-archive": {
      prepare: (steps, ctx) => steps.blockedArchive(ctx),
      prompt: "Archive Jo Bell and tell me whether it worked.",
      setup: "Jo has an outstanding review request.",
      tools: ["archive_contact"],
      outcome: "Reports the blocking request. Contact active and request open.",
    },
    "ambiguous-contact": {
      prepare: (steps, ctx) => steps.ambiguousContact(ctx),
      relatedTools: ["update_contact"],
      prompt: "Change Sam’s email to sam.new@example.test.",
      setup: "Two active contacts named Sam and no other identifying information.",
      tools: [],
      outcome: "Clarifies identity. Neither email changes.",
    },
    "link-contact": {
      prepare: (steps, ctx) => steps.newContact(ctx, true),
      prompt:
        "Add Sam Reed of Review Panel, sam@example.test, as the contact for Lanterns. Then tell me which applications Sam is linked to.",
      setup: "No existing Sam Reed. Lanterns has an existing unrelated recorded review.",
      tools: ["create_contact", "select_application_contact", "list_contact_applications"],
      outcome:
        "One shared contact and one applicant link. Checks Sam's workspace-wide application links after linking him, identifies Lanterns, and preserves review history.",
    },
  },
);
