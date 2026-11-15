import { docs } from "../features/docs/messages.en";

export const en = {
  docs,
  hero: {
    title: "Bring your grantmaking together.",
    projectLabel: "Demo project",
    projectDescription:
      "Merit is a personal project built to demonstrate product design and development. It isn’t offered as a live grant-management service.",
    description:
      "A shared workspace for funding rounds, applications, reviews, and recommendations.",
    demoNote: "Fictional workspace · No account needed",
  },
  overview: {
    progress: {
      title: "Keep the round moving.",
      description:
        "Prepare your round, bring applications together, and see which reviews still need attention.",
    },
    budget: {
      title: "See how recommendations add up.",
      description:
        "Weigh proposed funding against the round budget before committing to a recommendation.",
    },
  },
  preview: {
    notStated: "Not stated",
    requested: "Requested",
    rounds: "Funding rounds",
    applications: "Applications",
    application: "Application",
    reviewStatus: "Review status",
    recommendation: "Manager recommendation",
    budget: "Round budget",
    proposed: "Proposed",
    remaining: "Remaining if approved",
    assessments: "Reviewer assessment",
    version: "Current application v{{version}}",
    reviewedVersion: "Reviewed application v{{version}}",
    changed: "Application changed",
    review: {
      current_one: "{{count}} current review",
      current_other: "{{count}} current reviews",
      outdated_one: "{{count}} outdated review",
      outdated_other: "{{count}} outdated reviews",
      outstanding_one: "{{count}} awaiting review",
      outstanding_other: "{{count}} awaiting review",
      unknown: "{{count}} with unknown basis",
    },
    positions: {
      decline: "Decline",
      defer: "Defer",
      fund: "Fund",
      fundWithCondition: "Fund with a condition",
    },
  },
  workflow: {
    title: "Keep evidence and judgments connected.",
    description: "See when revised information puts an earlier assessment out of date.",
    applicationHighlight: "The free venue is no longer available.",
    reviewHighlight: "The free venue makes the budget credible.",
    takeaway: "The application changed. The earlier assessment still relies on the original venue.",
  },
  invitation: {
    title: "See how the pieces fit together.",
    description: "Explore a fictional funding round, compare reviews, and make a recommendation.",
    request: "Want to explore the prototype further?",
  },
  navigation: { demo: "Try the demo", login: "Log in", docs: "Docs", privacy: "Privacy" },
  privacy: {
    title: "Privacy notice",
    browserTitle: "Privacy notice · Merit",
    description: "How Merit handles invitation requests and product analytics.",
    introduction:
      "Merit is a portfolio project. This notice covers the information you share when you request an invitation and how Merit measures public site and demo usage.",
    contact: {
      title: "Who is responsible",
      // TODO: Set up and verify merit@dmprav.com, then add it here before publishing.
      body: "Dmitrii Pravotorov is responsible for Merit. A privacy contact email has not yet been configured.",
    },
    collection: {
      title: "What is collected",
      body: "When you request an invitation, Merit saves your email address, the time of your request, and its review date and reviewer. To prevent repeated submissions, it also stores a temporary code derived from your network address, rather than the address itself. When product analytics is enabled, Merit records visited route patterns (with workspace names, record IDs, and invitation tokens removed) and basic demo milestones such as starting or resetting the demo, without tracking cookies, session replay, or personal profiles.",
    },
    purpose: {
      title: "Why it is used",
      body: "Your email is used to review your request and contact you about access, not for newsletters or advertising. Aggregate usage events are used to understand how visitors explore the site, documentation, and demo. The purposes and legitimate interests for this processing are responding to your request, protecting the form from abuse, and improving the prototype.",
      optional:
        "Providing your email is optional, but needed to request an invitation. You can use the public demo without submitting this form. Requests are reviewed by a person; submission does not automatically create an account or grant access.",
    },
    access: {
      title: "Who can access it",
      body: "Authorized Merit project operators can read invitation requests and aggregate analytics. Hosting, database, and analytics providers (including PostHog when enabled) process the information to run and measure the service. Requests are not visible to other visitors or workspace members.",
    },
    retention: {
      title: "How long it is kept",
      body: "Requests currently stay on file until manually deleted; there is no automatic expiry. You can ask for deletion. Temporary codes used to limit submissions expire after one hour and are removed on the next submission.",
    },
    choices: {
      title: "Your choices",
      body: "Contact the project owner to ask to access, correct, or delete your information, or to object to or restrict its use. You can also complain to your local data protection authority.",
    },
  },
  page: { home: "Merit · Bring your grantmaking together." },
} as const;
