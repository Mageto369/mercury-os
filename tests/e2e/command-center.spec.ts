import { expect, test } from "@playwright/test";

const workspaces = [
  "Market Outlook",
  "Discovery",
  "Social Radar",
  "Opportunities",
  "Portfolio",
  "Risk",
  "Research",
  "Models",
  "Workflows",
  "Audit",
];

const allowedActions = new Set([
  "WATCH",
  "GEM_WATCH",
  "WAVE_ACTIVE",
  "PRESS",
  "REDUCE",
  "EXIT",
  "BLOCK",
]);
const allowedJobStatuses = new Set(["completed", "degraded", "skipped"]);

test("command center and autonomous organization load through workspaces", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Calculated Aggression" }),
  ).toBeVisible();
  await expect(page.getByText("Opportunity Command")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Run Intelligence Pulse/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Workflows", exact: true }).click();
  await expect(page.getByText("Workflows workspace")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Autonomous Research Control" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mercury Agent Fleet" }),
  ).toBeVisible();
  const autonomy = page.getByLabel("Autonomy readiness");
  await expect(
    autonomy.getByText("Capital execution", { exact: true }),
  ).toBeVisible();
  await expect(autonomy.getByText("LOCKED", { exact: true })).toBeVisible();
  await expect(page.getByText("Machine Event Stream")).toBeVisible();
  await expect(page.getByText("Mercury Supervisor")).toBeVisible();
  await expect(page.getByText("Custodian", { exact: true })).toBeVisible();
  await expect(page.getByText("Arbiter", { exact: true })).toBeVisible();
  await expect(page.getByText("Sentinel", { exact: true })).toBeVisible();
  await expect(page.getByText("Vector", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "Opportunities", exact: true })
    .click();
  await expect(page.getByText("Opportunity Command")).toBeVisible();
  await page.locator("select").selectOption("gem");
  await page.getByRole("button", { name: /Run Intelligence Pulse/i }).click();
  await expect(
    page.getByRole("button", { name: /Run Intelligence Pulse/i }),
  ).toBeEnabled();
});

test("all workspaces remain reachable and render their own content", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "covered by mobile navigation test");
  await page.goto("/");
  for (const workspace of workspaces) {
    await page.getByRole("button", { name: workspace, exact: true }).click();
    await expect(page.getByText(`${workspace} workspace`)).toBeVisible();
  }
  await page.getByRole("button", { name: "Portfolio", exact: true }).click();
  await expect(page.getByText(/Shadow/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Audit", exact: true }).click();
  await expect(page.getByText(/Activation/i).first()).toBeVisible();
});

test("agent registry is complete and authority remains bounded", async ({
  request,
}) => {
  const response = await request.get("/api/agents");
  expect(response.ok()).toBeTruthy();
  const json = await response.json();
  expect(json.mode).toBe("shadow");
  expect(json.capitalExecutionEnabled).toBe(false);
  expect(json.supervisor).toBe("mercury-supervisor");
  expect(json.agents).toHaveLength(12);
  expect(json.controls.governance.status).toBe("healthy");
  expect(json.controls.governance.capitalExecutionEnabled).toBe(false);
  expect(json.controls.dataQuality.status).toBe("offline");
  expect(json.controls.dataQuality.staleDomains).toContain("database");

  const ids = new Set(json.agents.map((agent: { id: string }) => agent.id));
  for (const required of [
    "mercury-supervisor",
    "data-quality-agent",
    "governance-agent",
    "market-regime-agent",
    "liquidity-agent",
    "gem-scout-agent",
    "social-wave-agent",
    "regulatory-agent",
    "structure-agent",
    "risk-sentinel-agent",
    "opportunity-director-agent",
    "learning-agent",
  ])
    expect(ids.has(required)).toBeTruthy();

  for (const agent of json.agents) {
    expect(agent.mission.length).toBeGreaterThan(20);
    expect(Array.isArray(agent.authority)).toBeTruthy();
    expect(Array.isArray(agent.hardLimits)).toBeTruthy();
    expect(agent.hardLimits.length).toBeGreaterThan(0);
    expect(agent.authority).not.toContain("trade");
    expect(agent.authority).not.toContain("broker");
  }
});

test("supervisor mission assignment is open and bounded", async ({
  request,
}) => {
  const invalid = await request.post("/api/agents/run", {
    data: { jobs: ["not-a-job"] },
  });
  expect(invalid.status()).toBe(400);

  const assigned = await request.post("/api/agents/run", {
    data: { jobs: ["liquidity-pulse", "risk-gateway", "market-regime"] },
  });
  expect(assigned.ok()).toBeTruthy();
  const json = await assigned.json();
  expect(json.supervisor).toBe("mercury-supervisor");
  expect(json.mode).toBe("shadow");
  expect(json.capitalExecutionEnabled).toBe(false);
  expect(json.dueJobs).toBe(3);
  expect(json.assignments).toHaveLength(3);
  expect(json.controls.governance.status).toBe("healthy");
  expect(json.controls.dataQuality.status).toBe("offline");
  expect(json.completed + json.degraded + json.skipped).toBe(
    json.assignments.length,
  );
  for (const assignment of json.assignments) {
    expect(allowedJobStatuses.has(assignment.status)).toBeTruthy();
    expect(typeof assignment.agentId).toBe("string");
    expect(typeof assignment.agentName).toBe("string");
    expect(assignment.persisted).toBe(false);
  }
});

