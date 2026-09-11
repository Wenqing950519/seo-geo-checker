// Durable store for a pending Search Console property choice.
//
// Connecting Search Console is two steps: Google calls back with a refresh
// token and the properties matching the Project's domain, then the user picks
// one. On Cloudflare those requests land in different isolates, so this state
// cannot be a Map.
//
// The record carries a Google refresh token and the session allowed to spend
// it, so it is stored as one encrypted payload under the same key and algorithm
// that protect a stored connection, and deleted as soon as the choice is made.

const {
  encryptSecret, decryptSecret, normalizedEncryptionKey
} = require("../application/dashboard-service.js");

function createD1GscPendingStore({ db, encryptionKey, now = () => Date.now() } = {}) {
  if (!db || typeof db.prepare !== "function" || typeof db.batch !== "function") {
    throw new TypeError("A Cloudflare D1 binding is required");
  }
  const key = normalizedEncryptionKey(encryptionKey);

  return {
    async set(id, record) {
      const sealed = encryptSecret(JSON.stringify(record), key);
      await db.batch([
        // Expired rows are swept here rather than on a timer: the only moment
        // this table matters is when something new is written to it.
        db.prepare("DELETE FROM dashboard_gsc_pending_connections WHERE expires_at <= ?").bind(now()),
        db.prepare(`INSERT INTO dashboard_gsc_pending_connections (
          pending_id, payload_ciphertext, payload_iv, payload_tag, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(id, sealed.ciphertext, sealed.iv, sealed.tag, Number(record.expiresAt) || now(), now())
      ]);
    },

    async get(id) {
      const row = await db.prepare(`SELECT payload_ciphertext AS ciphertext, payload_iv AS iv,
        payload_tag AS tag FROM dashboard_gsc_pending_connections
        WHERE pending_id = ? AND expires_at > ?`).bind(id, now()).first();
      if (!row) return null;
      // A payload that will not decrypt is treated as absent: the flow must fail
      // closed rather than proceed with a half-read record.
      try { return JSON.parse(decryptSecret(row, key)); } catch { return null; }
    },

    async delete(id) {
      await db.prepare("DELETE FROM dashboard_gsc_pending_connections WHERE pending_id = ?")
        .bind(id).run();
    }
  };
}

module.exports = { createD1GscPendingStore };
