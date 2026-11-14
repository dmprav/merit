export const docs = {
  label: "Documentation",
  overview: "Overview",
  navigation: "Documentation topics",
  browse: "Browse docs",
  contents: "On this page",
  next: "Continue with",
  sectionLink: "Link to {{title}}",
  groups: {
    start: "Get started",
    work: "Grant work",
    team: "Team and access",
    integrations: "Integrations",
  },
  pages: {
    overview: {
      title: "Merit documentation",
      description:
        "Learn how to prepare grant work, understand evidence, and make funding recommendations.",
      browserTitle: "Docs · Merit",
      start: {
        title: "Explore your first funding round",
        description:
          "A replacement venue changes an application’s request. Follow Workshop Saturdays through the evidence, reviews, and budget.",
        action: "Read the demo walkthrough",
      },
    },
    quickstart: {
      title: "Explore the demo",
      description:
        "Follow a changed application from its evidence to a funding recommendation. No account required.",
      open: {
        title: "Open Workshop Saturdays",
        body: "The guided demo opens a fictional application in Alder Foundation’s Local Connections 2027 round. Use the Demo guide for prompts as you explore.",
      },
      evidence: {
        title: "Find what changed",
        body: "In the applicant submission, read Revised venue and funding request. The free venue is no longer available, so the request has risen from €18,000 to €22,000. The replacement venue has not yet been booked.",
      },
      review: {
        title: "Compare the review with the evidence",
        body: "Select Sam Morgan in the review overview to read his assessment beside the submission. It refers to version 1 and relies on the free venue. Jules’s assessment is still awaited. Use the current evidence to decide what needs an answer; Back to overview returns to the recommendation and review summaries.",
      },
      recommend: {
        title: "Try a recommendation",
        body: "Edit the Manager recommendation, choose a position, and explain your reasoning. Watch the budget preview as you change the allocation. Save recommendation records your proposal in your demo workspace.",
      },
      return: {
        title: "Return to the example",
        body: "Your demo workspace saves changes for seven days. Guided and free exploration share the same copy. Reset demo in the Demo guide replaces the whole workspace with a fresh example.",
        limitations:
          "You can also prepare rounds, add and revise applications, maintain contacts, and record assessments received from reviewers. Adding a review request sends no message. In standard workspaces, Invite reviewer separately sends an invitation for private drafts and independent submission. Applicant submission and committee decision recording are not available yet.",
      },
    },
    workspaces: {
      title: "Join a workspace",
      description: "Accept your invitation and find your organization’s grant work.",
      joining: {
        title: "Accept your invitation",
        steps: {
          first: "Open the invitation sent to your email address.",
          second: "Sign in with the invited email and verify it.",
          third: "Review the responsibilities and accept the invitation.",
        },
      },
      navigation: {
        title: "Find and pin your work",
        body: "Funding rounds opens all rounds in your workspace. Applications opens applications across those rounds. Activity lists who changed shared grant work, newest first. Search, at the top of navigation or with Ctrl+K (⌘K on Apple devices) from anywhere in the workspace, finds a funding round or application by name or applicant, and opens it when you choose a result. My work opens your own review assignments in the current workspace. Your responsibilities determine which destinations are available.",
        pins: "Open a round, application, or review assignment and choose Pin at the top of the page. Your shortcut appears beneath Funding rounds, Applications, or My work in its workspace. You can pin several rounds. Use each pin’s actions menu to Move up, Move down, or Unpin. Pins are personal and follow your account across devices.",
        settings:
          "Contacts is a secondary workspace directory for program managers. Owners and administrators use Workspace settings → Members & access to manage membership. Reviewers use the same workspace navigation with access to their own assignments.",
      },
      switching: {
        title: "Find and switch workspaces",
        body: "Sign in to open your workspace. If you belong to more than one, choose an organization. Switch using the workspace name above navigation; on small screens, open navigation first.",
      },
      access: {
        title: "If no workspace is available",
        body: "Signing in does not create membership. Contact the person who invited you. If the invitation has expired or been replaced, ask them to resend it and use the newest link.",
      },
    },
    rounds: {
      title: "Prepare a funding round",
      description: "Set the purpose, criteria, budget, and responsible manager for a round.",
      create: {
        title: "Create a round",
        steps: {
          first: "Open Funding rounds and choose Create funding round.",
          second:
            "Enter a name and optionally a purpose, budget, or committee date, then choose Create funding round. The new round opens in Overview.",
          third:
            "In Overview, use the edit actions to complete the purpose, committee date, assessment criteria, budget, and responsible manager.",
        },
        access:
          "Program managers can prepare rounds. Completing a round’s details does not open application intake or start reviews.",
      },
      intake: {
        title: "Record an application",
        body: "Open Applications to record requests received outside Merit. You can save incomplete preparation and mark it ready when the required material is present.",
        action: "Learn how to record and prepare an application",
      },
      revisions: {
        title: "Correct or revise an application",
        body: "A shared working revision lets colleagues prepare changed material while readers continue to see the recorded version. Recording the revision preserves earlier material and judgments.",
        action: "Follow the correction and revision steps",
      },
      criteriaBudget: {
        title: "Set criteria and budget",
        body: "Give criteria short titles and guidance, and put them in the order reviewers should consider them. Later edits preserve earlier criteria and flag affected reviews and requests. A blank budget means not set; €0 means zero budget. Applications can be prepared before the round budget is known. Changes to an existing budget require a reason and record who changed it and when.",
      },
      saving: {
        title: "Save and resume edits",
        detailsTitle: "Names, dates, and managers",
        details:
          "Edit the name in its heading and use <control>Save name</control> or <control>Cancel</control>; Enter and Escape also work. Typed dates have <control>Save date</control> and <control>Cancel</control> actions. Selecting a manager or calendar date saves immediately and offers <control>Undo</control>.",
        writingTitle: "Purpose, criteria, and budget",
        writing:
          "Purpose and criteria expand in place; budget changes use <control>Update budget</control>. <control>Close</control> keeps writing drafts, including after reopening the browser on the same device. <control>Discard changes</control> removes them, and signing out clears draft recovery.",
        access:
          "All current program managers can edit the round, even when someone else is its responsible manager.",
      },
    },
    applications: {
      title: "Record and revise applications",
      description:
        "Record material received outside Merit, prepare it for review, and preserve what changed.",
      create: {
        title: "Add an application",
        overview:
          "Choose Applications in the sidebar to see applications across your workspace. Filter by Round and sort the list, then open an application or its round. Back to applications returns to the same filter, sort, and list position.",
        steps: {
          open: "From Applications in the sidebar, choose a round under New application in, then choose Add application. You can also add an application from a funding round’s Applications section.",
          enter:
            "Enter the project title. Add the applicant, requested amount, and submitted material if you have them; only the title is required to start.",
          save: "Choose Add application to save and open the record. Its status is In preparation.",
        },
        access:
          "Program managers can record applications, including in the demo. Applicants need no Merit account. This records material you received elsewhere; applicant-facing submission and file attachments are not available.",
      },
      prepare: {
        title: "Complete the material",
        detailsTitle: "Application details",
        materialTitle: "Applicant submission",
        contactsTitle: "Applicant contact",
        details:
          "Use Edit application details beside Application details for the applicant, optional contact, requested amount, and project dates. Leave an unknown amount blank; €0 means a confirmed zero request. Amounts use euros and accept at most two decimal places.",
        material:
          "Use Edit applicant submission beside Applicant submission to enter headings or original questions and the applicant’s responses. Save partial work as you go. Your interpretation belongs in Add staff summary, separate from the applicant’s material.",
        contacts:
          "Select an applicant contact when useful. Choosing a contact does not grant access. In the details form, Save commits the selection; the separate Change contact action saves immediately and offers Undo.",
        contactsAction: "Understand shared contact details",
      },
      ready: {
        title: "Mark ready for review",
        body: "Complete the title, applicant, requested amount, and at least one submitted section. Every section needs a heading and response. Save or discard unsaved application edits, leave the editor, then choose Mark ready for review.",
        consequence:
          "Readiness enables funding recommendations. It does not establish eligibility, assign reviewers, or send messages. You can record an explained deferral while the application is still in preparation.",
      },
      revisions: {
        title: "Correct or revise recorded material",
        steps: {
          start:
            "Use Application actions to choose Start revised submission for new applicant material or Correct intake for a recording correction. Editing a recorded title also starts a correction.",
          edit: "Edit the working revision and explain What changed and why. Save working revision shares your preparation with colleagues; readers still see the current recorded material.",
          inspect:
            "Leave the editor and use Review saved working revision to check the saved result. While editing, View current submission lets you consult the recorded material without losing your writing.",
          record:
            "When the material is complete and has changed, save or discard any unsaved application edits, then choose Record revision to make the saved version current.",
        },
        consequence:
          "Earlier reviews and manager recommendations become outdated, keeping their content and proposed allocations until reconsidered. Contact and staff-summary edits do not make judgments outdated. During a working revision, saving a contact change takes effect immediately; material changes wait until Record revision.",
        history:
          "View version history compares recorded versions. Application history retains changes and who recorded them. Discard working revision in Application actions removes the shared preparation after confirmation, preserving the current and earlier recorded versions.",
      },
      saving: {
        title: "Save and recover your work",
        savedTitle: "Save or resume a draft",
        conflictTitle: "Resolve conflicting changes",
        refreshTitle: "Refresh after a saved change",
        saved:
          "<control>Save</control> preserves preparation for colleagues and future visits. <control>Close</control> keeps unsaved writing through navigation and browser restarts on the same device; use the section’s <control>Continue editing</control> action to resume. <control>Discard changes</control> removes local unsaved edits. Signing out or changing accounts clears draft recovery.",
        conflict:
          "If someone changes the record, compare your draft with <control>Latest saved values</control>. <control>Use saved values</control> replaces your draft; <control>Keep my changes</control> retains your edits and uses current values for fields you did not edit. Review the result before saving. Submitted sections are reconciled as one ordered list.",
        refresh:
          "If a change saved but the view could not refresh, use <control>Refresh application</control> to load it. A refresh failure does not mean the save failed.",
      },
      delete: {
        title: "Delete unused preparation",
        body: "Delete application is available in Application actions only for an application never marked ready and with no review requests, assessments, or manager recommendation. Confirming deletes its preparation details while keeping audit history. Archiving and moving applications between rounds are not available.",
      },
      withdraw: {
        title: "Withdraw or reinstate an application",
        body: "When an applicant steps back, choose Withdraw application in Application actions and enter the date they withdrew and the reason. The application, its material, reviews, and recommendation are kept; withdrawal is not a rejection or a deletion. The application becomes read-only, stops counting toward the round's requested and proposed totals, and closes its outstanding review requests, which ends reviewer access.",
        reinstate:
          "Choose Reinstate application and enter a reason to make the application active again with its earlier status. Review requests closed by the withdrawal stay closed: request the reviews again or reinstate the reviewer's assignment. The round list marks withdrawn applications and has a Withdrawn filter, and the totals say how many withdrawn applications they leave out.",
      },
    },
    contacts: {
      title: "Manage contacts",
      description:
        "Maintain the people your workspace works with, including applicant contacts and reviewers.",
      find: {
        title: "Find or add a contact",
        steps: {
          open: "Open Contacts in workspace navigation. Use Find a contact to search by name, email, affiliation, or linked application.",
          add: "Choose Add contact, enter a name or email, and add any other details you know. Choose Save contact.",
          use: "Select the contact when preparing an application or requesting or recording a review. You can also add a contact from those selectors.",
        },
        access:
          "Program managers maintain contacts. Adding a contact creates no account, invitation, or workspace access. Use Workspace settings → Members & access to manage membership. A reviewer needs a name so their judgment can be attributed.",
        identity:
          "Matching names or email addresses do not merge contacts. Check the details before selecting a person; contact merging is not available.",
      },
      details: {
        title: "Edit shared details or choose another person",
        shared:
          "In Contacts, open the person’s actions menu and choose Edit contact details. Save contact updates their current profile wherever it is used in this workspace. Historical application records and assessment attribution retain their recorded details; editing a profile does not make reviews outdated.",
        assignment:
          "Use Change contact on an application when a different person should be associated with that request. This changes that application’s contact; it does not rename the original person or change their other applications.",
        applicationsAction: "Record or update an application’s contact",
      },
      archive: {
        title: "Archive and restore a contact",
        steps: {
          archive: "Open the contact’s actions menu and choose Archive.",
          resolve:
            "If Merit lists outstanding review requests, open those applications and resolve the requests before trying again. Archiving does not cancel requested work.",
          restore:
            "To restore a contact, set Status to Archived, find the person, and choose Restore from their actions menu.",
        },
        consequence:
          "Archived contacts leave ordinary selection lists. Existing application links and assessment history remain intact.",
      },
      history: {
        title: "Inspect contact history",
        body: "Open Contact history beneath a person to compare earlier and saved details, who recorded each change, and when. Changed marks fields that differ between the two records; unchanged details remain visible for context. Close the dialog to return to the same place in Contacts. Updating contact details preserves the identity of the reviewer and recorder on earlier assessments.",
      },
      saving: {
        title: "Resume edits and resolve conflicts",
        draft:
          "Close retains a draft through navigation and browser restarts on the same device. Use Resume contact for an unfinished new contact or Resume editing for existing details. Discard draft removes it. Signing out or changing accounts clears draft recovery.",
        conflict:
          "If the contact changed while you were editing, compare Current saved details with your draft. Choose Discard draft and use saved work, or Keep draft after reviewing current work, then review your values before saving.",
        refresh:
          "If saving succeeded but the latest information could not load, use Retry to refresh it. Your saved change remains recorded.",
      },
    },
    reviews: {
      title: "Complete a review",
      description:
        "Accept a review invitation, write privately, and submit your assessment to the program manager.",
      invitation: {
        title: "Respond to your invitation",
        steps: {
          join: "First accept the workspace invitation using the verified email address it was sent to. Reviewer access opens My work, where your assignments appear. If you have no assignments yet, the program manager can assign them after you join.",
          open: "Open the invitation and sign in with the verified email address it was sent to. Review the application title, instructions, requested response date, and manager’s contact details.",
          respond:
            "Choose Accept review to open the application material, or Decline review if you cannot take it on. Report a possible conflict if a relationship or other concern could affect your independence.",
        },
        access:
          "Accepting the review opens its assigned material and criteria. Reviewer membership does not reveal other applications or other reviewers’ assessments. Return through My work in the foundation’s workspace or your assignment link.",
      },
      drafting: {
        title: "Read and write privately",
        material:
          "Use Reference to switch between Application material and Assessment criteria. Your assignment keeps the versions you were asked to review. If a change warning appears, contact the requesting manager to discuss whether a follow-up is needed.",
        saving:
          "Writing autosaves to the server. Wait for Draft saved before leaving; you can then resume on another device. Managers cannot read your draft. If saving fails, keep the page open and retry. If two devices have different drafts, compare both versions before choosing which text to continue with.",
      },
      submitting: {
        title: "Submit your assessment",
        steps: {
          position:
            "Choose a Funding position and give your Overall reasoning. Fund and Fund with conditions require a proposed amount above zero; explain any conditions in your reasoning. Defer and Decline need no amount. Notes against individual criteria are optional.",
          submit:
            "Choose Submit assessment. This shares your judgment with program managers and notifies the requesting manager. Passing the requested response date does not prevent submission.",
        },
        confirmation:
          "If the page says the assessment was saved but could not be loaded, refresh to see the submitted version. A failed email notification does not undo your submission.",
      },
      amendments: {
        title: "Amend a submitted assessment",
        body: "Choose Amend assessment, update your judgment, and explain the amendment. Submit amendment shares the new version and preserves the earlier one. Close keeps your private amendment draft; Resume amendment reopens it. Discard amendment returns to the submitted assessment.",
      },
      access: {
        title: "Resolve a conflict or access problem",
        conflict:
          "Use More actions to Report a possible conflict, including after submission. Reporting pauses your access while the manager considers it; a submitted assessment stays recorded. If the manager clears the conflict, accept the review again to continue. Before submitting, you can also Withdraw from review.",
        recovery:
          "If the invitation expires or access ends, contact the requesting manager. Ask for an expired invitation to be resent. When access changes before writing is saved, copy the unsaved text shown on the page before leaving.",
      },
      mcpGuide: "Complete your review through an MCP client",
      managerGuide: "Requesting and recording reviews as a manager",
    },
    recommendations: {
      title: "Review and recommend",
      description:
        "Use evidence and reviewer judgments to propose funding and understand its effect on the round budget.",
      application: {
        title: "Read the application",
        evidence:
          "Use submitted material to check claims and amounts; the staff summary stays separate. View version history lets you choose the versions to compare. Changed sections show before and after; unchanged sections remain readable and are marked Unchanged. If an earlier submission was not retained, Merit explains that it is unavailable rather than reconstructing it from a review. Expand Application history below the comparison to inspect recorded changes and their authors.",
        steps: {
          round: "Open a funding round and choose Applications.",
          application:
            "Open an application and read the applicant submission beside its details, recommendation, and review overview.",
          evidence:
            "Check the requested amount, application version, submitted answers, and project budget.",
        },
      },
      reviews: {
        title: "Understand review status",
        example:
          "In the Workshop Saturdays example, the request rose from €18,000 to €22,000 after the free venue became unavailable. Sam’s review covers the earlier version. Compare the revised application with Sam’s reasoning before relying on that review; an outdated review is not automatically a mistaken judgment.",
        consequence:
          "Changing a recommendation does not update an assessment or resolve missing evidence. An outdated assessment can still be useful; decide whether the changes call for another review.",
        status: {
          label: "Review status",
          meaning: "What it means",
          current: "Current",
          currentBody:
            "The assessment refers to the current application version and matching criteria content. Restoring earlier criteria content can make an assessment current again.",
          outdated: "Outdated",
          outdatedBody:
            "The application version or current criteria content differs from what was assessed. Check the differences before relying on the judgment.",
          unknown: "Review basis unknown",
          unknownBody:
            "Some of the review basis is unknown, and no known difference establishes that the assessment is outdated.",
          awaiting: "Awaiting review",
          awaitingBody: "An expected assessment has not yet been recorded.",
        },
        exampleTitle: "When the request changes",
      },
      manageReviews: {
        title: "Request and record reviews",
        steps: {
          request:
            "In a workspace application, open Manage reviews and choose Add review request. Select or add the reviewer as a contact; choosing them immediately records a request against the current application and criteria.",
          arrange:
            "Arrange the review through your usual email or other channels. Tracking a request in Merit sends no message and gives the contact no account or workspace access.",
          record:
            "When an assessment arrives, choose Record assessment. You can record it with or without a tracked request. Identify the application material and criteria actually reviewed, or leave the basis Not known. Preserve the reviewer’s text; leave unstated positions and amounts as Not stated.",
          followUp:
            "Use Record follow-up assessment for a new judgment from the reviewer. Use Edit recorded assessment to correct what you entered. Both preserve the earlier record and its attribution.",
        },
        scope:
          "To invite an independent assessment, ask a workspace owner or administrator to invite the person as a Reviewer through Members & access. Once they join, add a review request and choose Invite reviewer under Reviewer participation. Use their membership email for the contact; your own email must be verified. Reviewers write private drafts and submit their own judgments; managers cannot edit those submissions. End access revokes the assignment while preserving its records.",
      },
      reviewerGuide: "Instructions for invited reviewers",
      recommendation: {
        title: "Write a recommendation",
        reference:
          "While editing, use the Reference menu to consult Applicant submission, Reviewer assessments, Version history, or Application details. Your draft stays in place. On smaller screens, Browse reference material and Go to recommendation move between the two areas.",
        steps: {
          edit: "In the application overview, choose Add recommendation or the pencil beside the manager’s name to edit their recommendation.",
          position:
            "Choose Fund, Fund with a condition, or Defer. Funding requires an application marked ready; a deferral can record missing information during preparation.",
          reason:
            "For Fund or Fund with a condition, enter a proposed allocation greater than €0. Defer needs no amount. Every recommendation needs reasoning, including any conditions or unresolved questions.",
        },
        positions: {
          position: "Recommendation",
          amount: "Allocation",
          effect: "Budget effect",
          fund: "Fund",
          conditional: "Fund with a condition",
          defer: "Defer",
          positive: "Greater than €0",
          zero: "€0",
          full: "Counts in full",
          none: "Reserves nothing",
          missing:
            "An application without a recommendation also reserves nothing, but has no recorded position or reasoning yet.",
        },
      },
      budget: {
        title: "Check the budget effect",
        calculation:
          "The round’s proposed allocation is the sum of saved manager recommendations. Reviewer assessments do not count toward it. Remaining if approved is the round budget minus that proposed total. If the total exceeds the budget, Merit shows the amount over budget.",
        preview:
          "While editing, the budget preview replaces this application’s saved allocation with your draft amount and keeps the other saved recommendations. Other unsaved drafts are not included. The preview changes immediately; the round totals change after you save.",
        example: "Deferring the €24,000 recommendation instead leaves €32,000 if approved.",
        limits:
          "You can save recommendations that exceed the budget while exploring trade-offs. They remain proposals, not funding commitments. Without a round budget, remaining funds cannot be calculated; an invalid draft amount also leaves the preview unavailable.",
        exampleTitle: "A €60,000 round",
        tryTitle: "Try a different recommendation",
        tryInstructions:
          "Edit Neighbour Table’s €24,000 recommendation below. Choose Defer to see €32,000 remaining, or choose Fund and enter €40,000 to see the round exceed its budget by €8,000. Add your reasoning and save to update the example.",
        tryScope:
          "This fictional example resets when you leave or reload this page. Saving here only updates this example; your workspace and demo are unaffected.",
        rows: {
          first: "Fund",
          second: "Fund with a condition",
          remaining: "Remaining if approved",
        },
      },
      saving: {
        title: "Save and return to your work",
        saveTitle: "Save your recommendation",
        resumeTitle: "Keep or discard a draft",
        storageTitle: "Workspace and demo storage",
        instructions:
          "Choose <control>Save recommendation</control> or press Cmd/Ctrl+Enter to record your position, amount, and reasoning. The overview returns while your chosen reference material stays open.",
        resume:
          "<control>Close</control> keeps the draft; <control>Discard changes</control> removes it. Use <control>Resume editing</control> to continue. Workspace drafts survive reloading in the same tab; signing out or changing accounts clears them.",
        storage:
          "Recommendations persist in the workspace. Demo workspaces last seven days; Reset demo replaces the entire demo. Guided and free exploration share one copy.",
        recovery:
          "If saving fails, your draft remains available. Follow the visible recovery message. If the application or recommendation changed while you were editing, discard the draft, review the latest version, and start again.",
        recoveryTitle: "If saving fails",
      },
    },
    team: {
      title: "Manage your team",
      description: "Invite people, understand their responsibilities, and manage workspace access.",
      responsibilities: {
        title: "Understand responsibilities",
        responsibility: "Responsibility",
        access: "What it allows",
        owner: "Owner",
        ownerBody:
          "Manages members and appoints administrators. Contact the Merit operator for ownership changes.",
        admin: "Administrator",
        adminBody: "Manages members and invitations; can grant themselves program-manager access.",
        manager: "Program manager",
        managerBody:
          "Views and edits grant work. This access is separate from organization responsibility.",
        reviewer: "Reviewer",
        reviewerBody:
          "Enters the workspace and reviews assigned applications through My work. Other applications, staff recommendations, and other reviewers’ assessments remain private.",
      },
      invitations: {
        title: "Invite a member",
        steps: {
          first: "Open Workspace settings → Members & access and choose Invite member.",
          second: "Enter their email and select their responsibilities.",
          third: "Send the invitation, then check its status in Invitations.",
        },
        acceptance:
          "The recipient must verify the invited email and accept before becoming a member. Sending an invitation does not confirm inbox delivery or membership.",
      },
      delivery: {
        title: "Check delivery and resend",
        body: "Invitations expire after seven days. Failed or expired invitations show Resend beneath their details. The invitation’s actions menu also offers Resend and Revoke. Resend creates a new link and invalidates the old one. If sending fails or remains unconfirmed, check the recipient and resend. Close keeps invitation and access drafts through navigation and browser restarts on the same device. Use Resume invitation or Resume access changes to continue, or Discard changes to remove the draft. Signing out clears draft recovery.",
      },
      access: {
        title: "Change or remove access",
        body: "Use a person’s actions menu to Edit access or Remove from organization. Removal ends workspace access while preserving their existing work, account, and other memberships. Removing a member or their administration also revokes outstanding invitations they issued; review those consequences before saving. Contact the Merit operator for ownership changes.",
      },
    },
    mcp: {
      title: "Connect through MCP",
      description:
        "Work on grants, complete your reviews, and manage account tasks through a connected client.",
      connect: {
        title: "Connect your account",
        body: "Add this server URL in a client that supports remote MCP over Streamable HTTP and OAuth. Sign in with your Merit account and choose the access to grant the client. Your current Merit permissions still apply.",
        origin: "/mcp/workspace on this website’s origin",
        copy: "Copy URL",
        copied: "URL copied",
        copyFailed: "Copy failed. Select and copy the URL above.",
      },
      request: {
        title: "Make your first request",
        staffTitle: "For workspace staff",
        reviewerTitle: "For reviewers",
        reviewerPrompt:
          "Find my review assignments. Open the one I choose and explain its instructions and current status. Do not accept, save, or submit anything yet.",
        reviewerTool:
          "Your client starts with <tool>list_my_reviews</tool>, then <tool>get_reviewer_assignment</tool>. You need reviews:read, current reviewer or program-manager membership, and your own assignment. Application material becomes available after you accept the review.",
        prompt:
          "Find my workspaces and funding rounds. Open the round I choose, explain which reviews need attention, and show its remaining proposed budget. Do not save changes yet.",
        tool: "With workspace:read, your client starts with <tool>list_workspaces</tool>, then <tool>list_funding_rounds</tool>. It uses the returned identifiers to read a round or application.",
      },
      result: {
        title: "Read, prepare, and save",
        body: "Workspace staff can read evidence and history, prepare grant work, maintain contacts, and save recommendations. Reviewers can respond to invitations, save private drafts, and submit or amend their own assessments. Account tools handle personal shortcuts, membership invitations, and your demo. Operator administration has separate permissions. Public publication and funding decisions are not available.",
        money:
          "Grant summaries use minorUnits as an integer string and currency: EUR; 2200000 minor units means €22,000. Reviewer draft and assessment amounts use decimal euro strings. Follow each tool’s specified format; decimal amounts accept at most two decimal places.",
        saving:
          "Requested saves change the same records as the website, including private review drafts and submissions. Ask for a suggestion when you do not want to save yet. If someone changed the record, reread and reconcile it before saving again. History identifies the person and whether they acted through Merit web or a verified MCP client; it does not prove human review.",
      },
      workspace: {
        title: "Access and permissions",
        availability:
          "Sign in with your Merit account. Workspace and review work require current membership; review assignments also restrict which material you can read and assess. Personal shortcuts and onboarding use their own access rules. Anonymous visitors can explore the browser demo; MCP always requires sign-in.",
        auth: "Grant the client only the access needed for your task. These OAuth grants limit what it can do on your behalf; they never replace your current Merit permissions. Request additional consent if a new task needs a different grant.",
        task: "Task",
        grants: "Client access",
        scopes: {
          work: "Grant work",
          workGrants: "workspace:read to read; grants:write to change grant work or contacts.",
          team: "Team",
          teamGrants:
            "workspace:read to read; team:write to manage membership, with owner or administrator authority.",
          reviews: "Your reviews",
          reviewsGrants:
            "reviews:read to read; reviews:write to respond, save drafts, submit, or amend.",
          profile: "Your shortcuts",
          profileGrants: "profile:read to read; profile:write to change your pins.",
          onboarding: "Invitations and your demo",
          onboardingGrants:
            "onboarding:read to read; onboarding:write to accept membership invitations, request access, or start and reset your demo.",
          admin: "Operator tools",
          adminGrants: "admin:read or admin:write, with designated Merit operator authority.",
        },
      },
      troubleshooting: {
        title: "If the connection fails",
        body: "Check that your client supports Streamable HTTP and OAuth and that the URL ends in /mcp/workspace. Website cookies do not authenticate a client. A hosted client cannot connect to your computer’s localhost. An insufficient_scope challenge identifies the access you must grant; a missing record may mean your workspace or assignment access changed.",
      },
    },
  },
  shared: {
    commitment: "Saving a recommendation does not commit funding.",
    tryExample: "Try Workshop Saturdays",
  },
} as const;
