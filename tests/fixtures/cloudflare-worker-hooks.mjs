// Module hooks that let a Node test import a Cloudflare Worker entry: the two runtime-only
// imports are replaced with stubs. `env` from "cloudflare:workers" is the object the test puts
// on globalThis.__WORKER_ENV__ before importing the Worker; getContainer() returns whatever the
// test's binding `get(name)` returns.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if (specifier === "cloudflare:workers" || specifier === "@cloudflare/containers") {
    return { url: `worker-stub:${specifier}`, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url === "worker-stub:cloudflare:workers") {
    return { format: "module", shortCircuit: true, source: "export const env = globalThis.__WORKER_ENV__ ?? (globalThis.__WORKER_ENV__ = {});" };
  }
  if (url === "worker-stub:@cloudflare/containers") {
    return { format: "module", shortCircuit: true, source: "export class Container {}\nexport class ContainerProxy {}\nexport function getContainer(binding, name) { return binding.get(name); }" };
  }
  // The Worker entry is an ES module; the repo's package.json declares no module type.
  if (url.endsWith("/services/cloudflare/audit/src/worker.js")) return { format: "module", shortCircuit: true, source: await readFile(fileURLToPath(url), "utf8") };
  return next(url, context);
}
