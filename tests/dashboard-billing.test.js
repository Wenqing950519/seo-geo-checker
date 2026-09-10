const assert = require("node:assert/strict");
const { createDashboardService } = require("../services/api/application/dashboard-service.js");
const { createSqliteDashboardStore } = require("../services/api/storage/dashboard-store.js");

const NOW = "2026-09-10T00:00:00.000Z";
let clock = new Date(NOW);
const store = createSqliteDashboardStore();
const service = createDashboardService({ store, tokenPepper: "dashboard-billing-test-pepper-with-at-least-32-bytes", now: () => clock });

async function user() {
  const invitation = await service.createInvitation({ email: "billing@example.com" });
  return service.verifyInvitation({ token: invitation.invitation_token });
}

async function main() {
  const account = await user();
  const free = await service.getEntitlement({ sessionToken: account.session_token });
  assert.deepEqual({ plan: free.plan, limit: free.active_project_limit, manual: free.manual_run_limit }, { plan: "free", limit: 2, manual: 0 });
  const projects = [];
  for (let index = 0; index < 2; index += 1) projects.push(await service.createProject({ sessionToken: account.session_token, name: `Free ${index}`, siteUrl: `https://free-${index}.example` }));
  await assert.rejects(service.createProject({ sessionToken: account.session_token, name: "Too many", siteUrl: "https://third.example" }), (error) => error.code === "project_limit_reached");
  const paid = await service.applySandboxPayment({ accountId: account.account_id, providerTransactionId: "sandbox_tx_1", providerPeriodId: "sandbox_period_1" });
  assert.equal(paid.plan, "paid_beta");
  assert.equal(paid.price_twd, 330);
  assert.equal(paid.manual_run_limit, 24);
  for (let index = 2; index < 6; index += 1) projects.push(await service.createProject({ sessionToken: account.session_token, name: `Paid ${index}`, siteUrl: `https://paid-${index}.example` }));
  await assert.rejects(service.createProject({ sessionToken: account.session_token, name: "Seventh", siteUrl: "https://seventh.example" }), (error) => error.code === "project_limit_reached");
  for (let index = 0; index < 6; index += 1) {
    const job = await service.requestManualTrackingRun({ sessionToken: account.session_token, projectId: projects[index].projectId });
    assert.equal(job.status, "queued");
    if (index === 0) assert.equal(job.manual_updates_remaining, 23);
  }
  await assert.rejects(service.requestManualTrackingRun({ sessionToken: account.session_token, projectId: projects[0].projectId }), (error) => error.code === "daily_manual_limit");
  for (let index = 0; index < 18; index += 1) {
    clock = new Date(`2026-09-${String(11 + Math.floor(index / 6)).padStart(2, "0")}T00:00:00.000Z`);
    const job = await service.requestManualTrackingRun({ sessionToken: account.session_token, projectId: projects[index % projects.length].projectId });
    if (index === 0) await service.settleTrackingJob({ jobId: job.job_id, state: "partial" });
  }
  clock = new Date("2026-09-14T00:00:00.000Z");
  const finalJob = await service.requestManualTrackingRun({ sessionToken: account.session_token, projectId: projects[0].projectId });
  assert.equal(finalJob.status, "queued", "a partial job releases its reservation");
  await assert.rejects(service.requestManualTrackingRun({ sessionToken: account.session_token, projectId: projects[0].projectId }), (error) => error.code === "manual_quota_exhausted");
  store.close();
  console.log("dashboard billing tests passed");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
