// Formatting Utilities for GeoCheck Product A Dashboard
// Implements explicit numerator/denominator rules per DASHBOARD_UI_SPEC & FRONTEND_ACCEPTANCE

export const ENGINES = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    model: 'gpt-5.6-luna',
    color: '#10A37F',
    bg: '#EBF8F4',
    border: 'rgba(16, 163, 127, 0.25)',
    pillBg: 'rgba(16, 163, 127, 0.12)',
    tag: 'ChatGPT'
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    model: 'gemini-3.5-flash',
    color: '#1A73E8',
    bg: '#EBF3FE',
    border: 'rgba(26, 115, 232, 0.25)',
    pillBg: 'rgba(26, 115, 232, 0.12)',
    tag: 'AI Overviews'
  },
  anthropic: {
    id: 'anthropic',
    name: 'Claude',
    model: 'claude-haiku-4.5',
    color: '#D97706',
    bg: '#FEF7EC',
    border: 'rgba(217, 119, 6, 0.25)',
    pillBg: 'rgba(217, 119, 6, 0.12)',
    tag: 'Claude Search'
  },
  perplexity: {
    id: 'perplexity',
    name: 'Perplexity',
    model: 'sonar-pro',
    color: '#00B8A9',
    bg: '#E6FAF8',
    border: 'rgba(0, 184, 169, 0.25)',
    pillBg: 'rgba(0, 184, 169, 0.12)',
    tag: 'Perplexity'
  }
};

/**
 * Format ratio metric with explicit numerator and denominator.
 * E.g., { value: 87.5, numerator: 7, denominator: 8 } -> "87.5% (7/8)"
 */
export function formatRatio(metric) {
  if (!metric || metric.value === null || metric.value === undefined) {
    return {
      percent: '未知',
      fraction: '無可用觀測',
      full: '未知 (無可用觀測)',
      isUnknown: true,
      raw: null
    };
  }

  const pct = Number(metric.value).toFixed(1) + '%';
  const hasFraction = metric.numerator !== null && metric.denominator !== null && metric.denominator !== undefined;
  const fraction = hasFraction ? `${metric.numerator}/${metric.denominator}` : (metric.numerator !== null ? `${metric.numerator}` : '');
  const full = hasFraction ? `${pct} (${fraction})` : pct;

  return {
    percent: pct,
    fraction: fraction,
    full: full,
    isUnknown: false,
    raw: metric.value,
    numerator: metric.numerator,
    denominator: metric.denominator
  };
}

/**
 * Format delta with comparison boundary awareness.
 */
export function formatDelta(delta, comparisonStatus) {
  if (comparisonStatus === 'question_set_changed') {
    return {
      text: '題組已變更',
      type: 'boundary',
      icon: 'alert',
      note: '版本變更暫停跨期比對',
      disabled: true
    };
  }

  if (comparisonStatus === 'no_prior_run' || delta === null || delta === undefined) {
    return {
      text: '基準首輪',
      type: 'baseline',
      icon: 'info',
      note: '尚無前一週同版本比對',
      disabled: true
    };
  }

  const num = Number(delta);
  if (num > 0) {
    return {
      text: `+${num.toFixed(1)}%`,
      type: 'positive',
      icon: 'up',
      note: '較前週同一題組',
      disabled: false
    };
  } else if (num < 0) {
    return {
      text: `${num.toFixed(1)}%`,
      type: 'negative',
      icon: 'down',
      note: '較前週同一題組',
      disabled: false
    };
  } else {
    return {
      text: `0.0%`,
      type: 'neutral',
      icon: 'flat',
      note: '較前週持平',
      disabled: false
    };
  }
}

/**
 * Date and time formatting
 */
export function formatDate(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString);
  return d.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export function formatDateTime(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString);
  return d.toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
}

export function formatRelativeTime(isoString) {
  if (!isoString) return '無記錄';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString);
  const diffMs = Date.now() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return '剛剛 (1 小時內)';
  if (diffHours < 24) return `${diffHours} 小時前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  return formatDate(isoString);
}

export function formatCountdownDays(isoString) {
  if (!isoString) return '未排程';
  const target = new Date(isoString);
  if (isNaN(target.getTime())) return '未排程';
  const diffMs = target.getTime() - Date.now();
  if (diffMs <= 0) return '排程即將啟動';
  const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return `${days} 天後`;
}

/**
 * Get status indicator classes & text
 */
export function getRunStateMeta(state) {
  switch (state) {
    case 'complete':
      return { label: '完整觀測 (Complete)', color: '#27C93F', bg: '#E8FAF0', border: '#A6F4C5' };
    case 'partial':
      return { label: '部分觀測 (Partial)', color: '#D97706', bg: '#FEF7EC', border: '#FDE68A' };
    case 'failed':
      return { label: '觀測中斷 (Failed)', color: '#D6453D', bg: '#FDF2F2', border: '#FCA5A5' };
    default:
      return { label: state || '未知', color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' };
  }
}
