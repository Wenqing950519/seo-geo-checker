// Data Quality Tab View for GeoCheck Product A Dashboard
// Strictly fulfills DASHBOARD_UI_SPEC:
// 1. Lists each scheduled Tracking Run with complete/partial/failed
// 2. Breaks down expected / measured / unknown / failed counts
// 3. unknown, provider failure, and a measured zero are ALWAYS distinct visual states

import { ICONS } from '../shared/icons.js';
import { formatDateTime } from '../shared/formatters.js';

export function renderQuality(data) {
  if (!data) {
    return `<div class="view-loading"><div class="spinner"></div><p>正在載入觀測品質日誌...</p></div>`;
  }

  const runs = data.runs || [];
  const totalRuns = runs.length;
  const completeRuns = runs.filter(r => r.state === 'complete').length;
  const partialRuns = runs.filter(r => r.state === 'partial').length;
  const failedRuns = runs.filter(r => r.state === 'failed').length;

  const totalExpected = runs.reduce((s, r) => s + (r.coverage?.expected || 0), 0);
  const totalMeasured = runs.reduce((s, r) => s + (r.coverage?.measured || 0), 0);
  const totalUnknown = runs.reduce((s, r) => s + (r.coverage?.unknown || 0), 0);
  const totalFailed = runs.reduce((s, r) => s + (r.coverage?.failed || 0), 0);
  const overallCoverageRate = totalExpected > 0 ? ((totalMeasured / totalExpected) * 100).toFixed(1) : '100.0';

  return `
    <div class="quality-view animate-fade-in">
      <!-- Quality Metrics Summary Cards -->
      <div class="quality-metrics-grid">
        <div class="ds-card quality-metric-card">
          <span class="q-metric-label">整體觀測成功覆蓋率</span>
          <div class="q-metric-val font-mono">${overallCoverageRate}%</div>
          <span class="q-metric-sub font-mono">${totalMeasured}/${totalExpected} 筆觀測成功完成</span>
        </div>

        <div class="ds-card quality-metric-card">
          <span class="q-metric-label">排程輪次健康分佈</span>
          <div class="runs-dist-bar">
            <div class="dist-seg complete" style="width: ${(completeRuns / (totalRuns || 1)) * 100}%" title="完整: ${completeRuns}"></div>
            <div class="dist-seg partial" style="width: ${(partialRuns / (totalRuns || 1)) * 100}%" title="部分: ${partialRuns}"></div>
            <div class="dist-seg failed" style="width: ${(failedRuns / (totalRuns || 1)) * 100}%" title="中斷: ${failedRuns}"></div>
          </div>
          <div class="runs-dist-legend font-mono">
            <span class="legend-tag complete">● 完整 ${completeRuns}</span>
            <span class="legend-tag partial">● 部分 ${partialRuns}</span>
            <span class="legend-tag failed">● 中斷 ${failedRuns}</span>
          </div>
        </div>

        <div class="ds-card quality-metric-card">
          <span class="q-metric-label">異常狀態觀測累計</span>
          <div class="q-metric-val font-mono">${totalUnknown + totalFailed} 筆</div>
          <span class="q-metric-sub font-mono">其中 Unknown: ${totalUnknown}，Failed: ${totalFailed}</span>
        </div>
      </div>

      <!-- Tracking Runs History Table -->
      <div class="ds-card quality-table-card">
        <div class="sec-title-wrap" style="margin-bottom: 16px;">
          <div>
            <h2 class="sec-title">定時排程追蹤紀錄</h2>
            <p class="quality-table-desc">嚴格記錄每週排程之預期觀測數、實測數、未知缺損與失敗次數</p>
          </div>
        </div>

        <div class="table-responsive">
          <table class="brand-data-table">
            <thead>
              <tr>
                <th>排程輪次</th>
                <th>排程與觀測時間</th>
                <th>執行狀態</th>
                <th>預期數</th>
                <th>實測真值</th>
                <th>未知缺損</th>
                <th>失敗中斷</th>
                <th>覆蓋率視覺條</th>
                <th style="text-align: right;">事證調閱</th>
              </tr>
            </thead>
            <tbody>
              ${runs.map(r => {
                const exp = r.coverage?.expected || 0;
                const meas = r.coverage?.measured || 0;
                const unk = r.coverage?.unknown || 0;
                const fail = r.coverage?.failed || 0;
                const measPct = exp > 0 ? (meas / exp) * 100 : 0;
                const unkPct = exp > 0 ? (unk / exp) * 100 : 0;
                const failPct = exp > 0 ? (fail / exp) * 100 : 0;

                return `
                  <tr class="run-quality-row state-${r.state}">
                    <td class="font-mono font-bold">${r.run_id}</td>
                    <td>
                      <div class="time-meta-cell">
                        <span class="font-mono">${formatDateTime(r.observed_at)}</span>
                      </div>
                    </td>
                    <td>
                      <span class="pill-state ${r.state}">
                        ${r.state === 'complete' ? '正常完成' : (r.state === 'partial' ? '部分執行' : '觀測中斷')}
                      </span>
                    </td>
                    <td class="font-mono">${exp}</td>
                    <td class="font-mono text-mint font-bold">${meas}</td>
                    <td class="font-mono text-warning font-bold">${unk > 0 ? unk : '-'}</td>
                    <td class="font-mono text-danger font-bold">${fail > 0 ? fail : '-'}</td>
                    <td>
                      <div class="coverage-bar-track" title="實測: ${meas} (${measPct.toFixed(0)}%), 未知: ${unk}, 失敗: ${fail}">
                        <div class="cov-seg measured" style="width: ${measPct}%"></div>
                        <div class="cov-seg unknown" style="width: ${unkPct}%"></div>
                        <div class="cov-seg failed" style="width: ${failPct}%"></div>
                      </div>
                    </td>
                    <td style="text-align: right;">
                      <button type="button" class="btn-table-inspect" data-run-id="${r.run_id}">
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
