import { vi } from "vite-plus/test";

import type { McpOperations } from "../src/app/operations";

type WorkspaceOperations = McpOperations["workspace"];

type TeamOperations = McpOperations["team"];

export const testOperations = () => ({
  reviewer: {
    list: vi.fn<McpOperations["reviewer"]["list"]>(),
    read: vi.fn<McpOperations["reviewer"]["read"]>(),
    history: vi.fn<McpOperations["reviewer"]["history"]>(),
    forApplication: vi.fn<McpOperations["reviewer"]["forApplication"]>(),
    invite: vi.fn<McpOperations["reviewer"]["invite"]>(),
    manage: vi.fn<McpOperations["reviewer"]["manage"]>(),
    respond: vi.fn<McpOperations["reviewer"]["respond"]>(),
    saveDraft: vi.fn<McpOperations["reviewer"]["saveDraft"]>(),
    submit: vi.fn<McpOperations["reviewer"]["submit"]>(),
  },
  navigation: {
    read: vi.fn<McpOperations["navigation"]["read"]>(),
    change: vi.fn<McpOperations["navigation"]["change"]>(),
  },
  organizations: {
    list: vi.fn<McpOperations["organizations"]["list"]>(),
    read: vi.fn<McpOperations["organizations"]["read"]>(),
    create: vi.fn<McpOperations["organizations"]["create"]>(),
    rename: vi.fn<McpOperations["organizations"]["rename"]>(),
    invite: vi.fn<McpOperations["organizations"]["invite"]>(),
    revoke: vi.fn<McpOperations["organizations"]["revoke"]>(),
    invitation: vi.fn<McpOperations["organizations"]["invitation"]>(),
    accept: vi.fn<McpOperations["organizations"]["accept"]>(),
    requestAccess: vi.fn<McpOperations["organizations"]["requestAccess"]>(),
    accessRequests: vi.fn<McpOperations["organizations"]["accessRequests"]>(),
    reviewAccessRequest: vi.fn<McpOperations["organizations"]["reviewAccessRequest"]>(),
  },
  demo: {
    read: vi.fn<McpOperations["demo"]["read"]>(),
    start: vi.fn<McpOperations["demo"]["start"]>(),
  },

  workspace: {
    listReviews: vi.fn<WorkspaceOperations["listReviews"]>(),
    listContactApplications: vi.fn<WorkspaceOperations["listContactApplications"]>(),
    listContacts: vi.fn<WorkspaceOperations["listContacts"]>(),
    getContact: vi.fn<WorkspaceOperations["getContact"]>(),
    contactHistory: vi.fn<WorkspaceOperations["contactHistory"]>(),
    changeContact: vi.fn<WorkspaceOperations["changeContact"]>(),
    selectContact: vi.fn<WorkspaceOperations["selectContact"]>(),
    saveReview: vi.fn<WorkspaceOperations["saveReview"]>(),
    createApplication: vi.fn<WorkspaceOperations["createApplication"]>(),
    editApplication: vi.fn<WorkspaceOperations["editApplication"]>(),
    createRound: vi.fn<WorkspaceOperations["createRound"]>(),
    editRound: vi.fn<WorkspaceOperations["editRound"]>(),
    deleteRound: vi.fn<WorkspaceOperations["deleteRound"]>(),
    readApplication: vi.fn<WorkspaceOperations["readApplication"]>(),
    readRound: vi.fn<WorkspaceOperations["readRound"]>(),
    listApplications: vi.fn<WorkspaceOperations["listApplications"]>(),
    roundContent: vi.fn<WorkspaceOperations["roundContent"]>(),
    applicationContent: vi.fn<WorkspaceOperations["applicationContent"]>(),
    roundHistory: vi.fn<WorkspaceOperations["roundHistory"]>(),
    applicationHistory: vi.fn<WorkspaceOperations["applicationHistory"]>(),
    saveRecommendation: vi.fn<WorkspaceOperations["saveRecommendation"]>(),
    listRounds: vi.fn<WorkspaceOperations["listRounds"]>(),
    listWorkspaceActivity: vi.fn<WorkspaceOperations["listWorkspaceActivity"]>(),
  },
  team: {
    workspacesPage: vi.fn<TeamOperations["workspacesPage"]>(),
    teamOverview: vi.fn<TeamOperations["teamOverview"]>(),
    membersPage: vi.fn<TeamOperations["membersPage"]>(),
    invitationsPage: vi.fn<TeamOperations["invitationsPage"]>(),
    teamHistoryPage: vi.fn<TeamOperations["teamHistoryPage"]>(),
    teamEvent: vi.fn<TeamOperations["teamEvent"]>(),
    inviteMember: vi.fn<TeamOperations["inviteMember"]>(),
    resendMemberInvitation: vi.fn<TeamOperations["resendMemberInvitation"]>(),
    revokeMemberInvitation: vi.fn<TeamOperations["revokeMemberInvitation"]>(),
    changeMember: vi.fn<TeamOperations["changeMember"]>(),
    removeMember: vi.fn<TeamOperations["removeMember"]>(),
  },
});
