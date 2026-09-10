// Professional SVG Charting Utilities for GeoCheck Product A Dashboard
// Strictly conforms to GeoCheck Brand Identity (brand.html)
// Provides clean, crisp, publication-grade AI Share of Voice & Mention Trend charts

import { ENGINES } from './formatters.js';

/**
 * Generate mini responsive SVG Sparkline
 */
export function renderSparkline(data, options = {}) {
  const width = options.width || 120;
  const height = options.height || 36;
  const stroke = options.stroke || '#00B8A9';
  const strokeWidth = options.strokeWidth || 2;
  const gradId = `spk_grad_${Math.random().toString(36).slice(2, 8)}`;

  const validVals = (data || []).filter(v => v !== null && v !== undefined && !isNaN(v));
  if (validVals.length < 2) {
    return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="sparkline empty"><line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="#CBD5E1" stroke-dasharray="3,3" stroke-width="1.5"/></svg>`;
  }

  const padding = 4;
  const effHeight = height - padding * 2;
  const effWidth = width - padding * 2;
  const stepX = effWidth / (data.length - 1);

  const minVal = Math.min(...validVals);
  const maxVal = Math.max(...validVals);

  // Determine scaling bounds
  let rangeMin = 0;
  let rangeMax = 100;

  if (maxVal <= 30 && minVal >= 0) {
    // Count-based metric (e.g. domain counts)
    rangeMin = Math.max(0, Math.floor(minVal * 0.8));
    rangeMax = Math.ceil(maxVal * 1.2) || 15;
  } else {
    // Percentage-based metric
    rangeMin = 0;
    rangeMax = 100;
  }

  const points = [];
  data.forEach((val, idx) => {
    if (val !== null && val !== undefined && !isNaN(val)) {
      const x = padding + idx * stepX;
      let y;
      if (minVal === maxVal) {
        // Flat-line metric (e.g. 100% coverage): render at 40% height with soft gradient
        y = padding + effHeight * 0.4;
      } else {
        const norm = (val - rangeMin) / (rangeMax - rangeMin || 1);
        y = padding + effHeight - Math.min(1, Math.max(0, norm)) * effHeight;
      }
      points.push({ x, y, val });
    }
  });

  if (points.length < 2) {
    return `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="sparkline empty"><line x1="0" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="#CBD5E1" stroke-dasharray="3,3" stroke-width="1.5"/></svg>`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`;
  }

  const fillD = `${d} L ${points[points.length - 1].x.toFixed(1)} ${height - padding} L ${points[0].x.toFixed(1)} ${height - padding} Z`;

  return `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="sparkline">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${stroke}" stop-opacity="0.22" />
          <stop offset="100%" stop-color="${stroke}" stop-opacity="0.01" />
        </linearGradient>
      </defs>
      <path d="${fillD}" fill="url(#${gradId})" />
      <path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  `;
}

/**
 * Enterprise-grade AI 聲量分析走勢圖 (AI Share of Voice & Visibility Line Chart)
 * Benchmarked against Ahrefs / GA4 / Brandlight
 * Supports 'overall' (single prominent trend curve) or 'engines' (4-engine multi-line)
 */
