const assert = require("node:assert/strict");
const { createNewebpayPeriodicSandbox, SANDBOX_URL } = require("../services/api/payments/newebpay-periodic.js");

const adapter = createNewebpayPeriodicSandbox({ merchantId: "MS123456789", hashKey: "k".repeat(32), hashIv: "i".repeat(16) });
const checkout = adapter.createCheckout({ periodNo: "period_1", returnUrl: "https://dashboard.example/return", notifyUrl: "https://dashboard.example/notify" });
assert.equal(checkout.action, SANDBOX_URL);
assert.equal(checkout.fields.MerchantID_, "MS123456789");
assert.match(checkout.fields.PostData_, /^[a-f0-9]+$/);
assert.throws(() => adapter.createCheckout({ periodNo: "bad!", returnUrl: "https://dashboard.example/return", notifyUrl: "https://dashboard.example/notify" }), /orderNo|periodNo/);
console.log("newebpay periodic sandbox adapter tests passed");
