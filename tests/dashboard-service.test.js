const assert = require("node:assert/strict");
const { createDashboardService, ENGINE_IDS } = require("../services/api/application/dashboard-service.js");
const { createSqliteDashboardStore } = require("../services/api/storage/dashboard-store.js");

const NOW = "2026-09-10T00:00:00.000Z";
const PEPPER = "dashboard-test-pepper-with-at-least-thirty-two-bytes";

async function dashboardUser(service, email) {
  const invitation = await service.createInvitation({ email });
  return service.verifyInvitation({ token: invitation.invitation_token });
}

function observations(questionSet, { unknownOne = false } = {}) {
  return questionSet.questions.flatMap((question, questionIndex) => ENGINE_IDS.map((engine, engineIndex) => {
    const unknown = unknownOne && questionIndex === 0 && engineIndex === 0;
    return unknown ? {
      questionId: question.questionId, engine, status: "unknown", brandMentioned: null, officialCitation: null
    } : {
      questionId: question.questionId, engine, model: `${engine}-fixture`, status: "measured",
      brandMentioned: questionIndex === 0, officialCitation: engine === "perplexity",
      rawAnswer: `Observed ${question.text} on ${engine}`,
      citations: [{ url: engine === "perplexity" ? "https://brand.example/about" : "https://source.example/article", isOfficial: engine === "perplexity" }]
    };
  }));
}

async function main() {
  const store = createSqliteDashboardStore();
  const service = createDashboardService({ store, tokenPepper: PEPPER, now: () => new Date(NOW) });
  const alice = await dashboardUser(service, "alice@example.com");
  const project = await service.createProject({
    sessionToken: alice.session_token, name: "Brand tracking", siteUrl: "https://brand.example", timezone: "Asia/Taipei"
  });
  assert.equal(project.cadence, "weekly");
  assert.match(project.nextRunAt, /^2026-09-17T/);

  const questionSet = await service.createQuestionSet({
    sessionToken: alice.session_token, projectId: project.projectId, locale: "zh-TW",
    questions: [
      { text: "台北咖啡店推薦", intent: "discovery", tags: ["local"] },
      { text: "適合工作的咖啡店", intent: "consideration", tags: ["work"] }
    ]
  });
  assert.equal(questionSet.version, 1);
  assert.equal(questionSet.questions.length, 2);

  const firstRun = await service.recordTrackingRun({
    projectId: project.projectId, questionSetId: questionSet.questionSetId,
    scheduledAt: "2026-08-20T00:00:00.000Z", observedAt: "2026-08-20T00:10:00.000Z",
    observations: observations(questionSet)
  });
  assert.equal(firstRun.state, "complete");

  const secondRun = await service.recordTrackingRun({
    projectId: project.projectId, questionSetId: questionSet.questionSetId,
    scheduledAt: "2026-09-03T00:00:00.000Z", observedAt: "2026-09-03T00:10:00.000Z",
    observations: observations(questionSet, { unknownOne: true })
  });
  assert.equal(secondRun.state, "partial");
  assert.deepEqual(secondRun.coverage, { expected: 8, measured: 7, unknown: 1, failed: 0 });

  const overview = await service.getOverview({ sessionToken: alice.session_token, projectId: project.projectId, weeks: 4 });
  assert.equal(overview.summary.status, "available");
  assert.equal(overview.summary.metrics.measurement_coverage.value, 87.5);
  assert.equal(overview.summary.metrics.brand_mention_rate.denominator, 7, "unknown must not become measured zero");
  assert.equal(overview.summary.metrics.brand_mention_rate.comparison_status, "comparable");
  assert.equal(JSON.stringify(overview).includes("raw_answer"), false, "summary responses must not leak raw evidence");
  assert.equal(JSON.stringify(overview).includes("quota"), false);
  assert.equal(JSON.stringify(overview).includes("cost"), false);
  assert.equal(JSON.stringify(overview).includes("tenant"), false);

  const evidenceId = store.listObservationsForRuns([secondRun.runId]).find((item) => item.status === "measured").observationId;
  const evidence = await service.getEvidence({ sessionToken: alice.session_token, projectId: project.projectId, observationId: evidenceId });
  assert.match(evidence.raw_answer, /^Observed /);
  assert.equal(evidence.citations[0].isOfficial, false);
  assert.equal(Object.hasOwn(evidence, "provider_cost"), false);
  assert.equal(Object.hasOwn(evidence, "developer_job_id"), false);

  const citations = await service.getCitations({ sessionToken: alice.session_token, projectId: project.projectId, weeks: 4 });
  assert.deepEqual(citations.sources.map((item) => item.domain), ["source.example", "brand.example"]);
  const trackedQuestions = await service.listTrackedQuestions({ sessionToken: alice.session_token, projectId: project.projectId });
  assert.equal(trackedQuestions[0].questions[0].latest_observations.length, 4);

  const annotation = await service.createAnnotation({
    sessionToken: alice.session_token, projectId: project.projectId,
    occurredAt: "2026-09-04T00:00:00.000Z", note: "Updated store opening hours"
  });
  assert.equal(annotation.note, "Updated store opening hours");

  const bob = await dashboardUser(service, "bob@example.com");
  await assert.rejects(
    service.getOverview({ sessionToken: bob.session_token, projectId: project.projectId, weeks: 4 }),
    (error) => error.code === "project_access_denied" && error.statusCode === 404
  );
  assert.equal(await service.authenticateSession("gcs_developer_management_session"), null, "Developer Console session is never a Dashboard session");
  assert.equal(await service.authenticateSession("gck_developer_api_key"), null, "Developer API keys are never a Dashboard session");
  await assert.rejects(
    service.recordTrackingRun({
      projectId: project.projectId, questionSetId: questionSet.questionSetId,
      scheduledAt: NOW, observedAt: NOW, observations: []
    }),
    (error) => error.code === "invalid_run"
  );

  store.close();
  console.log("dashboard service tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
