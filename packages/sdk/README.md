# @geocheck/sdk

`@geocheck/sdk@0.1.0-beta.1` is the typed TypeScript client for the private GeoCheck Developer API beta. It contains HTTP calls, response types, explicit idempotency, and a two-second polling helper only. It never contains provider keys, crawler code, scoring logic, or automatic POST retries.

```ts
import { GeoCheckClient } from "@geocheck/sdk";

const client = new GeoCheckClient({ apiKey: process.env.GEOCHECK_API_KEY! });
const accepted = await client.createMeasurement(
  { input: { type: "url", url: "https://example.com" }, locale: "zh-TW" },
  crypto.randomUUID()
);
const result = await client.pollMeasurement(accepted.measurement_id);
```

The SDK respects server `Retry-After` during polling. `createMeasurement()` sends exactly one POST; callers decide whether and when to replay an idempotency key.
