// Persistent Left Navigation Sidebar for GeoCheck Product A Dashboard
// Implements specs from DASHBOARD_UI_SPEC:
// 1. Overview  2. Performance  3. Tracked Questions  4. Citations & Sources  5. Data Quality

import { ICONS } from './icons.js';
import { AppState } from './state.js';

export function renderSidebar() {
  const currentTab = AppState.activeTab;
  const activeQuestionCount = Array.isArray(AppState.currentQuestionSets)
    ? (AppState.currentQuestionSets[0]?.questions?.length || 0)
    : 0;
  const entitlement = AppState.currentEntitlement || {};
  const planLabel = entitlement.plan === 'paid_beta'
    ? 'Paid Beta · 定期監測'
    : 'Free · 每週自動追蹤';
  // Distinguish "still loading" from "nothing to load": a new account has no
  // Project, and showing it a loading label forever reads as a hung page.
  const project = AppState.currentProject
    || { name: AppState.loading ? '載入中…' : '尚未建立專案', siteUrl: '' };

  const navItems = [
    { id: 'overview', label: '總覽指標', icon: ICONS.overview },
    { id: 'performance', label: '模型表現趨勢', icon: ICONS.performance },
    { id: 'questions', label: 'AI 提問監測', icon: ICONS.questions, badge: activeQuestionCount || null },
    { id: 'citations', label: 'AI 引用來源', icon: ICONS.citations },
    { id: 'quality', label: '觀測紀錄與品質', icon: ICONS.quality, dot: true }
    ,{ id: 'billing', label: '方案與訂閱', icon: ICONS.overview }
  ];

  // Filter projects for sliding drawer
  const searchQ = (AppState.brandDrawerSearch || '').toLowerCase();
  const filteredProjects = (AppState.projectsList || []).filter(p => 
    !searchQ || p.name.toLowerCase().includes(searchQ) || (p.siteUrl || '').toLowerCase().includes(searchQ)
  );

  return `
    <aside class="dashboard-sidebar">
      <div class="sidebar-header">
        <a href="https://lslabs.tw/" class="brand-link" title="返回 LS-Labs 首頁">
          <div class="brand-logo-icon">${ICONS.logo}</div>
          <div class="brand-text">
            <div class="brand-name">GeoCheck Track<span style="color:var(--gc-mint)">.</span></div>
            <div class="brand-sub">By LS-Labs</div>
          </div>
        </a>
      </div>

      <!-- Project Picker Card (GA4 Style Sliding Drawer Trigger) -->
      <div class="sidebar-project-card" id="btn-open-brand-drawer" role="button" tabindex="0" title="點擊滑出切換品牌與新增監測網站">
        <div class="project-card-meta">
          <span class="project-label">目前追蹤品牌</span>
          <span class="project-drawer-trigger-badge">切換 ▾</span>
        </div>
        <div class="project-title" title="${project.name}">${project.name}</div>
        <div class="project-site-link font-number">
          <span>${(project.siteUrl || '').replace(/^https?:\/\//, '')}</span>
          ${ICONS.externalLink}
        </div>
      </div>

      <!-- Navigation Menu -->
      <nav class="sidebar-nav" aria-label="主要功能選單">
        <div class="nav-section-title">分析模組</div>
        ${navItems.map(item => `
          <button type="button"
                  class="nav-item ${currentTab === item.id ? 'active' : ''}"
                  data-tab="${item.id}"
                  role="tab"
                  aria-selected="${currentTab === item.id}">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label-wrap">
              <span class="nav-label">${item.label}</span>
            </span>
            ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ''}
            ${item.dot ? `<span class="nav-status-dot ${AppState.currentOverview?.latest_run?.state === 'complete' ? 'green' : 'amber'}"></span>` : ''}
          </button>
        `).join('')}

        <div class="nav-section-title" style="margin-top: 18px;">開發者生態</div>
        <a href="https://platform.lslabs.tw/"
           class="nav-item"
           target="_blank"
           rel="noopener noreferrer"
           style="text-decoration:none;"
           title="開啟 Platform By LS-Labs 與官方量測 API (另開新視窗)">
          <span class="nav-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 18 22 12 16 6"/>
              <polyline points="8 6 2 12 8 18"/>
            </svg>
          </span>
          <span class="nav-label-wrap">
            <span class="nav-label">Developer Platform</span>
          </span>
          <span class="nav-badge">API ↗</span>
        </a>
      </nav>

      <!-- Sidebar Footer (Production Status & Connected Google Account) -->
      <div class="sidebar-footer">
        <div class="sidebar-account-card" id="btn-open-auth" role="button" tabindex="0" title="點擊檢視 Google 帳戶連線狀態">
          <div class="account-avatar">
            <svg class="google-icon" width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
          </div>
          <div class="account-info">
            <div class="account-title">Google 帳戶已連線</div>
            <div class="account-sub">${planLabel}</div>
          </div>
        </div>
        <div class="sidebar-version-tag">
          <span>GeoCheck Track</span>
          <span>v1.0</span>
        </div>
      </div>
    </aside>

    <!-- GA4-Style Sliding Brand Drawer (Offcanvas from Left) -->
    <div class="brand-sliding-drawer ${AppState.isBrandDrawerOpen ? 'open' : ''}" id="brand-sliding-drawer" aria-hidden="${!AppState.isBrandDrawerOpen}">
      <div class="brand-drawer-header">
        <div class="brand-drawer-title-wrap">
          <h3 class="brand-drawer-title">管理監測品牌與網站</h3>
          <p class="brand-drawer-sub">快速切換觀測專案或新增監測網域</p>
        </div>
        <button type="button" class="btn-drawer-close" id="btn-close-brand-drawer" aria-label="關閉品牌切換抽屜">
          ${ICONS.x}
        </button>
      </div>

      <!-- Search Brand Input -->
      <div class="brand-drawer-search-wrap">
        <span class="search-icon">${ICONS.search}</span>
        <input type="text"
               id="input-brand-drawer-search"
               class="brand-drawer-search-input"
               placeholder="搜尋品牌名稱、網址或專案..."
               value="${AppState.brandDrawerSearch || ''}" />
      </div>

      <!-- Brand Projects List -->
      <div class="brand-drawer-scroll">
        <div class="brand-section-label">目前已建立專案 (${filteredProjects.length})</div>
        <div class="brand-projects-list">
          ${filteredProjects.map(p => {
            const isCurrent = AppState.currentProject?.projectId === p.projectId;
            return `
              <div class="brand-project-item ${isCurrent ? 'active' : ''}" data-project-id="${p.projectId}" role="button" tabindex="0">
                <div class="brand-item-radio">
                  <span class="radio-dot ${isCurrent ? 'selected' : ''}"></span>
                </div>
                <div class="brand-item-info">
                  <div class="brand-item-title-row">
                    <span class="brand-item-name">${p.name}</span>
                    ${isCurrent ? '<span class="badge-active-pill">觀測中</span>' : ''}
                  </div>
                  <div class="brand-item-url font-number">${p.siteUrl}</div>
                  <div class="brand-item-meta-row font-number">
                    <span>${Number.isFinite(p.questionsCount) ? `${p.questionsCount} 組提問` : '尚無追蹤題目'}</span>
                    ${Number.isFinite(p.sov) ? `<span class="dot-sep">•</span><span>AI 能見度 <strong>${p.sov}%</strong></span>` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Quick Add Section -->
        <div class="brand-add-section">
          <div class="brand-section-label">新增監測品牌或網站</div>
          <form id="form-quick-add-brand" class="quick-add-brand-form">
            <div class="compact-field">
              <label for="input-quick-name">品牌或網站名稱</label>
              <input type="text" id="input-quick-name" class="form-input-sm" placeholder="例如：欣葉日本料理" required />
            </div>
            <div class="compact-field">
              <label for="input-quick-url">官網網址 (驗證官方引用)</label>
              <input type="url" id="input-quick-url" class="form-input-sm font-number" placeholder="https://example.com" required />
            </div>
            <button type="submit" class="btn-primary btn-sm btn-block">
              ${ICONS.plus} 建立並切換至此網站
            </button>
          </form>
        </div>

        <!-- Search Console connection is optional and remains distinct from Project creation. -->
        <div class="ga4-connect-card">
          <div class="ga4-card-header">
            <span class="ga4-badge">Google Search Console</span>
          </div>
          <div class="ga4-card-title">匯入已驗證網站的搜尋資料</div>
          <p class="ga4-card-desc">
            連線後才會要求選擇與此專案網域相符的 Search Console property；連線本身不會建立觀測或改寫既有資料。
          </p>
          <button type="button" class="btn-google-auth-btn" id="btn-open-ga4-connect">
            <svg width="15" height="15" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
            <span>連接 Google 帳號</span>
          </button>
          <button type="button" class="btn-ghost btn-sm" id="btn-show-ga4-eval" style="width:100%; justify-content:center; margin-top:2px; font-size:0.75rem;">
            查看串接狀態與資料範圍
          </button>
        </div>
      </div>
    </div>

    <!-- Sliding Drawer Backdrop -->
    ${AppState.isBrandDrawerOpen ? `<div class="brand-drawer-backdrop" id="brand-drawer-backdrop"></div>` : ''}
  `;
}
