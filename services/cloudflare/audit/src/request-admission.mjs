// A separate request ceiling applies before URL probes and lead writes (including cache
// hits). Paid-job ceilings still apply independently. One D1 statement is authoritative
// across Workers isolates; old request rows are bounded and contain only a keyed client id.
export async function admitRequest(db, client, now = Date.now()) {
  const since = now - 5 * 60_000;
  await db.prepare("DELETE FROM audit_request_admissions WHERE created_at < ?").bind(since).run();
  const result = await db.prepare(`INSERT INTO audit_request_admissions (request_id, client_key, created_at)
    SELECT ?, ?, ? WHERE
    (SELECT COUNT(*) FROM audit_request_admissions WHERE created_at >= ?) < 300
    AND (SELECT COUNT(*) FROM audit_request_admissions WHERE client_key = ? AND created_at >= ?) < 20`)
    .bind(crypto.randomUUID(), client, now, since, client, since).run();
  return Number(result.meta?.changes || 0) === 1;
}
