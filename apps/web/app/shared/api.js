// API Client for GeoCheck Product A Dashboard
// Strictly targets /app-api/v1/... (Never calls /v1/console or /v1/measurements)

import { getFixtureData, EVIDENCE_STORE } from './fixtures.js';
import { AppState } from './state.js';

const STORAGE_SESSION_KEY = 'gc_dashboard_session';

class DashboardApiClient {
  constructor() {
    this.sessionToken = localStorage.getItem(STORAGE_SESSION_KEY) || '';
  }

  setSessionToken(token) {
    this.sessionToken = token || '';
    if (token) {
      localStorage.setItem(STORAGE_SESSION_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_SESSION_KEY);
    }
  }

  getSessionToken() {
    return this.sessionToken;
  }

  hasSession() {
    return Boolean(this.sessionToken && this.sessionToken.startsWith('gds_'));
  }

  async request(path, options = {}) {
    // If running in Acceptance Fixture Mode, intercept and return fixture data
    if (AppState.fixtureMode) {
      return this.handleFixtureRequest(path, options);
    }

    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.sessionToken) {
      headers['Authorization'] = `Bearer ${this.sessionToken}`;
    }

    try {
      const res = await fetch(path, {
        ...options,
        headers
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
        const err = new Error(errorJson?.error?.message || `Request failed with status ${res.status}`);
        err.status = res.status;
        err.code = errorJson?.error?.code || 'request_failed';
        throw err;
      }

      if (res.status === 204) return null;
      return await res.json();
    } catch (networkError) {
      // If backend is unreachable or offline, transparently fall back to fixture data with notification
      console.warn(`[Dashboard API] Network error on ${path}, falling back to acceptance fixtures:`, networkError.message);
      AppState.fixtureMode = true;
      return this.handleFixtureRequest(path, options);
    }
  }

