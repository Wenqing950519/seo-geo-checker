// Universal Evidence Drawer for GeoCheck Product A Dashboard
// Strictly fulfills DASHBOARD_UI_SPEC:
// Reached from Overview, Performance dots, Question rows, and Citation sources.
// Shows question, engine, model, actual observation time, raw answer, brand mention, official citation, citations.
// Completely free of Developer API keys, quota, tenant, or cost.

import { ICONS } from '../shared/icons.js';
import { ENGINES, formatDateTime } from '../shared/formatters.js';
import { AppState } from '../shared/state.js';

export function renderEvidenceDrawer() {
  const { isOpen, data, loading, error } = AppState.drawer;

  if (!isOpen) {
    return `<div id="evidence-drawer-root" class="evidence-drawer-wrap closed" aria-hidden="true"></div>`;
  }

  return `
    <div id="evidence-drawer-root" class="evidence-drawer-wrap open" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <div class="drawer-backdrop" id="drawer-backdrop"></div>
      
      <aside class="evidence-drawer-panel">
        <!-- Header -->
        <div class="drawer-header">
          <div class="drawer-header-left">
            <span class="drawer-pretitle">觀測原始事證抽屜 (Observation Evidence)</span>
            <h2 class="drawer-title" id="drawer-title">
              ${data?.question?.text || data?.questionText || '觀測紀錄詳情'}
            </h2>
          </div>
          <button type="button" class="btn-drawer-close" id="btn-close-drawer" aria-label="關閉事證抽屜">
            ${ICONS.x}
          </button>
        </div>

        <!-- Body -->
        <div class="drawer-body">
          ${loading ? `
            <div class="drawer-loading">
              <div class="spinner"></div>
              <p>正在載入第一手觀測事證與 AI 原始回答...</p>
            </div>
          ` : error ? `
            <div class="drawer-error">
              <div class="error-icon">${ICONS.alert}</div>
              <h3>事證載入失敗</h3>
              <p>${error}</p>
            </div>
          ` : data ? renderDrawerContent(data) : `
            <div class="drawer-empty">尚無可顯示之事證</div>
          `}
        </div>
      </aside>
    </div>
  `;
}

