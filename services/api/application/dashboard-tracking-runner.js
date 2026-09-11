// Product A tracking runner (D-047 phase 2).
//
// This is the loop that makes the Dashboard show real numbers. Each tick:
//
//   1. claim tracking plans whose next run is due, and fan each one out into a
//      dispatch per tracked question
//   2. submit pending dispatches to the Developer API internal channel
//   3. collect results for dispatches already in flight
//   4. assemble a Tracking Run once every dispatch for a job is terminal
//
// It is deliberately a poll loop rather than a callback from B into A. A reverse
// channel would be a second authenticated surface to secure and to keep
// available; polling costs one extra read per tick and cannot be spoofed.
//
// Everything here is admission-gated. With the switch closed the tick does
// nothing at all — it must never be possible to spend money by accident.

const { randomUUID } = require("node:crypto");

// The Developer API reports engines by provider; the Dashboard names one of them
// differently. Anything unmapped is dropped rather than guessed at.
const PROVIDER_TO_ENGINE = Object.freeze({
  openai: "openai",
  google: "gemini",
  anthropic: "anthropic",
  perplexity: "perplexity"
});

const DEFAULTS = Object.freeze({
  maxPlansPerTick: 5,
  maxSubmissionsPerTick: 10,
  maxCollectionsPerTick: 20,
  maxAssembliesPerTick: 5,
  maxSubmitAttempts: 3
});

function createDashboardTrackingRunner(options = {}) {
  const store = requiredStore(options.store);
  const client = requiredClient(options.client);
  const now = options.now || (() => new Date());
  const limits = { ...DEFAULTS, ...(options.limits || {}) };
  const onRunRecorded = options.onRunRecorded || (async () => {});

  async function tick({ admissionEnabled } = {}) {
    // The gate is checked here, once, rather than in each step: a half-open tick
    // that submits but never collects would strand paid work.
    if (admissionEnabled !== true) {
      return { skipped: "admission_closed", started: 0, submitted: 0, collected: 0, assembled: 0 };
    }
    const started = await startDueRuns();
    const submitted = await submitPending();
    const collected = await collectInFlight();
    const assembled = await assembleComplete();
    return { skipped: null, started, submitted, collected, assembled };
  }

  // ---- 1. due plans become jobs with one dispatch per question ----

  async function startDueRuns() {
    const timestamp = iso(now());
    const claimed = await store.claimDueTrackingPlans({
      now: timestamp, nextRunAt: nextWeeklyRun(timestamp), limit: limits.maxPlansPerTick
    });
    let started = 0;
    for (const plan of claimed) {
      const questionSet = await store.getQuestionSet(plan.questionSetId);
      // A Project with no questions has nothing to measure. Its next run has
      // already moved forward, so it simply waits for questions to be added.
      if (!questionSet?.questions?.length) continue;
      const jobId = `dtj_${randomUUID()}`;
      await store.createDispatchedTrackingJob({
        jobId, accountId: plan.accountId, projectId: plan.projectId,
        questionSetId: questionSet.questionSetId, kind: "scheduled",
        dedupeKey: `scheduled:${plan.projectId}:${timestamp}`,
        scheduledAt: timestamp, now: timestamp,
        dispatches: questionSet.questions.map((question) => ({
          dispatchId: `dtd_${randomUUID()}`,
          questionId: question.questionId,
          // Stable per job and question, so a resubmission is recognised by the
          // channel as the same call rather than charged again.
          idempotencyKey: `${jobId}:${question.questionId}`
        }))
      });
      started += 1;
    }
    return started;
  }

  // ---- 2. pending dispatches are submitted to the internal channel ----

  async function submitPending() {
    const pending = await store.listDispatches({ status: "pending", limit: limits.maxSubmissionsPerTick });
    let submitted = 0;
    for (const dispatch of pending) {
      if (dispatch.attempts >= limits.maxSubmitAttempts) {
        // Give up without claiming: claiming would count a fourth attempt that
        // never happened, and the attempt count is the evidence of what we tried.
        await store.settleDispatch({
          dispatchId: dispatch.dispatchId, status: "failed",
          observations: null, errorCode: "submit_attempts_exhausted", now: iso(now())
        });
        continue;
      }
      if (!await store.claimDispatchForSubmission({ dispatchId: dispatch.dispatchId, now: iso(now()) })) continue;
      try {
        const accepted = await client.submitMeasurement({
          idempotencyKey: dispatch.idempotencyKey,
          prompt: dispatch.questionText,
          locale: dispatch.locale,
          target: { name: dispatch.projectName, url: dispatch.projectSiteUrl }
        });
        const measurementId = accepted?.job?.measurement_id;
        if (!measurementId) throw new Error("internal channel returned no measurement id");
        await store.attachDispatchMeasurement({
          dispatchId: dispatch.dispatchId, measurementId, now: iso(now())
        });
        submitted += 1;
      } catch (error) {
        // Put it back so the next tick retries. The attempt counter is what
        // eventually stops a question that cannot be submitted at all.
        await store.releaseDispatch({ dispatchId: dispatch.dispatchId, now: iso(now()) });
        console.error(JSON.stringify({
          event: "dashboard_dispatch_submit_failed", code: error?.code || "submit_failed"
        }));
      }
    }
    return submitted;
  }

  // ---- 3. in-flight dispatches are collected once terminal ----

  async function collectInFlight() {
    const inFlight = await store.listDispatches({ status: "submitted", limit: limits.maxCollectionsPerTick });
    let collected = 0;
    for (const dispatch of inFlight) {
      if (!dispatch.measurementId) continue;
      let measurement;
      try {
        measurement = await client.getMeasurement(dispatch.measurementId);
      } catch (error) {
        console.error(JSON.stringify({
          event: "dashboard_dispatch_collect_failed", code: error?.code || "collect_failed"
        }));
        continue;
      }
      if (!measurement || !isTerminal(measurement.status)) continue;
      const settled = await store.settleDispatch({
        dispatchId: dispatch.dispatchId,
        status: measurement.status === "succeeded" ? "succeeded" : "failed",
        observations: toObservations(measurement, dispatch),
        errorCode: measurement.status === "succeeded" ? null : "measurement_failed",
        now: iso(now())
      });
      if (settled) collected += 1;
    }
    return collected;
  }

  // ---- 4. a job whose dispatches are all terminal becomes one Tracking Run ----

  async function assembleComplete() {
    const jobs = await store.listAssemblableJobs({ limit: limits.maxAssembliesPerTick });
    let assembled = 0;
    for (const job of jobs) {
      const dispatches = await store.listDispatchesForJob(job.jobId);
      if (!dispatches.length) continue;
      const observations = dispatches.flatMap((dispatch) => dispatch.observations || []);
      // Every question that failed outright still owes four observations, or the
      // Run's denominator would silently shrink and inflate every rate.
      const complete = dispatches.flatMap((dispatch) => (
        dispatch.observations?.length ? [] : failedObservations(dispatch)
      ));
      const timestamp = iso(now());
      const run = await onRunRecorded({
        jobId: job.jobId,
        projectId: job.projectId,
        questionSetId: job.questionSetId,
        scheduledAt: job.scheduledAt || timestamp,
        observedAt: timestamp,
        observations: [...observations, ...complete]
      });
      if (!run?.runId) continue;
      // Attaching the Run is what makes assembly single-shot.
      if (!await store.attachRunToJob({ jobId: job.jobId, runId: run.runId, now: timestamp })) continue;
      await store.settleTrackingJob({
        jobId: job.jobId,
        state: run.state === "complete" ? "complete" : run.state === "partial" ? "partial" : "failed",
        now: timestamp
      });
      assembled += 1;
    }
    return assembled;
  }

  return { tick, startDueRuns, submitPending, collectInFlight, assembleComplete };
}