export function renderTrendLineChart(series, options = {}) {
  const width = options.width || 940;
  const height = options.height || 300;
  const mode = options.mode || 'overall'; // 'overall' | 'engines'
  const activeEngines = options.activeEngines || ['openai', 'gemini', 'anthropic', 'perplexity'];

  const padLeft = 52;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 40;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  if (!series || series.length === 0) {
    return `<div class="chart-empty-state">尚無足夠之歷史週次資料</div>`;
  }

  // 1. Gridlines (0%, 25%, 50%, 75%, 100%)
  const gridLevels = [0, 25, 50, 75, 100];
  let gridHtml = '';
  gridLevels.forEach(pct => {
    const y = padTop + plotHeight - (pct / 100) * plotHeight;
    gridHtml += `
      <line x1="${padLeft}" y1="${y}" x2="${width - padRight}" y2="${y}" stroke="#E2E8F0" stroke-width="1" stroke-dasharray="${pct === 0 ? 'none' : '4,4'}"/>
      <text x="${padLeft - 12}" y="${y + 4}" text-anchor="end" font-size="11" fill="#64748B" font-family="'Noto Sans TC', system-ui, -apple-system, sans-serif" style="font-variant-numeric: tabular-nums;">${pct}%</text>
    `;
  });

  const numPoints = series.length;
  const stepX = numPoints > 1 ? plotWidth / (numPoints - 1) : plotWidth / 2;

  // 2. X-axis Dates and Version Change Boundary
  let xLabelsHtml = '';
  let boundariesHtml = '';
  let lastVersion = null;

  series.forEach((run, idx) => {
    const x = numPoints > 1 ? padLeft + idx * stepX : padLeft + plotWidth / 2;
    const dateStr = run.observed_at ? run.observed_at.slice(5, 10) : `W${idx + 1}`;

    // X axis ticks & labels
    xLabelsHtml += `
      <line x1="${x}" y1="${padTop + plotHeight}" x2="${x}" y2="${padTop + plotHeight + 6}" stroke="#CBD5E1" stroke-width="1"/>
      <text x="${x}" y="${padTop + plotHeight + 20}" text-anchor="middle" font-size="11" fill="#64748B" font-family="'Noto Sans TC', system-ui, -apple-system, sans-serif" style="font-variant-numeric: tabular-nums;">${dateStr}</text>
    `;

    // Boundary vertical marker if question set version changed
    if (run.question_set_version && lastVersion !== null && run.question_set_version !== lastVersion) {
      const boundX = x - stepX / 2;
      boundariesHtml += `
        <line x1="${boundX}" y1="${padTop}" x2="${boundX}" y2="${padTop + plotHeight}" stroke="#D97706" stroke-width="1.5" stroke-dasharray="4,4"/>
        <rect x="${boundX - 44}" y="${padTop + 6}" width="88" height="20" rx="4" fill="#FEF7EC" stroke="#FDE68A" stroke-width="1"/>
        <text x="${boundX}" y="${padTop + 19}" text-anchor="middle" font-size="10" font-weight="700" fill="#B45309">題組 v${run.question_set_version} 變更</text>
      `;
    }
    lastVersion = run.question_set_version || lastVersion;
  });

  let linesHtml = '';
  let dotsHtml = '';

  if (mode === 'overall') {
    // Single High-Impact Brand AI Visibility Line
    const points = [];
    series.forEach((run, idx) => {
      const x = numPoints > 1 ? padLeft + idx * stepX : padLeft + plotWidth / 2;
      const val = run.metrics?.brand_mention_rate?.value;
      if (val !== null && val !== undefined && !isNaN(val)) {
        const y = padTop + plotHeight - (Math.min(100, Math.max(0, val)) / 100) * plotHeight;
        points.push({ x, y, val, run });
      }
    });

    if (points.length >= 2) {
      let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cX1 = prev.x + (curr.x - prev.x) / 2;
        const cY1 = prev.y;
        const cX2 = prev.x + (curr.x - prev.x) / 2;
        const cY2 = curr.y;
        d += ` C ${cX1.toFixed(1)} ${cY1.toFixed(1)}, ${cX2.toFixed(1)} ${cY2.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
      }

      // Smooth Gradient Area Fill Below
      const fillD = `${d} L ${points[points.length - 1].x.toFixed(1)} ${padTop + plotHeight} L ${points[0].x.toFixed(1)} ${padTop + plotHeight} Z`;
      linesHtml += `
        <path d="${fillD}" fill="url(#overall-gradient)" opacity="0.25"/>
        <path d="${d}" fill="none" stroke="#00B8A9" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="chart-primary-line"/>
      `;
    }

    points.forEach(pt => {
      const tipText = `綜合 AI 品牌提及率：${pt.val.toFixed(1)}% (觀測時間：${pt.run.observed_at ? pt.run.observed_at.slice(0, 10) : ''}) • 點擊調閱事證`;
      dotsHtml += `
        <circle cx="${pt.x}" cy="${pt.y}" r="5.5" fill="#FFFFFF" stroke="#0B3B6F" stroke-width="3"
                class="chart-data-dot"
                tabindex="0"
                data-run-id="${pt.run.run_id}"
                data-rate="${pt.val.toFixed(1)}%"
                data-tooltip="${tipText}">
          <title>${tipText}</title>
        </circle>
      `;
    });
  } else {
    // Multi-Engine Breakdown Lines
    activeEngines.forEach(engId => {
      const engCfg = ENGINES[engId];
      if (!engCfg) return;

      const points = [];
      series.forEach((run, idx) => {
        const x = numPoints > 1 ? padLeft + idx * stepX : padLeft + plotWidth / 2;
        let val = null;
        if (run.engine_metrics && run.engine_metrics[engId]) {
          val = run.engine_metrics[engId].brand_mention_rate?.value;
        } else if (run.metrics?.brand_mention_rate) {
          val = run.metrics.brand_mention_rate.value;
        }

        if (val !== null && val !== undefined && !isNaN(val)) {
          const y = padTop + plotHeight - (Math.min(100, Math.max(0, val)) / 100) * plotHeight;
          points.push({ x, y, val, run, engId });
        }
      });

      if (points.length >= 2) {
        let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
        for (let i = 1; i < points.length; i++) {
          const prev = points[i - 1];
          const curr = points[i];
          const cX1 = prev.x + (curr.x - prev.x) / 2;
          const cY1 = prev.y;
          const cX2 = prev.x + (curr.x - prev.x) / 2;
          const cY2 = curr.y;
          d += ` C ${cX1.toFixed(1)} ${cY1.toFixed(1)}, ${cX2.toFixed(1)} ${cY2.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
        }
        linesHtml += `<path d="${d}" fill="none" stroke="${engCfg.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="chart-engine-line" data-engine="${engId}"/>`;
      }

      points.forEach(pt => {
        const tipText = `${engCfg.name}：${pt.val.toFixed(1)}% (觀測時間：${pt.run.observed_at ? pt.run.observed_at.slice(0, 10) : ''}) • 點擊調閱事證`;
        dotsHtml += `
          <circle cx="${pt.x}" cy="${pt.y}" r="5" fill="#FFFFFF" stroke="${engCfg.color}" stroke-width="2.5"
                  class="chart-data-dot"
                  tabindex="0"
                  data-engine="${engId}"
                  data-run-id="${pt.run.run_id}"
                  data-rate="${pt.val.toFixed(1)}%"
                  data-tooltip="${tipText}">
            <title>${tipText}</title>
          </circle>
        `;
      });
    });
  }

  return `
    <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" class="trend-line-chart" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="overall-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#00B8A9" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="#00B8A9" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <rect x="${padLeft}" y="${padTop}" width="${plotWidth}" height="${plotHeight}" fill="#FFFFFF" rx="4"/>
      ${gridHtml}
      ${boundariesHtml}
      ${xLabelsHtml}
      ${linesHtml}
      ${dotsHtml}
    </svg>
  `;
}
