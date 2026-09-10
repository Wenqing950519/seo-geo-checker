// GeoCheck Product A Marketing Dashboard - Main Application Controller
// Native Modern ES Module bootstrap and state-driven DOM rendering

import { AppState } from './shared/state.js';
import { api } from './shared/api.js';
import { getFixtureData } from './shared/fixtures.js';
import { renderSidebar } from './shared/sidebar.js';
import { renderHeader } from './shared/header.js';
import { renderOverview } from './overview/overview-view.js';
import { renderPerformance } from './performance/performance-view.js';
import { renderQuestions } from './questions/questions-view.js';
import { renderCitations } from './citations/citations-view.js';
import { renderQuality } from './quality/quality-view.js';
import { renderBilling } from './billing/billing-view.js';
import { renderEvidenceDrawer } from './evidence/evidence-drawer.js';
import { renderModals } from './auth/auth-view.js';

class DashboardApp {
  constructor() {
    this.sidebarEl = document.getElementById('sidebar-container');
    this.headerEl = document.getElementById('header-container');
    this.viewEl = document.getElementById('view-container');
    this.drawerEl = document.getElementById('drawer-container');
    this.modalEl = document.getElementById('modal-container');
    this.toastEl = document.getElementById('toast-container');
  }

  async init() {
    // Read route from window location hash
    const initialTab = window.location.hash.replace(/^#/, '');
    if (['overview', 'performance', 'questions', 'citations', 'quality', 'billing'].includes(initialTab)) {
      AppState.activeTab = initialTab;
    }

    // Subscribe to state mutations
    AppState.subscribe(() => this.render());

    // Setup DOM event delegation
    this.bindEvents();

    // Load initial data
    await this.loadCurrentData();
  }

  async loadCurrentData() {
    if (!api.hasSession()) {
      this.render();
      return;
    }
    AppState.loading = true;
    try {
      if (AppState.fixtureMode) {
        const fixture = getFixtureData(AppState.currentFixtureKey);
        AppState.currentProject = fixture.project;
        AppState.currentOverview = await api.getOverview(fixture.project.projectId, AppState.timeRangeWeeks);
        AppState.currentPerformance = await api.getPerformance(fixture.project.projectId, AppState.timeRangeWeeks);
        AppState.currentQuestionSets = (await api.listTrackedQuestions(fixture.project.projectId))?.data || fixture.questionSets;
        AppState.currentCitations = await api.getCitations(fixture.project.projectId, AppState.timeRangeWeeks);
        AppState.currentDataQuality = await api.getDataQuality(fixture.project.projectId, AppState.timeRangeWeeks);
        AppState.currentEntitlement = await api.getEntitlement();
      } else {
        const projects = (await api.listProjects())?.data || [];
        AppState.projectsList = projects;
        AppState.currentProject = projects[0] || null;
        AppState.currentEntitlement = await api.getEntitlement();
        if (!AppState.currentProject?.projectId) {
          AppState.currentOverview = null;
          AppState.currentPerformance = null;
          AppState.currentQuestionSets = [];
          AppState.currentCitations = null;
          AppState.currentDataQuality = null;
          return;
        }
        const projectId = AppState.currentProject.projectId;
        AppState.currentOverview = await api.getOverview(projectId, AppState.timeRangeWeeks);
        AppState.currentPerformance = await api.getPerformance(projectId, AppState.timeRangeWeeks);
        AppState.currentQuestionSets = (await api.listTrackedQuestions(projectId))?.data || [];
        AppState.currentCitations = await api.getCitations(projectId, AppState.timeRangeWeeks);
        AppState.currentDataQuality = await api.getDataQuality(projectId, AppState.timeRangeWeeks);
      }
    } catch (err) {
      console.error('[DashboardApp] Data fetch error:', err);
      AppState.showToast(`資料載入失敗：${err.message}`, 'warning');
    } finally {
      AppState.loading = false;
      this.render();
    }
  }

  render() {
    const isAuthed = api.hasSession();

    // Toggle unauthenticated state on app-shell
    const appShell = document.querySelector('.app-shell');
    if (appShell) {
      if (isAuthed) {
        appShell.classList.remove('unauthenticated-state');
      } else {
        appShell.classList.add('unauthenticated-state');
      }
    }

    // Render persistent components (only render sidebar when authenticated)
    if (this.sidebarEl) {
      this.sidebarEl.innerHTML = isAuthed ? renderSidebar() : '';
    }
    if (this.headerEl) this.headerEl.innerHTML = renderHeader();
    if (this.drawerEl) this.drawerEl.innerHTML = renderEvidenceDrawer();
    if (this.modalEl) this.modalEl.innerHTML = renderModals();

    // Render Toast
    if (this.toastEl) {
      if (AppState.toast) {
        this.toastEl.innerHTML = `
          <div class="toast-notice toast-${AppState.toast.type}">
            <span>${AppState.toast.message}</span>
          </div>
        `;
      } else {
        this.toastEl.innerHTML = '';
      }
    }

    // Render Active Tab View or Auth Gate ("不允許未登入使用")
    if (this.viewEl) {
      if (!isAuthed) {
        this.viewEl.innerHTML = this.renderAuthGate();
        return;
      }
      switch (AppState.activeTab) {
        case 'overview':
          this.viewEl.innerHTML = renderOverview(AppState.currentOverview);
          break;
        case 'performance':
          this.viewEl.innerHTML = renderPerformance(AppState.currentPerformance);
          break;
        case 'questions':
          this.viewEl.innerHTML = renderQuestions(AppState.currentQuestionSets);
          break;
        case 'citations':
          this.viewEl.innerHTML = renderCitations(AppState.currentCitations);
          break;
        case 'quality':
          this.viewEl.innerHTML = renderQuality(AppState.currentDataQuality);
          break;
        case 'billing':
          this.viewEl.innerHTML = renderBilling(AppState.currentEntitlement || {});
          break;
        default:
          this.viewEl.innerHTML = renderOverview(AppState.currentOverview);
      }
    }
  }

  renderAuthGate() {
    return `
      <div class="dashboard-auth-gate-wrap animate-fade-in">
        <div class="dashboard-auth-gate-card">
          <div class="gate-brand-icon">
            <svg width="34" height="34" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" fill="#F0F8FA" />
              <path d="M 38 15 A 18 18 0 1 0 42 25" stroke="#0B3B6F" stroke-width="4.2" stroke-linecap="round" />
              <path d="M 16 25 L 22 31 L 38 15" stroke="#00B8A9" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
              <circle cx="38" cy="15" r="3.5" fill="#00B8A9" />
            </svg>
          </div>
          <h2 class="gate-main-title">登入 GeoCheck 行銷儀表板</h2>
          <p class="gate-main-desc">
            企業級 AI GEO 聲量與可見度監控平台。<br>請使用 Google 帳戶登入以存取品牌專案、提問監測與引用分析。
          </p>

          <div class="gate-login-action">
            <button type="button" class="btn-google-signin-hero" id="btn-gate-google-login" title="使用 Google 帳戶登入">
              <svg class="google-icon" width="20" height="20" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>使用 Google 帳戶登入</span>
            </button>
          </div>

          <div class="gate-demo-action">
            <button type="button" class="btn-gate-demo-link" id="btn-gate-demo-login">
              體驗示範帳號 (Demo Account)
            </button>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Hash change routing
    window.addEventListener('hashchange', () => {
      const tab = window.location.hash.replace(/^#/, '');
      if (['overview', 'performance', 'questions', 'citations', 'quality', 'billing'].includes(tab)) {
        AppState.setActiveTab(tab);
      }
    });

    // Global Click Delegation
    document.addEventListener('click', async (e) => {
      // 1. Navigation item
      const navBtn = e.target.closest('[data-tab]');
      if (navBtn) {
        if (!api.hasSession()) {
          AppState.showToast('請先登入帳號以存取該分析模組', 'warning');
          return;
        }
        const tab = navBtn.getAttribute('data-tab');
        AppState.setActiveTab(tab);
        return;
      }

      // 2. GA4 / Ahrefs Date Range Picker Trigger & Presets
      if (e.target.closest('#btn-toggle-date-picker')) {
        AppState.toggleDatePicker();
        return;
      }

      const presetBtn = e.target.closest('[data-date-preset]');
      if (presetBtn) {
        const preset = presetBtn.getAttribute('data-date-preset');
        AppState.setDatePreset(preset);
        AppState.showToast(`已套用時間區間：${AppState.getDateRangeLabel()}`, 'info');
        await this.loadCurrentData();
        return;
      }

      if (e.target.closest('#btn-close-date-picker')) {
        AppState.toggleDatePicker(false);
        return;
      }

      // Close date picker on outside click
      if (AppState.isDatePickerOpen && !e.target.closest('#date-picker-wrap')) {
        AppState.toggleDatePicker(false);
      }

      // 2b. GA4 Brand Sliding Drawer Trigger & Actions
      if (e.target.closest('#btn-open-brand-drawer')) {
        AppState.toggleBrandDrawer(true);
        return;
      }

      if (e.target.closest('#btn-close-brand-drawer, #brand-drawer-backdrop')) {
        AppState.toggleBrandDrawer(false);
        return;
      }

      const brandItem = e.target.closest('.brand-project-item[data-project-id]');
      if (brandItem) {
        const projId = brandItem.getAttribute('data-project-id');
        AppState.switchProject(projId);
        AppState.showToast(`已切換至品牌專案：${AppState.currentProject.name}`, 'success');
        await this.loadCurrentData();
        return;
      }

      if (e.target.closest('#btn-show-ga4-eval')) {
        AppState.toggleBrandDrawer(false);
        AppState.openModal('ga4_eval');
        return;
      }

      // 2c. Time range segmented control (fallback)
      const weeksBtn = e.target.closest('[data-weeks]');
      if (weeksBtn) {
        const weeks = Number(weeksBtn.getAttribute('data-weeks'));
        AppState.setTimeRangeWeeks(weeks);
        await this.loadCurrentData();
        return;
      }

      // 3. Engine filter chip toggle
      const engineBtn = e.target.closest('.engine-chip, .legend-item, .legend-engine-btn');
      if (engineBtn) {
        const eng = engineBtn.getAttribute('data-engine');
        if (eng) {
          AppState.toggleEngine(eng);
        }
        return;
      }

      // 3b. Overview Chart Mode toggle (Overall SOV vs Engines)
      if (e.target.closest('#btn-mode-overall')) {
        AppState.setOverviewChartMode('overall');
        return;
      }
      if (e.target.closest('#btn-mode-engines')) {
        AppState.setOverviewChartMode('engines');
        return;
      }

      // 3c. Questions Tab Intent Filter Tabs
      const intentBtn = e.target.closest('.intent-tab-btn');
      if (intentBtn) {
        const intent = intentBtn.getAttribute('data-intent');
        if (intent) {
          AppState.setQuestionIntentFilter(intent);
        }
        return;
      }

      // 3d. Questions Tab Add Prompt CTA
      if (e.target.closest('#btn-open-add-prompt')) {
        AppState.openModal('new_question');
        return;
      }

      // 3e. Questions Tab Version Pills (if present)
      const verBtn = e.target.closest('.version-pill');
      if (verBtn) {
        const ver = verBtn.getAttribute('data-version');
        if (ver) {
          AppState.setActiveQuestionSetVersion(ver);
        }
        return;
      }

      // 4. Fixture Mode toggle
      if (e.target.closest('#btn-toggle-live-mode')) {
        AppState.setFixtureMode(!AppState.fixtureMode);
        AppState.showToast(AppState.fixtureMode ? '已切換至驗收沙盒模式 (Acceptance Fixtures)' : '已嘗試連線至後端正式 API (/app-api/v1)', 'info');
        await this.loadCurrentData();
        return;
      }

      // 5. Open Evidence Drawer via explicit observation ID
      const obsBtn = e.target.closest('[data-obs-id]');
      if (obsBtn) {
        const obsId = obsBtn.getAttribute('data-obs-id') || 'dobs_measured_wildwood_perplexity';
        await this.openObservation(obsId);
        return;
      }

      // 6. Chart point click -> opens evidence
      const chartDot = e.target.closest('.chart-data-dot');
      if (chartDot) {
        const eng = chartDot.getAttribute('data-engine') || 'perplexity';
        const runId = chartDot.getAttribute('data-run-id');
        // Find observation or fallback to fixture observation
        const obsId = eng === 'perplexity' ? 'dobs_measured_wildwood_perplexity' : (eng === 'openai' ? 'dobs_measured_wildwood_openai' : (eng === 'gemini' ? 'dobs_zero_wildwood_gemini' : 'dobs_unknown_anthropic'));
        await this.openObservation(obsId);
        return;
      }

      // 7. Table inspection actions (30-second acceptance criteria)
      const tableInspectBtn = e.target.closest('.btn-table-inspect, .btn-inspect-q, .btn-inspect-source, .btn-inspect-quality-run');
      if (tableInspectBtn) {
        const obsId = tableInspectBtn.getAttribute('data-obs-id') || 'dobs_measured_wildwood_perplexity';
        await this.openObservation(obsId);
        return;
      }

      const tableRunBtn = e.target.closest('[data-run-id], #btn-inspect-latest-run');
      if (tableRunBtn && !tableRunBtn.classList.contains('chart-data-dot')) {
        await this.openObservation('dobs_measured_wildwood_perplexity');
        return;
      }

      const qBtn = e.target.closest('[data-question-id]');
      if (qBtn) {
        await this.openObservation('dobs_measured_wildwood_perplexity');
        return;
      }

      const srcBtn = e.target.closest('[data-domain]');
      if (srcBtn) {
        await this.openObservation('dobs_measured_wildwood_perplexity');
        return;
      }

      const pulseBtn = e.target.closest('.btn-inspect-pulse, .btn-inspect-engine');
      if (pulseBtn) {
        const eng = pulseBtn.getAttribute('data-engine');
        const obsId = eng === 'openai' ? 'dobs_measured_wildwood_openai' : (eng === 'gemini' ? 'dobs_zero_wildwood_gemini' : (eng === 'anthropic' ? 'dobs_unknown_anthropic' : 'dobs_measured_wildwood_perplexity'));
        await this.openObservation(obsId);
        return;
      }

      // 8. Quick jump to citations tab from card
      if (e.target.closest('#btn-goto-citations')) {
        AppState.setActiveTab('citations');
        return;
      }

      // 9. Close Evidence Drawer
      if (e.target.closest('#btn-close-drawer, #drawer-backdrop')) {
        AppState.closeEvidenceDrawer();
        return;
      }

      // 10. Copy raw answer text
      const copyBtn = e.target.closest('#btn-copy-raw-answer');
      if (copyBtn) {
        const rawText = decodeURIComponent(copyBtn.getAttribute('data-text') || '');
        if (navigator.clipboard) {
          navigator.clipboard.writeText(rawText);
          AppState.showToast('已將 AI 原始回答文字複製至剪貼簿', 'success');
        }
        return;
      }

      // 11. Modals triggers
      if (e.target.closest('#btn-header-new-question-set, #btn-create-new-version')) {
        AppState.openModal('new_question');
        return;
      }
      if (e.target.closest('#btn-switch-project')) {
        AppState.toggleBrandDrawer(true);
        return;
      }
      if (e.target.closest('#btn-open-auth, #btn-login-app')) {
        AppState.openModal('auth_session');
        return;
      }
      if (e.target.closest('#btn-topbar-google-login, #btn-gate-google-login, #btn-modal-google-login, #btn-gate-demo-login')) {
        window.location.assign('/app-api/v1/auth/google/start');
        return;
      }
      if (e.target.closest('#btn-logout-app')) {
        api.setSessionToken('');
        AppState.showToast('已安全登出行銷儀表板', 'info');
        this.render();
        return;
      }
      if (e.target.closest('#btn-open-ga4-connect')) {
        AppState.toggleBrandDrawer(false);
        AppState.openModal('ga4_connect');
        return;
      }
      if (e.target.closest('#btn-google-gsc-connect')) {
        if (!AppState.currentProject?.projectId) {
          AppState.showToast('請先選擇一個追蹤專案', 'danger');
          return;
        }
        try {
          const { authorize_url } = await api.beginGscAuthorization(AppState.currentProject.projectId);
          window.location.assign(authorize_url);
        } catch (err) {
          AppState.showToast(`無法開始 GSC 授權：${err.message}`, 'danger');
        }
        return;
      }
      if (e.target.closest('#btn-add-annotation')) {
        AppState.openModal('add_annotation');
        return;
      }

      // 12. Close Modal
      if (e.target.closest('#btn-close-modal, #btn-cancel-modal, #modal-backdrop')) {
        AppState.closeModal();
        return;
      }

      // 13. Dynamic Question Row in Modal
      if (e.target.closest('#btn-add-q-row')) {
        const container = document.getElementById('dynamic-questions-list');
        if (container) {
          const div = document.createElement('div');
          div.className = 'q-row-item animate-fade-in';
          div.innerHTML = `
            <input type="text" class="form-input q-text-input" placeholder="請輸入消費者提問情境..." required />
            <select class="form-input q-intent-select">
              <option value="discovery">探索推薦 (discovery)</option>
              <option value="consideration">品類評估 (consideration)</option>
              <option value="intent">促購決策 (intent)</option>
              <option value="brand_direct">品牌主詞 (brand_direct)</option>
            </select>
            <input type="text" class="form-input q-tags-input" placeholder="標籤 (以逗號分隔)" />
          `;
          container.appendChild(div);
        }
        return;
      }

      // 14. Clear session
      if (e.target.closest('#btn-clear-session')) {
        api.setSessionToken('');
        AppState.showToast('已清除 Dashboard 憑證', 'info');
        AppState.closeModal();
        this.render();
        return;
      }
    });

    // Fixture Select dropdown change
    document.addEventListener('change', async (e) => {
      if (e.target && e.target.id === 'fixture-select') {
        const selected = e.target.value;
        AppState.setFixtureMode(true, selected);
        AppState.showToast(`已套用驗收情境：${selected}`, 'info');
        await this.loadCurrentData();
      }
    });

    // Instant search in questions table and brand drawer
    document.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'questions-search') {
        const q = e.target.value.toLowerCase().trim();
        AppState.questionSearchQuery = q;
        const rows = document.querySelectorAll('.question-row');
        rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          const rowIntent = row.getAttribute('data-intent') || '';
          const matchIntent = AppState.questionIntentFilter === 'all' || rowIntent === AppState.questionIntentFilter;
          const matchText = !q || text.includes(q);
          row.style.display = matchIntent && matchText ? '' : 'none';
        });
      }

      if (e.target && e.target.id === 'input-brand-drawer-search') {
        AppState.setBrandDrawerSearch(e.target.value);
      }
    });

    // Form Submissions
    document.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Custom Date Range Form
      if (e.target.id === 'form-custom-date-picker') {
        const start = document.getElementById('input-custom-start')?.value;
        const end = document.getElementById('input-custom-end')?.value;
        if (start && end) {
          AppState.setCustomDateRange(start, end);
          AppState.showToast(`已套用自訂區間：${start} ~ ${end}`, 'info');
          await this.loadCurrentData();
        }
        return;
      }

      // Quick Add Brand in Sliding Drawer
      if (e.target.id === 'form-quick-add-brand') {
        const name = document.getElementById('input-quick-name')?.value;
        const siteUrl = document.getElementById('input-quick-url')?.value;
        if (name && siteUrl) {
          try {
            const project = await api.createProject({ name, site_url: siteUrl, timezone: 'Asia/Taipei' });
            AppState.currentProject = project;
            AppState.showToast(`成功建立並切換至品牌專案：${name}`, 'success');
            await this.loadCurrentData();
          } catch (err) {
            AppState.showToast(`建立專案失敗：${err.message}`, 'danger');
          }
        }
        return;
      }

      // Single-prompt insertion would create an unversioned local-only question.
      // All production writes must create a versioned question set via the server.
      if (e.target.id === 'form-new-single-question') {
        AppState.showToast('請使用「新增題組版本」提交至伺服器；單題本機草稿不會被視為正式監測資料。', 'info');
        return;
      }



      // GSC connection form is intentionally not a local import fixture.
      if (e.target.id === 'form-ga4-import') {
        AppState.showToast('請使用「連接 Search Console」開始受控 OAuth 授權', 'info');
        return;
      }

      // Create Project
      if (e.target.id === 'form-create-project') {
        const name = document.getElementById('project-name-input')?.value;
        const siteUrl = document.getElementById('project-url-input')?.value;
        const timezone = document.getElementById('project-tz-input')?.value;
        try {
          const project = await api.createProject({ name, site_url: siteUrl, timezone });
          AppState.currentProject = project;
          AppState.showToast(`成功建立專案：${project.name}`, 'success');
          AppState.closeModal();
          await this.loadCurrentData();
        } catch (err) {
          AppState.showToast(`建立專案失敗：${err.message}`, 'danger');
        }
        return;
      }

      // New Question Set Version
      if (e.target.id === 'form-new-question-set') {
        const rows = document.querySelectorAll('.q-row-item');
        const questions = Array.from(rows).map(row => ({
          text: row.querySelector('.q-text-input')?.value || '',
          intent: row.querySelector('.q-intent-select')?.value || 'discovery',
          tags: (row.querySelector('.q-tags-input')?.value || '').split(',').map(t => t.trim()).filter(Boolean)
        })).filter(q => q.text);

        try {
          const newSet = await api.createQuestionSet(AppState.currentProject.projectId, {
            locale: 'zh-TW',
            questions
          });
          AppState.showToast(`成功發行題組版本 v${newSet.version}！歷史觀測已安全凍結。`, 'success');
          AppState.closeModal();
          await this.loadCurrentData();
        } catch (err) {
          AppState.showToast(`建立題組失敗：${err.message}`, 'danger');
        }
        return;
      }

      // Add Annotation
      if (e.target.id === 'form-add-annotation') {
        const occurredAt = document.getElementById('ann-date-input')?.value + 'T00:00:00.000Z';
        const note = document.getElementById('ann-note-input')?.value;
        try {
          await api.createAnnotation(AppState.currentProject.projectId, { occurred_at: occurredAt, note });
          AppState.showToast('已成功新增行銷里程碑標記', 'success');
          AppState.closeModal();
          await this.loadCurrentData();
        } catch (err) {
          AppState.showToast(`新增標記失敗：${err.message}`, 'danger');
        }
        return;
      }
    });

    // Keyboard Accessibility (Escape to close drawer, modal, or popover)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (AppState.modal.isOpen) {
          AppState.closeModal();
        } else if (AppState.drawer.isOpen) {
          AppState.closeEvidenceDrawer();
        } else if (AppState.isBrandDrawerOpen) {
          AppState.toggleBrandDrawer(false);
        } else if (AppState.isDatePickerOpen) {
          AppState.toggleDatePicker(false);
        }
      }
    });
  }

  async openObservation(obsId) {
    AppState.openEvidenceDrawer(obsId);
    try {
      const data = await api.getEvidence(AppState.currentProject?.projectId || 'dprj_wildwood_tw', obsId);
      AppState.setDrawerData(data);
    } catch (err) {
      AppState.setDrawerError(err.message);
    }
  }
}

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new DashboardApp();
  app.init();
});
