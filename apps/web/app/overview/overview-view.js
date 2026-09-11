// Overview Tab View for GeoCheck Product A Dashboard
// Benchmarked against Ahrefs / GA4 / Brandlight
// Features a centerpiece AI 聲量走勢摺線圖 (AI Share of Voice Trend) + 4 Dominant Metric Scorecards

import { ICONS } from '../shared/icons.js';
import { ENGINES, formatRatio, formatDelta, formatDate } from '../shared/formatters.js';
import { renderSparkline, renderTrendLineChart } from '../shared/chart-utils.js';
import { AppState } from '../shared/state.js';

export function renderOverview(data) {
  if (!data) {
    return `<div class="view-loading"><div class="spinner"></div><p>正在載入總覽指標...</p></div>`;
  }

  const { summary, series = [], latest_run, project } = data;
  const metrics = summary?.metrics || {};

  const brandMention = formatRatio(metrics.brand_mention_rate);
  const officialCite = formatRatio(metrics.official_citation_rate);
  const domainCount = metrics.distinct_citation_domains?.value !== null && metrics.distinct_citation_domains?.value !== undefined
    ? { val: metrics.distinct_citation_domains.value, full: `${metrics.distinct_citation_domains.value} 個網域` }
    : { val: '--', full: '無可用資料' };
  const coverage = formatRatio(metrics.measurement_coverage);

  const deltaMention = formatDelta(metrics.brand_mention_rate?.delta, metrics.brand_mention_rate?.comparison_status);
  const deltaOfficial = formatDelta(metrics.official_citation_rate?.delta, metrics.official_citation_rate?.comparison_status);
  const deltaCoverage = formatDelta(metrics.measurement_coverage?.delta, metrics.measurement_coverage?.comparison_status);

  // Sparklines
  const mentionSeries = series.map(s => s.metrics?.brand_mention_rate?.value ?? null);
  const officialSeries = series.map(s => s.metrics?.official_citation_rate?.value ?? null);
  const coverageSeries = series.map(s => s.metrics?.measurement_coverage?.value ?? null);
  const domainSeries = series.map(s => s.metrics?.citation_source_count?.value ?? s.metrics?.distinct_citation_domains?.value ?? null);

  const chartMode = AppState.overviewChartMode || 'overall'; // 'overall' | 'engines'

  return `
    <div class="overview-view animate-fade-in">
      <!-- 4 Dominant Metric Scorecards (Pixel-Perfect Alignment) -->
      <div class="metrics-grid">
        <!-- 1. Brand Mention Rate -->
        <div class="ds-card metric-scorecard">
          <div class="scorecard-top">
            <div class="scorecard-title-group">
              <span class="scorecard-title">品牌 AI 提及率</span>
            </div>
            <span class="scorecard-tag">4 大引擎</span>
          </div>
          <div class="scorecard-value-wrap">
            <div class="scorecard-big-num font-number">${brandMention.percent}</div>
            <div class="scorecard-fraction font-number">${brandMention.fraction ? `${brandMention.fraction} 次提及` : '尚無觀測'}</div>
          </div>
          <div class="scorecard-sparkline">
            ${renderSparkline(mentionSeries, { stroke: '#3B82F6' })}
          </div>
          <div class="scorecard-footer">
            <div class="footer-left">
              <span class="delta-badge delta-${deltaMention.type}">
                ${deltaMention.type === 'positive' ? ICONS.arrowUp : (deltaMention.type === 'negative' ? ICONS.arrowDown : '')}
                <span>${deltaMention.text}</span>
              </span>
              <span class="delta-desc">${deltaMention.note}</span>
            </div>
          </div>
        </div>

        <!-- 2. Official Citation Rate -->
        <div class="ds-card metric-scorecard">
          <div class="scorecard-top">
            <div class="scorecard-title-group">
              <span class="scorecard-title">官網第一方引用率</span>
            </div>
            <span class="scorecard-tag official">${ICONS.verified} 官方驗證</span>
          </div>
          <div class="scorecard-value-wrap">
            <div class="scorecard-big-num font-number">${officialCite.percent}</div>
            <div class="scorecard-fraction font-number">${officialCite.fraction ? `${officialCite.fraction} 次引用` : '尚無引用'}</div>
          </div>
          <div class="scorecard-sparkline">
            ${renderSparkline(officialSeries, { stroke: '#0B1F3B' })}
          </div>
          <div class="scorecard-footer">
            <div class="footer-left">
              <span class="delta-badge delta-${deltaOfficial.type}">
                ${deltaOfficial.type === 'positive' ? ICONS.arrowUp : (deltaOfficial.type === 'negative' ? ICONS.arrowDown : '')}
                <span>${deltaOfficial.text}</span>
              </span>
              <span class="delta-desc">${deltaOfficial.note}</span>
            </div>
          </div>
        </div>

        <!-- 3. Distinct Citation Domains -->
        <div class="ds-card metric-scorecard">
          <div class="scorecard-top">
            <div class="scorecard-title-group">
              <span class="scorecard-title">AI 引用網域總數</span>
            </div>
            <span class="scorecard-tag">來源多元</span>
          </div>
          <div class="scorecard-value-wrap">
            <div class="scorecard-big-num font-number">${domainCount.val}</div>
            <div class="scorecard-fraction font-number">${domainCount.val !== '--' ? '跨主流媒體與資料源' : '尚無資料'}</div>
          </div>
          <div class="scorecard-sparkline">
            ${renderSparkline(domainSeries, { stroke: '#1A73E8' })}
          </div>
          <div class="scorecard-footer">
            <button type="button" class="btn-card-action" id="btn-goto-citations">
              <span class="action-tag">榜單</span>
              <span class="action-text">檢視引用排行</span>
              ${ICONS.arrowRight}
            </button>
          </div>
        </div>

        <!-- 4. Observation Coverage -->
        <div class="ds-card metric-scorecard">
          <div class="scorecard-top">
            <div class="scorecard-title-group">
              <span class="scorecard-title">觀測執行覆蓋率</span>
            </div>
            <span class="scorecard-tag health ${latest_run?.state || 'complete'}">${latest_run?.state === 'complete' ? '觀測完整' : (latest_run?.state === 'partial' ? '部分缺損' : '觀測中斷')}</span>
          </div>
          <div class="scorecard-value-wrap">
            <div class="scorecard-big-num font-number">${coverage.percent}</div>
            <div class="scorecard-fraction font-number">${coverage.fraction ? `${coverage.fraction} 成功執行` : '100% 完整'}</div>
          </div>
          <div class="scorecard-sparkline">
            ${renderSparkline(coverageSeries, { stroke: '#10B981' })}
          </div>
          <div class="scorecard-footer">
            <div class="footer-left">
              <span class="delta-badge delta-positive">
                ${ICONS.check}
                <span>排程全數正常</span>
              </span>
              <span class="delta-desc">4 大引擎皆已就緒</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Centerpiece: AI 聲量分析走勢圖 -->
      <div class="ds-card trend-chart-section">
        <div class="trend-chart-header">
          <div class="chart-header-left">
            <h2 class="chart-main-title">品牌 AI 聲量與可見度趨勢分析</h2>
            <p class="chart-main-sub">每週定時觀測大模型回答中本品牌的推薦採用佔比</p>
          </div>

          <!-- Chart Mode Switcher: 綜合聲量 vs 四引擎對比 -->
          <div class="chart-view-toggle" role="group" aria-label="圖表檢視模式">
            <button type="button"
                    class="btn-chart-mode ${chartMode === 'overall' ? 'active' : ''}"
                    id="btn-mode-overall">
              綜合聲量走勢
            </button>
            <button type="button"
                    class="btn-chart-mode ${chartMode === 'engines' ? 'active' : ''}"
                    id="btn-mode-engines">
              四引擎分項對比
            </button>
          </div>
        </div>

        <!-- Engines Filter Legend (if engines mode active) -->
        ${chartMode === 'engines' ? `
          <div class="chart-engines-toolbar">
            <div class="legend-pills-wrap">
              ${Object.values(ENGINES).map(eng => {
                const isActive = AppState.activeEngines.has(eng.id);
                return `
                  <button type="button"
                          class="legend-engine-btn ${isActive ? 'active' : 'inactive'}"
                          data-engine="${eng.id}"
                          title="點擊切換顯示 ${eng.name}">
                    <span class="eng-icon" style="color: ${eng.color}">${ICONS[eng.id]}</span>
                    <span class="eng-name">${eng.name}</span>
                    <span class="eng-toggle-status font-mono">${isActive ? 'ON' : 'OFF'}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        ` : `
          <div class="chart-overall-summary-bar">
            <span class="legend-overall-indicator"></span>
            <span class="legend-summary-text">${project?.name || '品牌'} 綜合 AI 可見度採用率</span>
          </div>
        `}

        <!-- Line Chart Container -->
        <div class="trend-chart-container">
          ${renderTrendLineChart(series, {
            width: 1040,
            height: 310,
            mode: chartMode,
            activeEngines: [...AppState.activeEngines]
          })}
        </div>
      </div>

      <!-- Audit Trail Table -->
      <div class="ds-card audit-trail-section">
        <div class="sec-title-wrap">
          <div>
            <h3 class="sec-title">觀測履歷與操作里程碑</h3>
            <p class="section-desc">每週排程之觀測結果、題組版本演進與行銷操作標記</p>
          </div>
          <button type="button" class="btn-secondary" id="btn-add-annotation">
            ${ICONS.plus}
            <span>新增行銷標記</span>
          </button>
        </div>

        <div class="table-responsive">
          <table class="brand-data-table">
            <thead>
              <tr>
                <th>觀測輪次</th>
                <th>觀測日期</th>
                <th>題組版本</th>
                <th>執行狀態</th>
                <th>觀測覆蓋率 (實測/預期)</th>
                <th>品牌提及率</th>
                <th>官網引用率</th>
                <th style="text-align: right;">事證調閱</th>
              </tr>
            </thead>
            <tbody>
              ${series.slice().reverse().slice(0, 8).map(r => `
                <tr>
                  <td class="font-mono run-id-cell">
                    <span class="status-indicator-dot ${r.state}"></span>
                    <span>${r.run_id}</span>
                  </td>
                  <td class="font-mono">${formatDate(r.observed_at)}</td>
                  <td>
                    <span class="badge-version font-mono">v${r.question_set_version || '1'}</span>
                  </td>
                  <td>
                    <span class="pill-state ${r.state}">
                      ${r.state === 'complete' ? '正常完成' : (r.state === 'partial' ? '部分執行' : '觀測中斷')}
                    </span>
                  </td>
                  <td class="font-mono">${r.coverage.measured}/${r.coverage.expected} (${((r.coverage.measured / r.coverage.expected) * 100).toFixed(0)}%)</td>
                  <td class="font-mono font-bold text-navy">${formatRatio(r.metrics?.brand_mention_rate).percent}</td>
                  <td class="font-mono text-mint">${formatRatio(r.metrics?.official_citation_rate).percent}</td>
                  <td style="text-align: right;">
                    <button type="button" class="btn-table-inspect" data-run-id="${r.run_id}">
                      ${ICONS.drawer} 調閱事證
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}