// A measurement carries one observation per engine. `analysis.target_observation`
// is the Developer API's own reading of mention and first-party citation, so the
// Dashboard consumes it rather than re-deriving a second, divergent answer.
function toObservations(measurement, dispatch) {
  const engines = Array.isArray(measurement.engines) ? measurement.engines : [];
  const byProfile = new Map(
    (measurement.analysis?.target_observation || []).map((entry) => [entry.profile_id, entry])
  );
  const observations = engines.flatMap((engine) => {
    const engineId = PROVIDER_TO_ENGINE[engine.provider];
    if (!engineId) return [];
    if (engine.status !== "succeeded") {
      return [{
        questionId: dispatch.questionId, engine: engineId, model: engine.model || null,
        status: "failed", brandMentioned: null, officialCitation: null,
        rawAnswer: null, citations: [], failureCode: engine.error?.code || "provider_error"
      }];
    }
    const target = byProfile.get(engine.profile_id);
    return [{
      questionId: dispatch.questionId, engine: engineId, model: engine.model || null,
      // No target reading means the engine answered but the brand could not be
      // resolved. That is unknown evidence, not a zero.
      status: target ? "measured" : "unknown",
      brandMentioned: target ? Boolean(target.mentioned) : null,
      officialCitation: target ? Boolean(target.first_party_citation) : null,
      rawAnswer: engine.answer || null,
      citations: (engine.citations || []).map((citation) => ({
        url: citation.url,
        title: citation.title || null,
        isOfficial: Boolean(target?.first_party_citation) && isSameHost(citation.url, dispatch.projectSiteUrl)
      }))
    }];
  });
  return observations.length ? observations : failedObservations(dispatch);
}

function failedObservations(dispatch) {
  return Object.values(PROVIDER_TO_ENGINE).map((engine) => ({
    questionId: dispatch.questionId, engine, model: null, status: "failed",
    brandMentioned: null, officialCitation: null, rawAnswer: null,
    citations: [], failureCode: dispatch.errorCode || "measurement_failed"
  }));
}

function isSameHost(url, siteUrl) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === new URL(siteUrl).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function isTerminal(status) {
  return status === "succeeded" || status === "failed";
}

function nextWeeklyRun(from) {
  return new Date(new Date(from).getTime() + 7 * 86_400_000).toISOString();
}

function iso(value) {
  return new Date(value).toISOString();
}

function requiredStore(value) {
  if (!value || typeof value.claimDueTrackingPlans !== "function") {
    throw new TypeError("A Dashboard store with tracking dispatch support is required");
  }
  return value;
}

function requiredClient(value) {
  if (!value || typeof value.submitMeasurement !== "function" || typeof value.getMeasurement !== "function") {
    throw new TypeError("An internal measurement client is required");
  }
  return value;
}

module.exports = { createDashboardTrackingRunner, PROVIDER_TO_ENGINE };
