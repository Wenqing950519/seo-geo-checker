const SEARCH_PROVIDER_CONTRACT_VERSION = "0.1.0";

/**
 * Architectural boundary for an official provider search adapter.
 *
 * execute(request, context) will eventually receive a versioned engine profile,
 * prompt, locale, deadline, and attempt identity. It must return the provider's
 * native evidence alongside any normalized fields. This file intentionally does
 * not perform network I/O or normalize provider-specific citation semantics.
 */
function defineSearchProvider(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new TypeError("Search provider adapter must be an object");
  }
  if (!String(adapter.id || "").trim()) {
    throw new TypeError("Search provider adapter requires an id");
  }
  if (typeof adapter.execute !== "function") {
    throw new TypeError("Search provider adapter requires an execute function");
  }
  return Object.freeze({ ...adapter, id: String(adapter.id).trim() });
}

module.exports = {
  SEARCH_PROVIDER_CONTRACT_VERSION,
  defineSearchProvider
};