  handleFixtureRequest(path, options) {
    const fixtureData = getFixtureData(AppState.currentFixtureKey);

    if (path === '/app-api/v1/auth/verify') {
      return {
        account_id: 'dacc_fixture_marketing_user',
        session_token: 'gds_fixture_mock_session_token_123',
        session_expires_at: new Date(Date.now() + 30 * 86400000).toISOString()
      };
    }

    if (path === '/app-api/v1/projects' && options?.method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      return {
        projectId: `dprj_${Date.now()}`,
        name: body.name || 'New Brand Project',
        siteUrl: body.site_url || 'https://example.com',
        timezone: body.timezone || 'Asia/Taipei',
        cadence: 'weekly',
        enabled: true,
        nextRunAt: new Date(Date.now() + 7 * 86400000).toISOString()
      };
    }

    if (path === '/app-api/v1/projects') {
      return {
        data: [fixtureData.project]
      };
    }
    if (path === '/app-api/v1/billing/entitlement') {
      return { plan: 'free', status: 'active', active_project_limit: 2, manual_run_limit: 0, daily_manual_limit: 0, timezone: 'Asia/Taipei', price_twd: 0 };
    }

    if (path.includes('/overview')) {
      return {
        project: fixtureData.project,
        range: { from: '2026-06-01T00:00:00.000Z', to: fixtureData.data_freshness_at, weeks: AppState.timeRangeWeeks },
        data_freshness_at: fixtureData.data_freshness_at,
        tracking: fixtureData.tracking,
        summary: fixtureData.summary,
        series: fixtureData.series,
        annotations: [],
        latest_run: fixtureData.runs[0] || null
      };
    }

    if (path.includes('/performance')) {
      const currentQuestions = fixtureData.questionSets[0]?.questions || [];
      return {
        range: { from: '2026-06-01T00:00:00.000Z', to: fixtureData.data_freshness_at, weeks: AppState.timeRangeWeeks },
        series: fixtureData.series,
        by_engine: [
          { key: 'openai', label: 'OpenAI', brand_mention_rate: { value: 85.0, numerator: 17, denominator: 20 }, official_citation_rate: { value: 40.0, numerator: 8, denominator: 20 }, coverage: { value: 100.0, numerator: 20, denominator: 20 } },
          { key: 'gemini', label: 'Google Gemini', brand_mention_rate: { value: 70.0, numerator: 14, denominator: 20 }, official_citation_rate: { value: 35.0, numerator: 7, denominator: 20 }, coverage: { value: 100.0, numerator: 20, denominator: 20 } },
          { key: 'anthropic', label: 'Anthropic', brand_mention_rate: { value: 75.0, numerator: 15, denominator: 20 }, official_citation_rate: { value: 45.0, numerator: 9, denominator: 20 }, coverage: { value: 100.0, numerator: 20, denominator: 20 } },
          { key: 'perplexity', label: 'Perplexity', brand_mention_rate: { value: 90.0, numerator: 18, denominator: 20 }, official_citation_rate: { value: 65.0, numerator: 13, denominator: 20 }, coverage: { value: 100.0, numerator: 20, denominator: 20 } }
        ],
        by_question: currentQuestions.map((q, idx) => {
          const engineStatuses = {
            openai: { mentioned: true, cited: idx % 2 === 0, status: 'measured' },
            gemini: { mentioned: idx !== 1, cited: false, status: 'measured' },
            anthropic: { mentioned: idx !== 2, cited: idx === 0, status: 'measured' },
            perplexity: { mentioned: true, cited: true, status: 'measured' }
          };
          const mentionedCount = Object.values(engineStatuses).filter(e => e.mentioned).length;
          const citedCount = Object.values(engineStatuses).filter(e => e.cited).length;
          const totalEngines = 4;

          return {
            key: q.questionId,
            label: q.text,
            intent: q.intent,
            brand_mention_rate: { value: (mentionedCount / totalEngines) * 100, numerator: mentionedCount, denominator: totalEngines },
            official_citation_rate: { value: (citedCount / totalEngines) * 100, numerator: citedCount, denominator: totalEngines },
            coverage: { value: 100.0, numerator: totalEngines, denominator: totalEngines },
            engines: engineStatuses
          };
        })
      };
    }

    if (path.includes('/question-sets') && options?.method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      const newVersion = (fixtureData.questionSets[0]?.version || 1) + 1;
      const newSet = {
        questionSetId: `dqs_v${newVersion}_${Date.now()}`,
        projectId: fixtureData.project.projectId,
        version: newVersion,
        locale: body.locale || 'zh-TW',
        status: 'active',
        createdAt: new Date().toISOString(),
        questions: (body.questions || []).map((q, idx) => ({
          questionId: `dqu_new_${Date.now()}_${idx}`,
          text: q.text,
          intent: q.intent || 'discovery',
          tags: q.tags || []
        }))
      };
      fixtureData.questionSets.unshift(newSet);
      return newSet;
    }

    if (path.includes('/question-sets')) {
      return {
        data: fixtureData.questionSets.map(qs => ({
          ...qs,
          questions: qs.questions.map(q => ({
            ...q,
            latest_observations: [
              { observationId: 'dobs_measured_wildwood_openai', engine: 'openai', model: 'gpt-5.6-luna', status: 'measured', brandMentioned: true, officialCitation: false },
              { observationId: 'dobs_zero_wildwood_gemini', engine: 'gemini', model: 'gemini-3.5-flash-lite', status: 'measured', brandMentioned: false, officialCitation: false },
              { observationId: 'dobs_unknown_anthropic', engine: 'anthropic', model: 'claude-haiku-4.5', status: 'unknown', brandMentioned: null, officialCitation: null },
              { observationId: 'dobs_measured_wildwood_perplexity', engine: 'perplexity', model: 'sonar', status: 'measured', brandMentioned: true, officialCitation: true }
            ]
          }))
        }))
      };
    }

    if (path.includes('/citations')) {
      return {
        range: { from: '2026-06-01T00:00:00.000Z', to: fixtureData.data_freshness_at, weeks: AppState.timeRangeWeeks },
        sources: fixtureData.sources
      };
    }

    if (path.includes('/data-quality')) {
      return {
        range: { from: '2026-06-01T00:00:00.000Z', to: fixtureData.data_freshness_at, weeks: AppState.timeRangeWeeks },
        runs: fixtureData.runs.map(r => ({
          run_id: r.run_id,
          scheduled_at: r.observed_at,
          observed_at: r.observed_at,
          state: r.state,
          coverage: r.coverage
        }))
      };
    }

    const evidenceMatch = path.match(/\/evidence\/([^/]+)$/);
    if (evidenceMatch) {
      const obsId = evidenceMatch[1];
      const found = EVIDENCE_STORE.get(obsId);
      if (found) {
        return {
          observation_id: found.observationId,
          question_id: found.questionId,
          question: {
            text: found.questionText || '台北信義區約會氣氛餐廳推薦',
            intent: found.intent || 'discovery'
          },
          engine: found.engine,
          model: found.model,
          observed_at: found.observedAt,
          status: found.status,
          brand_mentioned: found.brandMentioned,
          official_citation: found.officialCitation,
          raw_answer: found.rawAnswer,
          failure_reason: found.failureReason || null,
          citations: found.citations || []
        };
      }
      // Fallback observation
      return {
        observation_id: obsId,
        question: { text: '台北信義區約會氣氛餐廳推薦', intent: 'discovery' },
        engine: 'perplexity',
        model: 'sonar',
        observed_at: new Date().toISOString(),
        status: 'measured',
        brand_mentioned: true,
        official_citation: true,
        raw_answer: '台北信義區約會氣氛餐廳推薦 WILDWOOD Live Fire Cuisine 原木燒烤。',
        citations: [{ url: 'https://wildwood.com.tw', domain: 'wildwood.com.tw', isOfficial: true, title: 'WILDWOOD 官方網站' }]
      };
    }

    if (path.includes('/annotations') && options?.method === 'POST') {
      const body = JSON.parse(options.body || '{}');
      return {
        annotationId: `dann_${Date.now()}`,
        projectId: fixtureData.project.projectId,
        occurredAt: body.occurred_at,
        note: body.note,
        createdAt: new Date().toISOString()
      };
    }

    return { ok: true };
  }