test("shadow APIs, ingestion boundaries and cron remain safe without providers", async ({
  request,
}) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const healthJson = await health.json();
  expect(healthJson.status).toBe("ok");
  expect(healthJson.service).toBe("mercury-os");
  expect(healthJson.version).toBe("0.4.0");
  expect(healthJson.totalProviders).toBe(18);
  expect(healthJson.providers.nasdaqDelayed).toBe(true);
  expect(healthJson.providers.deepseek).toBe(false);
  expect(healthJson.providers.kimi).toBe(false);
  expect(healthJson.runtime.mode).toBe("shadow");
  expect(healthJson.runtime.capitalExecutionEnabled).toBe(false);
  expect(healthJson.runtime.databaseConfigured).toBe(false);
  expect(healthJson.runtime.databaseReachable).toBe(false);
  expect(healthJson.runtime.schemaReady).toBe(false);
  expect(healthJson.requiredRuntimeReady).toBe(false);
  expect(healthJson.warehouse.liveSecurities).toBe(0);
  expect(healthJson.warehouse.liveOpportunities).toBe(0);

  const autonomy = await request.get("/api/autonomy/status");
  expect(autonomy.ok()).toBeTruthy();
  const autonomyJson = await autonomy.json();
  expect(autonomyJson.mode).toBe("shadow");
  expect(autonomyJson.capitalExecutionEnabled).toBe(false);
  expect(autonomyJson.autonomousResearchEnabled).toBe(true);
  expect(autonomyJson.requiredInfrastructureReady).toBe(false);
  expect(autonomyJson.guardrails.capitalExecutionEnabled).toBe(false);
  expect(autonomyJson.jobs).toHaveLength(9);

  for (const path of [
    "/api/events/recent",
    "/api/social/trends",
    "/api/universe",
  ]) {
    const response = await request.get(path);
    expect(response.ok()).toBeTruthy();
  }

  const openSocial = await request.post("/api/ingest/social", {
    data: {
      signals: [
        {
          symbol: "TEST",
          source: "reddit",
          mentions: 2,
          velocity: 40,
          sentiment: 10,
          promotionRisk: 20,
          crowding: 15,
          observedAt: new Date().toISOString(),
        },
      ],
    },
  });
  expect(openSocial.status()).toBe(503);

  const pulse = await request.post("/api/control/pulse");
  expect(pulse.ok()).toBeTruthy();
  expect((await pulse.json()).executionEnabled).toBe(false);

  const cron = await request.get("/api/cron/intelligence");
  expect(cron.ok()).toBeTruthy();
  const cronJson = await cron.json();
  expect(cronJson.mode).toBe("shadow");
  expect(cronJson.autonomousExecution).toBe(false);
  expect(cronJson.supervisor).toBe("mercury-supervisor");
  expect(Array.isArray(cronJson.jobs)).toBeTruthy();
  expect(cronJson.completed + cronJson.degraded + cronJson.skipped).toBe(
    cronJson.jobs.length,
  );
  expect(cronJson.persistedAudits).toBe(0);
  for (const assignment of cronJson.jobs) {
    expect(allowedJobStatuses.has(assignment.status)).toBeTruthy();
    expect(typeof assignment.agentId).toBe("string");
    expect(typeof assignment.job).toBe("string");
  }

  const manualRun = await request.post("/api/autonomy/run", {
    headers: { authorization: "Bearer mercury-e2e-cron-secret" },
    data: { job: "market-regime" },
  });
  expect(manualRun.ok()).toBeTruthy();
  const manualJson = await manualRun.json();
  expect(manualJson.mode).toBe("shadow");
  expect(manualJson.capitalExecutionEnabled).toBe(false);
  expect(manualJson.result.status).toBe("skipped");
  expect(manualJson.result.missingProviders).toContain("database");
  expect(manualJson.audit.persisted).toBe(false);

  const opportunities = await request.get("/api/opportunities");
  expect(opportunities.ok()).toBeTruthy();
  const opportunityJson = await opportunities.json();
  expect(Array.isArray(opportunityJson.opportunities)).toBeTruthy();
  expect(opportunityJson.opportunities.length).toBeGreaterThan(0);

  let priorAsymmetry = 101;
  for (const item of opportunityJson.opportunities) {
    const decision = item.decision;
    expect(decision.alpha).toBeGreaterThanOrEqual(0);
    expect(decision.alpha).toBeLessThanOrEqual(100);
    expect(decision.asymmetry).toBeGreaterThanOrEqual(0);
    expect(decision.asymmetry).toBeLessThanOrEqual(100);
    expect(decision.aggression).toBeGreaterThanOrEqual(0);
    expect(decision.aggression).toBeLessThanOrEqual(5);
    expect(allowedActions.has(decision.action)).toBeTruthy();
    expect(decision.asymmetry).toBeLessThanOrEqual(priorAsymmetry);
    priorAsymmetry = decision.asymmetry;
  }
});

test("mobile layout keeps command and workflow controls usable", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile project only");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Calculated Aggression" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Run Intelligence Pulse/i }),
  ).toBeVisible();
  for (const workspace of ["Risk", "Social Radar", "Workflows"]) {
    await page.getByRole("button", { name: workspace, exact: true }).click();
    await expect(page.getByText(`${workspace} workspace`)).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { name: "Autonomous Research Control" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Mercury Agent Fleet" }),
  ).toBeVisible();
});
