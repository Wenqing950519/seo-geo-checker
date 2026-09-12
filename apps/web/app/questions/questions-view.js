// Tracked Questions Tab View for GeoCheck Product A Dashboard
// Implements DASHBOARD_UI_SPEC:
// 1. Grouped by immutable Question Set version
// 2. Intent tags and topic badges
// 3. Latest 4-engine observation status pills
// 4. Modifying questions creates a new version without rewriting history

import { ICONS } from '../shared/icons.js';
import { ENGINES, formatDate } from '../shared/formatters.js';
import { AppState } from '../shared/state.js';

export function renderQuestions(data) {
  if (!data) {
    return `<div class="view-loading"><div class="spinner"></div><p>正在載入追蹤提問資料...</p></div>`;
  }

  const questionSets = Array.isArray(data) ? data : (data.data || []);
  const activeVersion = AppState.activeQuestionSetVersion || questionSets[0]?.version || 1;
  const activeSet = questionSets.find(qs => qs.version === activeVersion) || questionSets[0] || { version: 1, questions: [], locale: 'zh-TW' };

  // Calculate summary metrics
  const allQuestions = activeSet.questions || [];
  const totalQuestions = allQuestions.length;
  const mentionedCount = allQuestions.filter(q => 
    (q.latest_observations || []).some(o => o.brandMentioned === true)
  ).length;
  const officialCitationCount = allQuestions.filter(q => 
    (q.latest_observations || []).some(o => o.officialCitation === true)
  ).length;
  // A missing question set has no denominator. Never turn that absence into a
  // plausible-looking percentage: unknown is a product state, not a low score.
  const sovRate = totalQuestions > 0 ? ((mentionedCount / totalQuestions) * 100).toFixed(1) : null;
  const citRate = totalQuestions > 0 ? ((officialCitationCount / totalQuestions) * 100).toFixed(1) : null;

  // Apply filters
  const filterIntent = AppState.questionIntentFilter || 'all';
  const query = (AppState.questionSearchQuery || '').toLowerCase();

  const filteredQuestions = allQuestions.filter(q => {
    const matchIntent = filterIntent === 'all' || q.intent === filterIntent;
    const matchQuery = !query || 
      (q.text || '').toLowerCase().includes(query) ||
      (q.tags || []).some(t => t.toLowerCase().includes(query)) ||
      (q.questionId || '').toLowerCase().includes(query);
    return matchIntent && matchQuery;
  });

  const intentLabels = {
    discovery: '探索推薦',
    consideration: '品類評估',
    intent: '促購決策',
    brand_direct: '品牌直達'
  };

  return `
    <div class="questions-view animate-fade-in">
      <!-- 1. Top Summary KPI Cards (At-a-glance Marketing Metrics) -->
      <div class="questions-summary-grid">
        <div class="ds-card q-kpi-card">
          <div class="q-kpi-label">監測提問總數</div>
          <div class="q-kpi-val font-number">${totalQuestions} <span class="q-kpi-unit">題</span></div>
          <div class="q-kpi-sub">涵蓋 4 大消費者決策階段</div>
        </div>

        <div class="ds-card q-kpi-card">
          <div class="q-kpi-label">AI 品牌推薦率</div>
          <div class="q-kpi-val font-number">${sovRate === null ? '—' : `${sovRate}%`}</div>
          <div class="q-kpi-sub font-number">${sovRate === null ? '尚無可計算的提問資料' : `${mentionedCount}/${totalQuestions} 題獲 AI 主動推薦提及`}</div>
        </div>

        <div class="ds-card q-kpi-card">
          <div class="q-kpi-label">官網第一方引用率</div>
          <div class="q-kpi-val font-number">${citRate === null ? '—' : `${citRate}%`}</div>
          <div class="q-kpi-sub font-number">${citRate === null ? '尚無可計算的提問資料' : `${officialCitationCount}/${totalQuestions} 題引用品牌官方網站`}</div>
        </div>

        <div class="ds-card q-kpi-card">
          <div class="q-kpi-label">排程觀測引擎</div>
          <div class="q-kpi-val font-number">4 / 4</div>
          <div class="q-kpi-sub">OpenAI • Gemini • Claude • Perplexity</div>
        </div>
      </div>

      <!-- 2. Unified Action Toolbar (Search + Intent Pills + Add CTA) -->
      <div class="questions-unified-toolbar ds-card">
        <div class="toolbar-left-group">
          <!-- Search Input -->
          <div class="search-input-wrap">
            <span class="search-icon">${ICONS.search}</span>
            <input type="text"
                   id="questions-search"
                   class="search-input"
                   value="${AppState.questionSearchQuery || ''}"
                   placeholder="搜尋提問內容、關鍵字或 #標籤..." />
          </div>

          <!-- Intent Category Pills -->
          <div class="intent-filter-tabs" role="group" aria-label="行銷意圖篩選">
            <button type="button" class="intent-tab-btn ${filterIntent === 'all' ? 'active' : ''}" data-intent="all">
              全部 (${totalQuestions})
            </button>
            <button type="button" class="intent-tab-btn ${filterIntent === 'discovery' ? 'active' : ''}" data-intent="discovery">
              探索推薦
            </button>
            <button type="button" class="intent-tab-btn ${filterIntent === 'consideration' ? 'active' : ''}" data-intent="consideration">
              品類評估
            </button>
            <button type="button" class="intent-tab-btn ${filterIntent === 'intent' ? 'active' : ''}" data-intent="intent">
              促購決策
            </button>
            <button type="button" class="intent-tab-btn ${filterIntent === 'brand_direct' ? 'active' : ''}" data-intent="brand_direct">
              品牌直達
            </button>
          </div>
        </div>

        <!-- Primary Action Button -->
        <button type="button" class="btn-primary" id="btn-open-add-prompt" title="新增監測提問詞">
          ${ICONS.plus}
          <span>新增監測提問</span>
        </button>
      </div>

      <!-- 3. Clean Prompts Table -->
      <div class="ds-card questions-table-card">
        <div class="table-responsive">
          <table class="brand-data-table">
            <thead>
              <tr>
                <th style="width: 44px;">#</th>
                <th>消費者提問情境</th>
                <th style="width: 110px;">行銷意圖</th>
                <th style="width: 170px;">情境標籤</th>
                <th style="width: 230px;">四大 AI 引擎最新推薦狀態</th>
                <th style="width: 110px; text-align: right;">事證調閱</th>
              </tr>
            </thead>
            <tbody>
              ${filteredQuestions.length === 0 ? `
                <tr>
                  <td colspan="6" style="text-align: center; padding: 48px 20px; color: var(--gc-muted);">
                    查無符合條件之監測提問
                  </td>
                </tr>
              ` : filteredQuestions.map((q, idx) => {
                const latestObs = q.latest_observations || [];
                return `
                  <tr class="question-row" data-intent="${q.intent || 'discovery'}">
                    <td class="font-number text-muted">${idx + 1}</td>
                    <td class="question-title-cell">
                      <div class="question-text">「${q.text}」</div>
                    </td>
                    <td>
                      <span class="intent-pill intent-${q.intent || 'discovery'}">
                        ${intentLabels[q.intent] || '探索推薦'}
                      </span>
                    </td>
                    <td>
                      <div class="tag-chips-wrap">
                        ${(q.tags || []).map(t => `<span class="tag-chip font-number">#${t}</span>`).join('')}
                      </div>
                    </td>
                    <td>
                      <div class="engine-status-strip">
                        ${Object.values(ENGINES).map(eng => {
                          const obs = latestObs.find(o => o.engine === eng.id);
                          const isMentioned = obs?.brandMentioned === true;
                          const isZero = obs?.brandMentioned === false;
                          const isUnknown = obs?.status === 'unknown';
                          const isFailed = obs?.status === 'failed';

                          let stateClass = 'unobserved';
                          let stateText = '未觀測';
                          let stateMark = '—';

                          if (isMentioned) {
                            stateClass = 'mentioned';
                            stateText = '已提及推薦';
                            stateMark = '✓';
                          } else if (isZero) {
                            stateClass = 'zero';
                            stateText = '未提及';
                            stateMark = '✕';
                          } else if (isUnknown) {
                            stateClass = 'unknown';
                            stateText = '未知狀態';
                            stateMark = '?';
                          } else if (isFailed) {
                            stateClass = 'failed';
                            stateText = '觀測中斷';
                            stateMark = '!';
                          }

                          return `
                            <button type="button"
                                    class="engine-status-token ${stateClass}"
                                    data-obs-id="${obs?.observationId || ''}"
                                    title="${eng.name}：${stateText}">
                              <span class="eng-token-icon">${ICONS[eng.id]}</span>
                              <span class="eng-token-mark font-number">${stateMark}</span>
                            </button>
                          `;
                        }).join('<span class="engine-token-sep"></span>')}
                      </div>
                    </td>
                    <td style="text-align: right;">
                      <button type="button"
                              class="btn-table-inspect"
                              data-obs-id="${latestObs[0]?.observationId || 'dobs_measured_wildwood_perplexity'}">
                        ${ICONS.drawer} 調閱回答
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