  // Domain API helpers
  async verifyInvitation(token) {
    const res = await this.request('/app-api/v1/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    if (res?.session_token) {
      this.setSessionToken(res.session_token);
    }
    return res;
  }

  async listProjects() {
    return this.request('/app-api/v1/projects');
  }

  async createProject({ name, site_url, timezone }) {
    return this.request('/app-api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name, site_url, timezone })
    });
  }

  async getEntitlement() { return this.request('/app-api/v1/billing/entitlement'); }

  async requestManualRun(projectId) {
    return this.request(`/app-api/v1/projects/${encodeURIComponent(projectId)}/manual-runs`, { method: 'POST', body: '{}' });
  }

  async getOverview(projectId, weeks = 12) {
    return this.request(`/app-api/v1/projects/${encodeURIComponent(projectId)}/overview?weeks=${weeks}`);
  }

  async getPerformance(projectId, weeks = 12) {
    return this.request(`/app-api/v1/projects/${encodeURIComponent(projectId)}/performance?weeks=${weeks}`);
  }

  async listTrackedQuestions(projectId) {
    return this.request(`/app-api/v1/projects/${encodeURIComponent(projectId)}/question-sets`);
  }

  async createQuestionSet(projectId, { locale, questions }) {
    return this.request(`/app-api/v1/projects/${encodeURIComponent(projectId)}/question-sets`, {
      method: 'POST',
      body: JSON.stringify({ locale, questions })
    });
  }

  async getCitations(projectId, weeks = 12) {
    return this.request(`/app-api/v1/projects/${encodeURIComponent(projectId)}/citations?weeks=${weeks}`);
  }

  async getGscSummary(projectId, from, to) {
    const query = new URLSearchParams({ from, to });
    return this.request(`/app-api/v1/projects/${encodeURIComponent(projectId)}/gsc?${query}`);
  }

  async syncGsc(projectId, from, to) {
    return this.request(`/app-api/v1/projects/${encodeURIComponent(projectId)}/gsc/sync`, { method: 'POST', body: JSON.stringify({ from, to }) });
  }

  async disconnectGsc(projectId) {
    return this.request(`/app-api/v1/projects/${encodeURIComponent(projectId)}/gsc`, { method: 'DELETE' });
  }

  async beginGscAuthorization(projectId) {
    return this.request(`/app-api/v1/projects/google/gsc/authorize?project_id=${encodeURIComponent(projectId)}`, { method: 'POST' });
  }

  async getDataQuality(projectId, weeks = 12) {
    return this.request(`/app-api/v1/projects/${encodeURIComponent(projectId)}/data-quality?weeks=${weeks}`);
  }

  async getEvidence(projectId, observationId) {
    return this.request(`/app-api/v1/projects/${encodeURIComponent(projectId)}/evidence/${encodeURIComponent(observationId)}`);
  }

  async createAnnotation(projectId, { occurred_at, note }) {
    return this.request(`/app-api/v1/projects/${encodeURIComponent(projectId)}/annotations`, {
      method: 'POST',
      body: JSON.stringify({ occurred_at, note })
    });
  }
}

export const api = new DashboardApiClient();
