const fs = require("fs");
const path = require("path");

function createFunnelRecorder(options = {}) {
  const file = options.file || path.resolve(__dirname, "..", "funnel-events.jsonl");
  const write = options.write || ((line) => fs.appendFileSync(file, line, "utf8"));

  function record(event, properties = {}) {
    const safe = {
      event,
      timestamp: new Date().toISOString(),
      ...properties
    };
    delete safe.email;
    delete safe.name;
    delete safe.need;
    write(`${JSON.stringify(safe)}\n`);
    return safe;
  }

  return { record };
}

module.exports = { createFunnelRecorder };
