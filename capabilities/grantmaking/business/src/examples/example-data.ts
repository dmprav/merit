import { fromMinorUnits } from "@merit/money";

import { fundingRoundOverviewSchema } from "../domain/model";

// Hand-authored fictional submissions and evidence shared by the demo, MCP, and local seed.
const criteria = [
  {
    id: "c71be2aa-4794-4f1d-b5b7-6e656c2fa086",
    title: "Community connection",
    description:
      "How the activity will bring people together and help them form lasting relationships, including people who may find it difficult to take part.",
  },
  {
    id: "59a76eae-9d64-4766-b2c5-7cf48aa710bf",
    title: "Evidence of demand",
    description:
      "What the applicant has learned from local people, earlier activities, or other evidence about the need for the project and likely participation.",
  },
  {
    id: "af1fd8c6-5525-4972-acd6-84066b6c7fcf",
    title: "Delivery readiness",
    description:
      "Whether the people, venues, partnerships, and practical arrangements support the proposed plan, and which uncertainties still need resolving.",
  },
  {
    id: "51867ad5-cdeb-44cb-8571-cd609256f208",
    title: "Budget and value",
    description:
      "How clearly the costs relate to the planned activity and whether the requested funding is reasonable for what the project aims to deliver.",
  },
];

export const exampleRound = fundingRoundOverviewSchema.parse({
  id: "local-connections-2027",
  title: "Local Connections 2027",
  foundation: "Alder Foundation",
  purpose:
    "Local Connections supports activities that help adults in the local area build lasting social connections. The round focuses on shared experiences that give people a reason to meet regularly, particularly those who find it difficult to take part in community life. Proposals should explain who they hope to reach, how people will get involved, and what will help connections continue beyond the funded activity.",
  manager: "Dana Reed",
  currency: "EUR",
  budget: fromMinorUnits(6000000n),
  meetingDate: "2027-01-21",
  snapshotDate: "2027-01-18",
  decisionStatus: "Decisions pending",
  criteria: criteria,
  applications: [
    {
      id: "A1",
      title: "Neighbour Table",
      version: 1,
      requested: fromMinorUnits(2400000n),
      summary: "24 weekly meals with facilitated conversation, aiming to involve 60 residents.",
      submission: {
        version: 1,
        organization: "Neighbourhood Kitchen",
        contact: "Leah Martin",
        submittedOn: "2027-01-08",
        projectPeriod: "March–August 2027",
        answers: [
          {
            questionId: "ea6818f9-940d-417b-b094-ed0c0d145f5b",
            question: "Project overview",
            response:
              "Neighbour Table will bring local residents together for a weekly shared meal over 24 weeks. Each session combines cooking, a low-cost lunch and facilitated conversation. We aim to involve 60 residents across the programme, particularly adults living alone who do not currently attend community activities.",
          },
          {
            questionId: "31512cd2-519b-4baa-b9af-f8870df5c084",
            question: "Community need",
            response:
              "Our six-session pilot recorded 90 attendances. We did not count unique people, so this is not a measure of how many residents we reached. Of the 18 attendees who gave feedback, 14 said they would return. We will record unique participants and repeat attendance during the funded programme.",
          },
          {
            questionId: "6cf6d5da-fb0f-4da3-9268-49f572a9c7b7",
            question: "Delivery plan",
            response:
              "The community hall has confirmed all 24 dates. Our coordinator and eight volunteers will prepare the meals and welcome participants. Local community groups will help us reach residents who may be reluctant to attend on their own. Funding covers food, coordination, room hire and volunteer support.",
          },
          {
            questionId: "e327abe8-f952-4789-ac6d-3a6e5e02d8f4",
            question: "Submitted budget breakdown (EUR)",
            response:
              "Food and supplies: €9600.00\nProject coordinator: €8400.00\nHall hire: €3600.00\nVolunteer training and travel: €2400.00",
          },
        ],
      },
      evidence: [
        {
          version: 1,
          passage:
            "Our six-session pilot recorded 90 attendances. We did not count unique people. In feedback from 18 attendees, 14 said they would return. The community hall has confirmed all 24 dates, and our coordinator and eight volunteers will run them.",
        },
      ],
      managerRecommendation: {
        position: "Fund",
        allocation: fromMinorUnits(2400000n),
        reasoning: "Request simple reporting on unique participants and repeat attendance.",
        recorded: {
          date: "2027-01-16",
          applicationVersion: 1,
        },
        author: {
          name: "Dana Reed",
        },
      },
      attention: [],
      intakeStatus: "ready",
      contactId: "9653d408-81b5-5872-b176-d4e161d7754a",
      reviews: {
        revision: 0,
        requests: [
          {
            id: "865d9499-383d-51ad-b77c-443d996cfc1f",
            contactId: "35a69acf-adc5-5755-bc82-64726ae3e83c",
            reviewer: "Sam Morgan",
            applicationVersion: 1,
            criteriaVersion: 1,
            criteria: criteria,
            status: "received",
            recorder: null,
            closedBy: null,
          },
          {
            id: "d5c9141b-2628-50c7-9748-e066a8403b1d",
            contactId: "fcb9c38a-72df-5845-bfb7-2060022f1beb",
            reviewer: "Jules Patel",
            applicationVersion: 1,
            criteriaVersion: 1,
            criteria: criteria,
            status: "received",
            recorder: null,
            closedBy: null,
          },
        ],
        assessments: [
          {
            id: "c58ea4b5-f34c-5419-a79d-a4cb24d69c35",
            contactId: "35a69acf-adc5-5755-bc82-64726ae3e83c",
            reviewer: "Sam Morgan",
            requestId: "865d9499-383d-51ad-b77c-443d996cfc1f",
            previousId: null,
            versions: [
              {
                content: {
                  applicationVersion: 1,
                  criteriaVersion: 1,
                  date: "2027-01-14",
                  position: "Fund",
                  amount: "24000.00",
                  reasoning:
                    "The pilot and delivery arrangements support the proposal. Distinguish the reach estimate from the pilot's attendance count.",
                  observations: [],
                },
                criteria: criteria,
                recorder: null,
                note: "",
              },
            ],
          },
          {
            id: "4cf223f0-93e0-5fb4-8fcf-85395283057b",
            contactId: "fcb9c38a-72df-5845-bfb7-2060022f1beb",
            reviewer: "Jules Patel",
            requestId: "d5c9141b-2628-50c7-9748-e066a8403b1d",
            previousId: null,
            versions: [
              {
                content: {
                  applicationVersion: 1,
                  criteriaVersion: 1,
                  date: "2027-01-15",
                  position: "Fund",
                  amount: "24000.00",
                  reasoning:
                    "Costs are explained and the plan is practical. Track unique participants and repeat attendance.",
                  observations: [],
                },
                criteria: criteria,
                recorder: null,
                note: "",
              },
            ],
          },
        ],
      },
    },
    {
      id: "A2",
      title: "Ride Together",
      version: 1,
      requested: fromMinorUnits(2800000n),
      summary:
        "40 shared trips to local activities for adults who cannot readily travel independently.",
      submission: {
        version: 1,
        organization: "Community Routes",
        contact: "Owen Clarke",
        submittedOn: "2027-01-09",
        projectPeriod: "April–November 2027",
        answers: [
          {
            questionId: "36aea6a2-7b4a-4a5e-8477-125ca5a9df7a",
            question: "Project overview",
            response:
              "Ride Together will provide 40 shared trips to local activities for adults who cannot readily travel independently. Participants will be able to book a place through our coordinator, with support for people who do not use online booking. We want the journeys to help people build regular connections as well as reach an activity.",
          },
          {
            questionId: "175e707e-8d89-4651-bd08-69146f9aa638",
            question: "Community need",
            response:
              "In our survey of 32 prospective participants, 25 had missed an activity because they could not arrange transport. Respondents described relying on relatives or paying for individual taxis. We will use the first bookings to identify the most useful routes and activities.",
          },
          {
            questionId: "e2464d09-3011-403c-997c-fe283eb1d51f",
            question: "Delivery plan",
            response:
              "Our transport provider has discussed an accessible vehicle with us; dates and availability are not yet confirmed. The coordinator will agree routes, accessibility requirements and pickup arrangements before bookings open. The transport budget is provisional until we have written confirmation from the provider.",
          },
          {
            questionId: "a52bcc23-89f2-43e3-9a21-d79e1dba80c1",
            question: "Submitted budget breakdown (EUR)",
            response:
              "Accessible transport: €20000.00\nTrip coordination: €5000.00\nVolunteer travel and training: €2000.00\nOutreach and booking materials: €1000.00",
          },
        ],
      },
      evidence: [
        {
          version: 1,
          passage:
            "A survey of 32 prospective participants found that 25 had missed an activity because they could not arrange transport. Our transport provider has discussed an accessible vehicle with us; dates and availability are not yet confirmed.",
        },
      ],
      managerRecommendation: {
        position: "Fund with a condition",
        allocation: fromMinorUnits(2800000n),
        reasoning:
          "Reserve funding because the survey shows a clear need. The award proceeds only after written provider confirmation; keep Jules's preference for waiting visible.",
        recorded: {
          date: "2027-01-17",
          applicationVersion: 1,
        },
        author: {
          name: "Dana Reed",
        },
      },
      attention: ["Reviewers disagree on when to commit", "Written provider confirmation missing"],
      intakeStatus: "ready",
      contactId: "945e3a2d-aba9-552d-a448-68626973716c",
      reviews: {
        revision: 0,
        requests: [
          {
            id: "0a93f345-b11a-5cb9-ae94-34fb191330bf",
            contactId: "35a69acf-adc5-5755-bc82-64726ae3e83c",
            reviewer: "Sam Morgan",
            applicationVersion: 1,
            criteriaVersion: 1,
            criteria: criteria,
            status: "received",
            recorder: null,
            closedBy: null,
          },
          {
            id: "531f58d2-e4d6-5a8c-ad7f-872ec2157226",
            contactId: "fcb9c38a-72df-5845-bfb7-2060022f1beb",
            reviewer: "Jules Patel",
            applicationVersion: 1,
            criteriaVersion: 1,
            criteria: criteria,
            status: "received",
            recorder: null,
            closedBy: null,
          },
        ],
        assessments: [
          {
            id: "0bfbed25-17c1-58ea-ba16-f50bc05c120a",
            contactId: "35a69acf-adc5-5755-bc82-64726ae3e83c",
            reviewer: "Sam Morgan",
            requestId: "0a93f345-b11a-5cb9-ae94-34fb191330bf",
            previousId: null,
            versions: [
              {
                content: {
                  applicationVersion: 1,
                  criteriaVersion: 1,
                  date: "2027-01-15",
                  position: "Fund with a condition",
                  amount: "28000.00",
                  reasoning:
                    "Obtain written vehicle availability for the planned trips before the award proceeds.",
                  observations: [],
                },
                criteria: criteria,
                recorder: null,
                note: "",
              },
            ],
          },
          {
            id: "63bd950f-49e5-505f-9b64-ff74e1979d43",
            contactId: "fcb9c38a-72df-5845-bfb7-2060022f1beb",
            reviewer: "Jules Patel",
            requestId: "531f58d2-e4d6-5a8c-ad7f-872ec2157226",
            previousId: null,
            versions: [
              {
                content: {
                  applicationVersion: 1,
                  criteriaVersion: 1,
                  date: "2027-01-16",
                  position: "Defer",
                  amount: "0.00",
                  reasoning:
                    "Demand is supported, but delivery depends on an unconfirmed provider. Confirm the arrangement before making a funding commitment.",
                  observations: [],
                },
                criteria: criteria,
                recorder: null,
                note: "",
              },
            ],
          },
        ],
      },
    },
    {
      id: "A3",
      title: "Workshop Saturdays",
      version: 2,
      requested: fromMinorUnits(2200000n),
      summary:
        "12 group repair workshops, with 27 expressions of interest. The request rose from €18,000 to €22,000 after losing the free venue.",
      submission: {
        version: 2,
        organization: "Saturday Repair Collective",
        contact: "Maya Thompson",
        submittedOn: "2027-01-17",
        projectPeriod: "April–September 2027",
        answers: [
          {
            questionId: "5ad15526-e641-4b78-8d69-a37261a2a3f9",
            question: "Project overview",
            response:
              "Workshop Saturdays will run 12 fortnightly repair workshops for local adults who would like to learn practical skills and meet people in their neighbourhood. Participants will bring small household items or work on shared projects, with facilitators supporting safe repairs. Each session will include time for a tea break and conversation; the social element is as important to us as finishing a repair.",
          },
          {
            questionId: "3f540e1d-ce19-4e97-aa88-9db6bbc4a476",
            question: "Community need and participation",
            response:
              "We have received 27 expressions of interest through local community groups and conversations with residents. These are expressions of interest rather than confirmed bookings. We will contact everyone before the first workshop and offer places to adults who do not already take part in a regular group. No repair experience or personal tools will be required.",
          },
          {
            questionId: "bdd30bbe-a64c-421e-b2e3-6697862099b0",
            question: "Delivery plan",
            response:
              "We plan to hold the workshops between April and September, supported by paid facilitators and a project coordinator. The coordinator will manage bookings, accessibility needs and materials. We will track attendance and returning participants, and ask participants whether they have made connections they want to maintain outside the workshops.",
          },
          {
            questionId: "282b068c-b066-4bbb-926c-4da54b0b1494",
            question: "Revised venue and funding request",
            response:
              "The free venue is no longer available. Hiring the replacement venue would cost €4,000, bringing our request from €18,000 to €22,000. The replacement venue has not yet been booked. The number of workshops and planned activities are unchanged; we will confirm the venue and session dates before opening bookings.",
          },
          {
            questionId: "7077db30-88dd-4b86-b728-8f88bbab0d87",
            question: "Submitted budget breakdown (EUR)",
            response:
              "Workshop facilitators (12 sessions): €9000.00\nProject coordination: €4500.00\nTools, materials and safety equipment: €2500.00\nOutreach and participant support: €2000.00\nReplacement venue hire: €4000.00",
          },
        ],
      },
      evidence: [
        {
          version: 2,
          passage:
            "The free venue is no longer available. Hiring the replacement venue would cost €4,000, bringing our request to €22,000. The activities are unchanged. The replacement venue has not yet been booked.",
        },
      ],
      managerRecommendation: {
        position: "Defer",
        allocation: fromMinorUnits(0n),
        reasoning:
          "Wait for an updated budget assessment, the outstanding review, and venue confirmation. The remaining budget cannot cover the revised request in full.",
        recorded: {
          date: "2027-01-18",
          applicationVersion: 2,
        },
        author: {
          name: "Dana Reed",
        },
      },
      attention: ["Updated budget needs review", "Replacement venue not confirmed"],
      intakeStatus: "ready",
      contactId: "53385b64-18cc-543c-92f2-c2c78d838b8c",
      reviews: {
        revision: 0,
        requests: [
          {
            id: "255de745-9c4e-591b-ae11-5311a190b920",
            contactId: "35a69acf-adc5-5755-bc82-64726ae3e83c",
            reviewer: "Sam Morgan",
            applicationVersion: 1,
            criteriaVersion: 1,
            criteria: criteria,
            status: "received",
            recorder: null,
            closedBy: null,
          },
          {
            id: "e1295cba-8055-513f-9b9b-a296542e0008",
            contactId: "fcb9c38a-72df-5845-bfb7-2060022f1beb",
            reviewer: "Jules Patel",
            applicationVersion: 2,
            criteriaVersion: 1,
            criteria: criteria,
            status: "outstanding",
            recorder: null,
            closedBy: null,
          },
        ],
        assessments: [
          {
            id: "b2012523-df21-5aee-a117-69b4267e90f8",
            contactId: "35a69acf-adc5-5755-bc82-64726ae3e83c",
            reviewer: "Sam Morgan",
            requestId: "255de745-9c4e-591b-ae11-5311a190b920",
            previousId: null,
            versions: [
              {
                content: {
                  applicationVersion: 1,
                  criteriaVersion: 1,
                  date: "2027-01-14",
                  position: "Fund",
                  amount: "18000.00",
                  reasoning:
                    "The activities fit the round and there is initial interest. The free venue makes the budget credible.",
                  observations: [],
                },
                criteria: criteria,
                recorder: null,
                note: "",
              },
            ],
          },
        ],
      },
    },
  ],
  criteriaVersion: 1,
  criteriaHistory: [
    {
      version: 1,
      criteria: criteria,
    },
  ],
});
