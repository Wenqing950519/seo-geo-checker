// Citations & Sources Tab View for GeoCheck Product A Dashboard
// Strictly fulfills DASHBOARD_UI_SPEC:
// 1. Ranks sources by observed citation count
// 2. First-party citations explicitly marked
// 3. Describes observed citations only; does not infer authority, traffic impact, or recommendation causality

import { ICONS } from '../shared/icons.js';

export function renderCitations(data) {
  if (!data) {
    return `<div class="view-loading"><div class="spinner"></div><p>正在載入引用來源拓撲...</p></div>`;
  }

  const sources = data.sources || [];
  const totalCitations = sources.reduce((sum, s) => sum + (s.citations || 0), 0);
  const officialCitations = sources.reduce((sum, s) => sum + (s.official_citations || 0), 0);
  const officialShare = totalCitations > 0 ? ((officialCitations / totalCitations) * 100).toFixed(1) : '0.0';

  return `
    <div class="citations-view animate-fade-in">
      <!-- Top Metric Cards -->
      <div class="citations-metrics-grid">
        <div class="ds-card citation-metric-card">
          <span class="c-metric-label">總觀測引用來源數</span>
          <div class="c-metric-val font-mono">${totalCitations} 次引用</div>
          <span class="c-metric-sub">分佈於 ${sources.length} 個不同獨立網域</span>
        </div>

        <div class="ds-card citation-metric-card highlight">
          <span class="c-metric-label">官方第一方引用佔比</span>
          <div class="c-metric-val font-mono text-mint">${officialShare}%</div>
          <span class="c-metric-sub font-mono">(${officialCitations}/${totalCitations} 次引用直接指向品牌官網)</span>
        </div>

        <div class="ds-card citation-metric-card">
          <span class="c-metric-label">第三方生態來源數</span>
          <div class="c-metric-val font-mono">${totalCitations - officialCitations} 次</div>
          <span class="c-metric-sub">涵蓋美食雜誌、訂位系統、旅遊指南</span>
        </div>
      </div>

      <!-- Sources Ranking Table -->
      <div class="ds-card sources-table-card">
        <div class="sec-title-wrap" style="margin-bottom: 16px;">
          <div>
            <h2 class="sec-title">觀測引用網域排行</h2>
            <p class="sources-table-desc">依被各大模型引用的次數降序排列，官方第一方網域明確標記</p>
          </div>
        </div>

        <div class="table-responsive">
          <table class="brand-data-table">
            <thead>
              <tr>
                <th style="width: 60px;">排名</th>
                <th>引用網域</th>
                <th style="width: 140px;">網域屬性</th>
                <th style="width: 140px;">被引用次數</th>
                <th style="width: 220px;">引用份額佔比</th>
                <th style="width: 110px; text-align: right;">調閱事證</th>
              </tr>
            </thead>
            <tbody>
              ${sources.map((s, idx) => {
                const pct = totalCitations > 0 ? ((s.citations / totalCitations) * 100).toFixed(1) : '0.0';
                return `
                  <tr class="source-row ${s.isOfficial ? 'row-official' : ''}">
                    <td class="font-mono rank-cell">${idx + 1}</td>
                    <td>
                      <div class="domain-info-cell">
                        <span class="domain-name font-mono">${s.domain}</span>
                        <a href="https://${s.domain}" target="_blank" rel="noopener" class="domain-link" title="開啟該網域">
                          ${ICONS.externalLink}
                        </a>
                      </div>
                    </td>
                    <td>
                      ${s.isOfficial ? `
                        <span class="domain-badge official">
                          ${ICONS.verified} 品牌官方網域
                        </span>
                      ` : `
                        <span class="domain-badge third-party">
                          第三方來源
                        </span>
                      `}
                    </td>
                    <td class="font-mono font-bold">${s.citations} 次</td>
                    <td>
                      <div class="share-bar-wrap">
                        <div class="share-bar-track">
                          <div class="share-bar-fill ${s.isOfficial ? 'official' : ''}" style="width: ${pct}%"></div>
                        </div>
                        <span class="share-bar-pct font-mono">${pct}%</span>
                      </div>
                    </td>
                    <td style="text-align: right;">
                      <button type="button" class="btn-table-inspect" data-domain="${s.domain}">
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
