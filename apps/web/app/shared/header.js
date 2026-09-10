// Persistent Top Controls Header for GeoCheck Product A Dashboard
// Benchmarked against GA4 / Ahrefs: clean, authoritative, zero visual noise

import { ICONS } from './icons.js';
import { formatRelativeTime, formatCountdownDays, formatDate } from './formatters.js';
import { AppState } from './state.js';
import { api } from './api.js';

export function renderHeader() {
  const isAuthed = api.hasSession();

  // If unauthenticated: render clean, minimal topbar with brand on left and Google Login on right
  if (!isAuthed) {
    return `
      <header class="dashboard-topbar unauthenticated-topbar">
        <div class="topbar-brand-wrap">
          <a href="/" class="brand-link" title="返回 GeoCheck 首頁">
            <div class="brand-logo-icon">${ICONS.logo}</div>
            <div class="brand-text">
              <div class="brand-name">GeoCheck<span style="color:var(--gc-mint)">.</span></div>
              <div class="brand-sub">AI GEO Marketer Suite</div>
            </div>
          </a>
        </div>

        <div class="topbar-controls">
          <button type="button" class="btn-google-signin-topbar" id="btn-topbar-google-login" title="使用 Google 帳戶登入">
            <svg class="google-icon" width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>使用 Google 帳戶登入</span>
          </button>
        </div>
      </header>
    `;
  }

  const freshnessTime = AppState.currentOverview?.data_freshness_at;
  const nextRunTime = AppState.currentOverview?.tracking?.next_run_at;

  const tabTitles = {
    overview: { title: '總覽指標監控', desc: '核心率值指標、AI 聲量走勢與最新變更紀錄' },
    performance: { title: '四大引擎表現對比', desc: 'OpenAI、Google Gemini、Claude、Perplexity 觀測時間序列與橫向矩陣' },
    questions: { title: 'AI 提問監測', desc: '監測品牌在消費者關鍵提問情境中的 AI 推薦狀況與提及順位' },
    citations: { title: 'AI 引用來源', desc: '大模型回答實際引用之外部媒體、評測網域排行榜與官網占比' },
    quality: { title: '觀測紀錄與品質', desc: '每週排程監測歷程、執行狀態與資料覆蓋健康度稽核' }
  };

  const currentMeta = tabTitles[AppState.activeTab] || tabTitles.overview;

  return `
    <header class="dashboard-topbar">
      <!-- Title & Context -->
      <div class="topbar-title-wrap">
        <h1 class="topbar-title">${currentMeta.title}</h1>
        <p class="topbar-desc">${currentMeta.desc}</p>
      </div>

      <!-- Persistent Global Controls (Clear Hierarchy) -->
      <div class="topbar-controls">
        <!-- Freshness Status -->
        <div class="meta-status-text">
          <span class="status-dot ${freshnessTime ? 'green' : 'amber'}"></span>
          <span>資料更新：<strong>${freshnessTime ? formatRelativeTime(freshnessTime) : '尚無'}</strong></span>
          <span style="color: #CBD5E1">|</span>
          <span>下次追蹤：<strong>${nextRunTime ? formatCountdownDays(nextRunTime) : '每週排程'}</strong></span>
        </div>

        <!-- GA4 / Ahrefs Style Date Range Picker -->
        <div class="date-picker-wrap" id="date-picker-wrap">
          <button type="button" class="btn-date-picker-trigger ${AppState.isDatePickerOpen ? 'active' : ''}" id="btn-toggle-date-picker" title="切換觀測時間區間">
            <span class="picker-cal-icon">${ICONS.calendar}</span>
            <span class="picker-label-text font-number">${AppState.getDateRangeLabel()}</span>
            <span class="picker-chevron">${ICONS.chevronDown}</span>
          </button>

          ${AppState.isDatePickerOpen ? `
            <div class="date-picker-popover animate-fade-in" id="date-picker-popover">
              <div class="date-picker-grid">
                <div class="date-presets-col">
                  <div class="picker-section-heading">快捷區間</div>
                  <button type="button" class="date-preset-opt ${AppState.datePreset === '7d' ? 'active' : ''}" data-date-preset="7d">過去 7 天 (1 週)</button>
                  <button type="button" class="date-preset-opt ${AppState.datePreset === '14d' ? 'active' : ''}" data-date-preset="14d">過去 14 天 (2 週)</button>
                  <button type="button" class="date-preset-opt ${AppState.datePreset === '30d' ? 'active' : ''}" data-date-preset="30d">過去 30 天 (1 個月)</button>
                  <button type="button" class="date-preset-opt ${AppState.datePreset === '90d' ? 'active' : ''}" data-date-preset="90d">過去 90 天 (1 季)</button>
                  <button type="button" class="date-preset-opt ${AppState.datePreset === '180d' ? 'active' : ''}" data-date-preset="180d">過去 180 天 (半年)</button>
                  <button type="button" class="date-preset-opt ${AppState.datePreset === 'all' ? 'active' : ''}" data-date-preset="all">全部監測時間</button>
                </div>
                <div class="date-custom-col">
                  <div class="picker-section-heading">自訂區間 (Custom)</div>
                  <form id="form-custom-date-picker" class="custom-date-form">
                    <div class="custom-date-field">
                      <label for="input-custom-start">起始日期</label>
                      <input type="date" id="input-custom-start" class="date-input font-number" value="${AppState.customStartDate}" required />
                    </div>
                    <div class="custom-date-field">
                      <label for="input-custom-end">結束日期</label>
                      <input type="date" id="input-custom-end" class="date-input font-number" value="${AppState.customEndDate}" required />
                    </div>
                    <div class="date-actions">
                      <button type="button" class="btn-ghost btn-sm" id="btn-close-date-picker">關閉</button>
                      <button type="submit" class="btn-primary btn-sm" id="btn-apply-custom-date">套用自訂區間</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Auth Controls (Header Google Session & Logout) -->
        <div class="header-auth-wrap">
          <div class="session-pill-tag">
            <svg class="google-icon" width="14" height="14" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span class="session-pill-label">Google 帳號已連線</span>
            <button type="button" class="btn-auth-logout" id="btn-logout-app" title="登出當前帳號">登出</button>
          </div>
        </div>
      </div>
    </header>
  `;
}
