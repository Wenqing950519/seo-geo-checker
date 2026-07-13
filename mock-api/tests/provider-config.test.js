const assert = require("node:assert/strict");
const { callAgnesJson } = require("../providers/agnes");

(async () => {
  const original = process.env.AGNES_API_KEY;
  delete process.env.AGNES_API_KEY;
  delete process.env.Agnes_API_KEY;
  delete process.env.AENES_API_KEY;
  delete process.env.Aenes_API_KEY;
  try {
    await assert.rejects(
      () => callAgnesJson("test"),
      (error) => error?.stage === "config" && /AGNES_API_KEY/.test(error.message)
    );
  } finally {
    if (original) process.env.AGNES_API_KEY = original;
  }
  console.log("provider config tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
