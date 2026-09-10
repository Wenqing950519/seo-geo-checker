// Performance Tab View for GeoCheck Product A Dashboard
// Implements DASHBOARD_UI_SPEC & GeoCheck Brand Identity (brand.html)
// 1. Four canonical engines weekly time-series trend line chart
// 2. Clear version change boundary
// 3. Crisp, uncluttered comparative matrix tables

import { ICONS } from '../shared/icons.js';
import { ENGINES, formatRatio } from '../shared/formatters.js';
import { renderTrendLineChart } from '../shared/chart-utils.js';
import { AppState } from '../shared/state.js';

export function renderPerformance(data) {
  if (!data) {
    return `<div class="view-loading"><div class="spinner"></div><p>正在載入模型表現數據...</p></div>`;
  }

  const { series = [], by_engine = [], by_question = [] } = data;

  // Detect if there is a version change boundary in the series
  const versions = [...new Set(series.map(s => s.question_set_version).filter(Boolean))];
  const hasVersionChange = versions.length > 1;

  return `
    <div class="performance-view animate-fade-in">
      <!-- Version Change Boundary Notice -->
      ${hasVersionChange ? `
        <div class="version-boundary-notice">
          <div class="notice-icon">${ICONS.info}</div>
          <div class="notice-text">
            <strong>偵測到題組版本跨期升級 (${versions.map(v => `v${v}`).join(' → ')})：</strong>
            <span>依據度量準則，題組內容變更會導致觀測基準不同，圖表已標記垂直虛線隔離；不可跨版計算增減幅度 (Delta)。</span>
          </div>
        </div>
      ` : ''}

      <!-- Primary 4-Engine Comparison Chart -->
      <div class="ds-card performance-chart-card">
        <div class="chart-card-header">
          <div>
            <h2 class="chart-card-title">四大主流 AI 搜尋引擎品牌提及率走勢</h2>
            <p class="chart-card-sub">每週定時觀測點，滑鼠懸停可查閱各引擎指標，點擊觀測點立即調閱該次事證</p>
          </div>
          
          <!-- Engine Legend & Interactive Toggles -->
          <div class="chart-engine-legend">
            ${Object.values(ENGINES).map(eng => {
              const active = AppState.activeEngines.has(eng.id);
              return `
                <button type="button"
                        class="legend-item ${active ? 'active' : 'dimmed'}"
                        data-engine="${eng.id}"
                        title="點擊切換顯示 ${eng.name}">
                  <span class="legend-indicator" style="background: ${eng.color}"></span>
                  <span class="legend-label">${eng.name}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="chart-svg-container">
          ${renderTrendLineChart(series, {
            width: 1040,
            height: 310,
            mode: 'engines',
            activeEngines: [...AppState.activeEngines]
          })}
        </div>
      </div>

      <!-- Engine Performance Breakdown Table -->
      <div class="ds-card performance-section">
        <div class="sec-title-wrap">
          <div>
            <h3 class="sec-title">搜尋引擎橫向指標對比</h3>
            <p class="section-desc">客觀呈現各大模型對本品牌的提及採用率、第一方官網引用率與觀測穩定度</p>
          </div>
        </div>

        <div class="engine-matrix-grid">
          ${by_engine.map(engRow => {
            const engCfg = ENGINES[engRow.key] || { name: engRow.key, color: '#0B3B6F', model: '--', tag: '搜尋' };
            const mention = formatRatio(engRow.brand_mention_rate);
            const cite = formatRatio(engRow.official_citation_rate);
            const cov = formatRatio(engRow.coverage);

            return `
              <div class="engine-matrix-card" style="border-top: 3px solid ${engCfg.color}">
                <!-- Card Header -->
                <div class="matrix-card-header">
                  <div class="engine-brand-row">
                    <span class="engine-icon" style="color: ${engCfg.color}">${ICONS[engRow.key] || ''}</span>
                    <h4 class="engine-name">${engCfg.name}</h4>
                  </div>
                  <div class="engine-model-row">
                    <span class="engine-model-tag font-mono">模型：${engCfg.model}</span>
                  </div>
                </div>

                <!-- 3 Symmetrical Metrics Columns -->
                <div class="matrix-metrics-row">
                  <div class="matrix-metric">
                    <span class="metric-label">品牌提及</span>
                    <span class="metric-val font-number">${mention.percent}</span>
                    <span class="metric-sub font-number">${mention.fraction || '--'}</span>
                  </div>
                  <div class="matrix-metric">
                    <span class="metric-label">官網引用</span>
                    <span class="metric-val font-number">${cite.percent}</span>
                    <span class="metric-sub font-number">${cite.fraction || '--'}</span>
                  </div>
                  <div class="matrix-metric">
                    <span class="metric-label">觀測覆蓋</span>
                    <span class="metric-val font-number">${cov.percent}</span>
                    <span class="metric-sub font-number">${cov.fraction || '--'}</span>
                  </div>
                </div>

                <!-- Card Footer Action -->
                <div class="matrix-card-footer">
                  <button type="button" class="btn-inspect-engine" data-engine="${engRow.key}">
                    ${ICONS.drawer}
                    <span>調閱觀測事證</span>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Question Breakdown Matrix Table -->
      <div class="ds-card performance-section">
        <div class="sec-title-wrap">
          <div>
            <h3 class="sec-title">各題組意圖引擎表現明細</h3>
            <p class="section-desc">分析各商業意圖提問在四大 AI 搜尋引擎中的推薦提及與引用情況</p>
          </div>
        </div>

        <div class="table-responsive">
          <table class="brand-data-table">
            <thead>
              <tr>
                <th style="min-width: 260px;">追蹤提問內容</th>
                <th>行銷意圖</th>
                <th>綜合提及率</th>
                <th style="min-width: 320px;">四大 AI 模型推薦狀態</th>
                <th style="text-align: right;">第一手事證</th>
              </tr>
            </thead>
            <tbody>
              ${by_question.map(q => {
                const mention = formatRatio(q.brand_mention_rate);

                return `
                  <tr>
                    <td class="question-text-cell">
                      <strong class="text-navy">${q.label}</strong>
                    </td>
                    <td>
                      <span class="intent-pill intent-${q.intent || 'discovery'}">
                        ${(q.intent || 'discovery').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span class="font-mono font-bold ${mention.val > 0.5 ? 'text-mint' : 'text-navy'}">
                        ${mention.percent}
                      </span>
                      <span class="font-mono text-muted" style="font-size: 0.74rem; display: block;">
                        ${mention.numerator ? `(${mention.numerator}/${mention.denominator} 引擎)` : ''}
                      </span>
                    </td>
                    <td>
                      <div class="engine-status-pills">
                        ${Object.values(ENGINES).map(eng => {
                          const engStatus = q.engines?.[eng.id] || { mentioned: true, cited: false };
                          const isMentioned = engStatus.mentioned;
                          const isCited = engStatus.cited;
                          const statusClass = (isMentioned && isCited) ? 'mentioned-cited' : (isMentioned ? 'mentioned' : 'unmentioned');
                          const statusLabel = (isMentioned && isCited) ? '✓ 引用' : (isMentioned ? '✓ 提及' : '— 未提及');
                          const tooltip = `${eng.name}：${(isMentioned && isCited) ? '已提及並引用官網' : (isMentioned ? '已提及推薦' : '未提及本品牌')}`;

                          return `
                            <span class="engine-status-pill ${statusClass}" title="${tooltip}">
                              <span class="eng-icon" style="color: ${eng.color}">${ICONS[eng.id]}</span>
                              <span class="eng-name">${eng.name}</span>
                              <span class="eng-mark font-mono">${statusLabel}</span>
                            </span>
                          `;
                        }).join('')}
                      </div>
                    </td>
                    <td style="text-align: right;">
                      <button type="button" class="btn-table-inspect" data-question-id="${q.key}">
                        ${ICONS.drawer} 調閱事證
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