function renderDrawerContent(obs) {
  const engineId = obs.engine;
  const eng = ENGINES[engineId] || { name: engineId, color: '#0B3B6F', model: obs.model || '--' };
  const questionText = obs.question?.text || obs.questionText || '--';
  const intent = obs.question?.intent || obs.intent || 'general';
  const status = obs.status || 'measured';
  const brandMentioned = obs.brand_mentioned !== undefined ? obs.brand_mentioned : obs.brandMentioned;
  const officialCitation = obs.official_citation !== undefined ? obs.official_citation : obs.officialCitation;
  const rawAnswer = obs.raw_answer || obs.rawAnswer || '';
  const citations = obs.citations || [];
  const failureReason = obs.failure_reason || obs.failureReason;
  const obsTime = obs.observed_at || obs.observedAt;

  return `
    <!-- Top Metadata Card -->
    <div class="drawer-section meta-grid">
      <!-- Engine & Model -->
      <div class="meta-field">
        <span class="meta-label">AI 搜尋引擎</span>
        <div class="meta-engine-val">
          <span class="engine-icon" style="color: ${eng.color}">${ICONS[engineId] || ''}</span>
          <span class="engine-name">${eng.name}</span>
          <span class="model-tag">${obs.model || eng.model}</span>
        </div>
      </div>

      <!-- Observation Time -->
      <div class="meta-field">
        <span class="meta-label">實際觀測時間 (Observed At)</span>
        <div class="meta-time-val font-mono">${formatDateTime(obsTime)}</div>
      </div>

      <!-- Brand Mention Verdict -->
      <div class="meta-field">
        <span class="meta-label">品牌提及判定</span>
        <div class="verdict-pill ${brandMentioned === true ? 'mentioned' : (brandMentioned === false ? 'unmentioned' : 'neutral')}">
          ${brandMentioned === true ? `${ICONS.check} 答案內明確推薦提及` : (brandMentioned === false ? `${ICONS.x} 有回答但未提及品牌 (有效真 0)` : `${ICONS.alert} 無法判定 (Unknown / Failed)`)}
        </div>
      </div>

      <!-- Official Citation Verdict -->
      <div class="meta-field">
        <span class="meta-label">官網來源引用判定</span>
        <div class="verdict-pill ${officialCitation === true ? 'cited' : 'uncited'}">
          ${officialCitation === true ? `${ICONS.verified} 包含第一方官方網域引用` : `${ICONS.info} 無第一方官方來源直接引用`}
        </div>
      </div>
    </div>

    <!-- Question Intent Box -->
    <div class="drawer-section">
      <div class="section-badge-bar">
        <span class="section-title-sm">追蹤提問與意圖</span>
        <span class="intent-pill intent-${intent}">${intent.toUpperCase()}</span>
      </div>
      <div class="question-quote-box">
        <span class="quote-mark">“</span>
        <p class="question-quote-text">${questionText}</p>
      </div>
    </div>

    <!-- Raw Answer Section -->
    <div class="drawer-section">
      <div class="section-badge-bar">
        <span class="section-title-sm">大模型實際產出回答 (Raw Answer)</span>
        ${rawAnswer ? `
          <button type="button" class="btn-copy-sm" id="btn-copy-raw-answer" data-text="${encodeURIComponent(rawAnswer)}" title="複製原始回答">
            ${ICONS.copy} 複製純文字
          </button>
        ` : ''}
      </div>

      ${status === 'measured' ? `
        <div class="raw-answer-box">
          <pre class="raw-answer-text">${escapeHtml(rawAnswer)}</pre>
        </div>
      ` : status === 'unknown' ? `
        <div class="raw-answer-warning unknown">
          <div class="warning-icon">${ICONS.alert}</div>
          <div>
            <strong>該次觀測回傳未知狀態 (Unknown)</strong>
            <p>${failureReason || '供應商搜尋逾時或未產出文字，系統依據準則保留 Unknown 標籤，不納入率值分母，亦不假造補 0。'}</p>
          </div>
        </div>
      ` : `
        <div class="raw-answer-warning failed">
          <div class="warning-icon">${ICONS.alert}</div>
          <div>
            <strong>該次觀測中斷失敗 (Failed)</strong>
            <p>${failureReason || '上游連線失敗或配額異常，已記錄中斷日誌，未生成任何推論數據。'}</p>
          </div>
        </div>
      `}
    </div>

    <!-- Citations List -->
    <div class="drawer-section">
      <div class="section-badge-bar">
        <span class="section-title-sm">模型回答引用來源 (${citations.length})</span>
      </div>

      ${citations.length > 0 ? `
        <div class="citations-list">
          ${citations.map(c => `
            <div class="citation-card ${c.isOfficial ? 'official' : ''}">
              <div class="citation-header">
                <span class="citation-domain font-mono">${c.domain || extractDomain(c.url)}</span>
                ${c.isOfficial ? `<span class="badge-official">${ICONS.verified} 官方第一方來源</span>` : `<span class="badge-third-party">第三方來源</span>`}
              </div>
              <div class="citation-title">${c.title || c.url}</div>
              <a href="${c.url}" target="_blank" rel="noopener noreferrer" class="citation-url font-mono">
                <span>${c.url}</span>
                ${ICONS.externalLink}
              </a>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="citations-none">此回答中大模型未列出任何外部網址引用來源</div>
      `}
    </div>

    <!-- Observation ID Footer -->
    <div class="drawer-footer-meta">
      <span class="obs-id font-mono">Observation ID: ${obs.observation_id || obs.observationId || 'dobs_unknown'}</span>
      <span class="privacy-note">依安全規格：本畫面僅呈現專案觀測事證與第一手引用。</span>
    </div>
  `;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
