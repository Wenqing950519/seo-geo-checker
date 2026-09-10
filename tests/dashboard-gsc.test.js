const assert = require("node:assert/strict");
const { createDashboardService } = require("../services/api/application/dashboard-service.js");
const { createSqliteDashboardStore } = require("../services/api/storage/dashboard-store.js");

(async () => {
  let tick = Date.parse("2026-09-10T00:00:00.000Z");
  const service = createDashboardService({ store: createSqliteDashboardStore(), tokenPepper: "dashboard-test-pepper-with-at-least-thirty-two-bytes", googleTokenKey: Buffer.alloc(32, 7), now: () => new Date(tick), gscClient: { fetchDailyMetrics: async () => [{ keys: ["2026-09-01"], clicks: 4, impressions: 20, ctr: .2, position: 3.5 }] } });
  const invite = await service.createInvitation({ email: "owner@example.com" });
  const session = await service.verifyInvitation({ token: invite.invitation_token });
  const project = await service.createProject({ sessionToken: session.session_token, name: "Example", siteUrl: "https://www.example.com", timezone: "Asia/Taipei" });
  await assert.rejects(() => service.connectGoogleSearchConsole({ sessionToken: session.session_token, projectId: project.projectId, googleEmail: "owner@example.com", propertyUri: "sc-domain:other.example", refreshToken: "x".repeat(30) }), { code: "gsc_property_mismatch" });
  await service.connectGoogleSearchConsole({ sessionToken: session.session_token, projectId: project.projectId, googleEmail: "owner@example.com", propertyUri: "sc-domain:example.com", refreshToken: "x".repeat(30), scopes: ["https://www.googleapis.com/auth/webmasters.readonly"] });
  const result = await service.syncGoogleSearchConsole({ sessionToken: session.session_token, projectId: project.projectId, from: "2026-09-01", to: "2026-09-01" });
  assert.equal(result.imported_rows, 1);
  const summary = await service.getGscSummary({ sessionToken: session.session_token, projectId: project.projectId, from: "2026-09-01", to: "2026-09-01" });
  assert.equal(summary.data[0].clicks, 4);
  await service.disconnectGoogleSearchConsole({ sessionToken: session.session_token, projectId: project.projectId });
  assert.equal((await service.getGscSummary({ sessionToken: session.session_token, projectId: project.projectId, from: "2026-09-01", to: "2026-09-01" })).data.length, 0);
  console.log("dashboard GSC tests passed");
})();
