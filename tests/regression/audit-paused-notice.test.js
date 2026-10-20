const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// New audits have been closed since 2026-09-09 (AUDIT_ADMISSION_ENABLED=false), so
// 「開始檢查」 failed with the Worker's English 503. Until the MCAC quick check opens
// (2026-10-20 decision) the home page says so under the URL box, and a submit shows the
// notice instead of opening the modal or calling the API. Remove this test together with
// the notice and the <audit-paused> block on the day MCAC opens.
const home = fs.readFileSync(path.resolve(__dirname, "../../apps/web/public/home.html"), "utf8");

// 1. The notice sits right under the URL box and says new audits are paused.
const notice = home.match(/<\/form>\s*<p id="audit-paused-notice"[^>]*>([^<]+)<\/p>/);
assert.ok(notice, "the paused notice must sit right under the URL form");
assert.match(notice[1], /檢測改版中/);
assert.match(notice[1], /暫停受理/);

// 2. A submit stops at the notice: nothing is submitted and the modal stays closed.
const block = home.match(/\/\/ <audit-paused>([\s\S]*?)\/\/ <\/audit-paused>/);
assert.ok(block, "home must keep the paused check between // <audit-paused> markers");
const status = { textContent: "" };
const elements = { "audit-paused-notice": {}, "audit-status": status };
const context = { document: { getElementById: (id) => elements[id] || null } };
vm.createContext(context);
vm.runInContext(block[1], context);
assert.equal(context.showAuditPaused(), true, "the check reports the pause while the notice is on the page");
assert.match(status.textContent, /開放前無法送出/, "a submit says it was not sent");
delete elements["audit-paused-notice"];
assert.equal(context.showAuditPaused(), false, "without the notice the check lets the audit run");

const submit = home.match(/getElementById\('audit-form'\)\?\.addEventListener\('submit', \(e\) => \{([\s\S]*?)\n\}\);/);
assert.ok(submit, "home must keep the audit form submit handler");
const handler = submit[1];
const guard = handler.indexOf("if (showAuditPaused()) return;");
assert.ok(guard > -1, "the submit handler must stop at the paused check");
for (const later of ["url_submitted", "openModal('audit-confirm-modal')"]) {
  assert.ok(handler.indexOf(later) > guard, `the paused check must come before ${later}`);
}
assert.ok(handler.indexOf("e.preventDefault()") < guard, "the form must not navigate while paused");

console.log("audit paused notice tests passed");
