export const en = {
  pins: {
    pin: "Pin",
    pinned: "Pinned",
    pinName: "Pin {{title}}",
    unpinName: "Unpin {{title}}",
    unpin: "Unpin",
    up: "Move up",
    down: "Move down",
    actions: "Pin actions for {{title}}",
    saveError: "Pins could not be saved. Please try again.",
    loadError: "Pins could not be loaded.",
    retry: "Try again",
  },
  demoWorkspace: {
    introduction: {
      title: "Step into a program manager’s workspace",
      role: "You’re preparing funding recommendations for a fictional foundation. Explore applications, compare reviewers’ assessments, and see how proposed funding fits the round’s budget.",
      scenarioTitle: "A place to start",
      scenario:
        "Workshop Saturdays has lost its free venue. The application now requests more funding, while an earlier review still assumes the venue is free. Explore what that means for your recommendation.",
      lifetime:
        "This is your own demo workspace. You can make changes and reset it; it remains available for seven days.",
      exploreExample: "Explore the example",
      browseWorkspace: "Browse the workspace",
    },
    loadingTasks: "Loading suggested tasks…",
    tasksError: "We couldn’t load the suggested tasks. Please try again.",
    missingTasks:
      "Some example records are no longer available. You can explore or reset the demo.",
    exploreRounds: "Explore funding rounds",
    loading: "Opening your demo…",
    expired: "Your demo has expired",
    expiredDescription: "Start fresh with a new fictional workspace.",
    startFresh: "Start fresh",
    unavailable: "Demo could not be opened",
    retryDescription: "Please try again. Your existing work stays unchanged.",
    expires: "Demo expires {{date}}",
    resetDescription:
      "This replaces your entire demo workspace with a fresh example. Your other workspaces stay unchanged.",
    resetError: "We couldn’t reset the demo. Please try again in a moment.",
  },
  account: {
    defaultName: "Your account",
  },
  signIn: {
    title: "Sign in to Merit",
    description: "Continue to your workspace and funding rounds.",
    unavailable: {
      title: "Sign-in unavailable",
      description:
        "Please try again, or explore fictional grant work in the demo without an account.",
    },
    tryDemo: "Try the demo",
    demoDescription: "Explore fictional grant work. No account needed.",
  },
  state: {
    signedOut: {
      title: "Sign in to your workspace",
      description: "Your funding rounds are available after you sign in.",
    },
    workspaceNotFound: {
      title: "Workspace not available",
      description:
        "This workspace isn’t available to your account. If you expected access, contact your organization.",
    },
    noWorkspace: {
      title: "No workspace access yet",
      description:
        "You’re signed in, but your account doesn’t have access to a workspace. If you received an invitation, open the link in your email using the invited account. Otherwise, contact your organization to arrange access.",
    },
    workspace: {
      unavailable: {
        title: "Workspace could not be loaded",
        description: "We couldn’t load your workspace. Please try again.",
      },
      notFound: {
        title: "Workspace not available",
        description:
          "This workspace isn’t available to your account. It may have been removed or your access may have changed.",
      },
      loading: { title: "Loading your workspace…" },
    },
    applications: {
      unavailable: { title: "Applications could not be loaded", description: "Please try again." },
      notFound: {
        title: "Applications not available",
        description: "Your account needs program-manager access to view applications.",
      },
      loading: { title: "Loading applications…" },
    },
    activity: {
      unavailable: { title: "Activity could not be loaded", description: "Please try again." },
      notFound: {
        title: "Activity not available",
        description: "Your account needs program-manager access to view activity.",
      },
      loading: { title: "Loading activity…" },
    },
    rounds: {
      unavailable: {
        title: "Funding rounds could not be loaded",
        description: "We couldn’t load funding rounds. Please try again.",
      },
      notFound: {
        title: "Funding rounds not available",
        description:
          "These funding rounds aren’t available to your account. Your access may have changed.",
      },
      loading: { title: "Loading funding rounds…" },
    },
    round: {
      unavailable: {
        title: "Round could not be loaded",
        description: "We couldn’t load this round. Please try again.",
      },
      notFound: {
        title: "Round not available",
        description:
          "This round isn’t available to your account. It may have been removed or your access may have changed.",
      },
      loading: { title: "Loading the round…" },
    },
    application: {
      unavailable: {
        title: "Application could not be loaded",
        description: "We couldn’t load this application. Please try again.",
      },
      notFound: {
        title: "Application not available",
        description:
          "This application isn’t available to your account. It may have been removed or your access may have changed.",
      },
      loading: { title: "Loading the application…" },
    },
    contacts: {
      unavailable: { title: "Contacts could not be loaded", description: "Please try again." },
      notFound: {
        title: "Contacts not available",
        description: "Your account needs program-manager access to view contacts.",
      },
      loading: { title: "Loading contacts…" },
    },
    team: {
      unavailable: {
        title: "Members & access could not be loaded",
        description: "We couldn’t load members and access. Please try again.",
      },
      notFound: {
        title: "Members & access not available",
        description:
          "This workspace isn’t available to your account. Your access may have changed.",
      },
      loading: { title: "Loading members and access…" },
    },
    review: {
      loading: { title: "Loading review…" },
      unavailable: {
        title: "Review could not be loaded",
        description: "We couldn’t load this review. Please try again.",
      },
      notFound: {
        title: "Review not available",
        description:
          "This review isn’t available to your account. It may have been removed or your access may have changed.",
      },
    },
  },
  work: {
    application: "Application",
    status: "Status",
  },
  backToWorkspace: "Back to workspace",
  navigation: {
    myWork: "My work",
    search: "Search",
    settings: "Workspace settings",
    workspace: "Workspace",
    workspaces: "Workspaces",
    demo: "Explore demo",
    rounds: "Funding rounds",
    applications: "Applications",
    activity: "Activity",
    backToApplications: "Back to applications",
    contacts: "Contacts",
    breadcrumb: "Breadcrumb",
  },
  demo: {
    drafts: "Unsaved drafts last while you explore this scenario.",
    unavailable: "Demo unavailable",
    unavailableDescription: "We couldn’t load this demo. Try opening it again.",
    notFound: {
      application: {
        title: "Application not found",
        description: "This application isn’t in the demo.",
      },
      round: {
        title: "Funding round not found",
        description: "This funding round isn’t in the demo.",
      },
      page: {
        title: "Page not found",
        description: "This page isn’t in the demo.",
      },
    },
    back: "Back to funding rounds",
  },
  page: {
    demo: "Demo workspace · Merit",
    journey: "Workshop Saturdays journey · Merit",
    signIn: "Sign in · Merit",
    workspace: "Workspace · Merit",
    round: "Funding round · Merit",
  },
  context: {
    example: "Example round",
    journey: "Workshop Saturdays journey",
  },
  loading: {
    example: "Loading the example round…",
  },
} as const;
