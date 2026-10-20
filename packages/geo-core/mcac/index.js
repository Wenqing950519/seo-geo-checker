// MCAC (Mention, Citation, Accuracy, Conversion-readiness) for the public GeoCheck
// quick check. Pure functions only: network calls live in services/api.
const probes = require("./probes.js");
const facts = require("./facts.js");
const actions = require("./actions.js");
const evaluate = require("./evaluate.js");

module.exports = {
  ...probes,
  ...facts,
  ...actions,
  ...evaluate
};
