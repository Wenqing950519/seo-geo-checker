import assert from "node:assert/strict";
import worker, { normalizePayload } from "../services/developer-d1-gateway/src/index.mjs";

const TOKEN = "g".repeat(40);

function createDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, params: null };
      calls.push(call);
      return {
        bind(...params) {
          call.params = params;
          return {
            async all() { return { success: true, results: [{ ok: 1 }], meta: { changes: 0 } }; }
          };
        }
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.all()));
    }
  };
}

async function invoke(body, { token = TOKEN, method = "POST", path = "/v1/query", db = createDb() } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = new Request(`https://gateway.example${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(body)
  });
  return { response: await worker.fetch(request, { DB: db, GATEWAY_TOKEN: TOKEN }), db };
}

assert.deepEqual(normalizePayload({ sql: "SELECT 1;", params: [] }), [{ sql: "SELECT 1", params: [] }]);
assert.throws(() => normalizePayload({ sql: "DROP TABLE developer_jobs" }), /Schema and transaction/);
assert.throws(() => normalizePayload({ sql: "SELECT 1; DELETE FROM developer_jobs" }), /Only one/);
assert.throws(() => normalizePayload({ sql: "SELECT 1", params: [{}] }), /scalar/);

{
  const { response, db } = await invoke({ sql: "SELECT ? AS ok", params: [1] });
  assert.equal(response.status, 200);
  assert.deepEqual(db.calls, [{ sql: "SELECT ? AS ok", params: [1] }]);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.equal(body.result[0].results[0].ok, 1);
  assert.equal(response.headers.get("cache-control"), "no-store");
}

{
  const { response, db } = await invoke({
    batch: [
      { sql: "INSERT INTO developer_tenants(tenant_id) VALUES (?)", params: ["tenant_1"] },
      { sql: "SELECT tenant_id FROM developer_tenants WHERE tenant_id = ?", params: ["tenant_1"] }
    ]
  });
  assert.equal(response.status, 200);
  assert.equal(db.calls.length, 2);
}

{
  const { response, db } = await invoke({ sql: "SELECT 1" }, { token: "wrong", db: createDb() });
  assert.equal(response.status, 401);
  assert.equal(db.calls.length, 0);
}

{
  const { response } = await invoke({ sql: "CREATE TABLE bad(id TEXT)" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "invalid_sql");
}

{
  const response = await worker.fetch(new Request("https://gateway.example/healthz"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, service: "geocheck-developer-d1-gateway" });
}

console.log("developer D1 gateway tests passed");
