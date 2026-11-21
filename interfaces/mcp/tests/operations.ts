import { vi } from "vite-plus/test";

import type { McpOperations } from "../src/app/operations";

export const testOperations = (): McpOperations => ({
  rounds: {
    createRound: vi.fn<McpOperations["rounds"]["createRound"]>(),
    editRound: vi.fn<McpOperations["rounds"]["editRound"]>(),
    deleteRound: vi.fn<McpOperations["rounds"]["deleteRound"]>(),
  },
  applications: {
    createApplication: vi.fn<McpOperations["applications"]["createApplication"]>(),
    editApplication: vi.fn<McpOperations["applications"]["editApplication"]>(),
    selectContact: vi.fn<McpOperations["applications"]["selectContact"]>(),
  },
  reviews: {
    saveReview: vi.fn<McpOperations["reviews"]["saveReview"]>(),
  },
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
  recommendations: {
    saveRecommendation: vi.fn<McpOperations["recommendations"]["saveRecommendation"]>(),
  },
  grantmaking: {
    listRoundSummaries: vi.fn<McpOperations["grantmaking"]["listRoundSummaries"]>(),
    readRound: vi.fn<McpOperations["grantmaking"]["readRound"]>(),
    listApplications: vi.fn<McpOperations["grantmaking"]["listApplications"]>(),
    readApplication: vi.fn<McpOperations["grantmaking"]["readApplication"]>(),
    listReviews: vi.fn<McpOperations["grantmaking"]["listReviews"]>(),
    roundContent: vi.fn<McpOperations["grantmaking"]["roundContent"]>(),
    applicationContent: vi.fn<McpOperations["grantmaking"]["applicationContent"]>(),
    roundHistory: vi.fn<McpOperations["grantmaking"]["roundHistory"]>(),
    applicationHistory: vi.fn<McpOperations["grantmaking"]["applicationHistory"]>(),
    listWorkspaceActivity: vi.fn<McpOperations["grantmaking"]["listWorkspaceActivity"]>(),
    searchWorkspace: vi.fn<McpOperations["grantmaking"]["searchWorkspace"]>(),
    listContactApplications: vi.fn<McpOperations["grantmaking"]["listContactApplications"]>(),
  },
  contacts: {
    listContactSummaries: vi.fn<McpOperations["contacts"]["listContactSummaries"]>(),
    getContact: vi.fn<McpOperations["contacts"]["getContact"]>(),
    changeContact: vi.fn<McpOperations["contacts"]["changeContact"]>(),
  },
  organizations: {
    workspaceHomeUrl: vi.fn<McpOperations["organizations"]["workspaceHomeUrl"]>(),
    workspacesPage: vi.fn<McpOperations["organizations"]["workspacesPage"]>(),
    membersPage: vi.fn<McpOperations["organizations"]["membersPage"]>(),
  },
  demo: {
    start: vi.fn<McpOperations["demo"]["start"]>(),
  },
});
