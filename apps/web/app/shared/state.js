// Reactive Application State for GeoCheck Product A Dashboard

class DashboardState {
  constructor() {
    this.listeners = new Set();
    
    // Core State
    this.activeTab = 'overview'; // 'overview' | 'performance' | 'questions' | 'citations' | 'quality'
    this.timeRangeWeeks = 12; // 4 | 12 | 26
    this.activeEngines = new Set(['openai', 'gemini', 'anthropic', 'perplexity']);
    this.tagFilter = 'all';
    this.searchQuery = '';

    // Date Range Picker State (GA4 / Ahrefs Style)
    this.datePreset = '30d'; // '7d' | '14d' | '30d' | '90d' | '180d' | 'all' | 'custom'
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    this.customStartDate = thirtyDaysAgo.toISOString().slice(0, 10);
    this.customEndDate = today.toISOString().slice(0, 10);
    this.isDatePickerOpen = false;

    // Brand Sliding Drawer State (GA4 Multi-site Navigation)
    this.isBrandDrawerOpen = false;
    this.brandDrawerSearch = '';

    // Projects & Data
    this.currentProject = null;
    this.projectsList = [
      {
        projectId: 'dprj_wildwood_tw',
        name: 'WILDWOOD 原木燒烤牛排',
        siteUrl: 'https://wildwood.com.tw',
        questionsCount: 12,
        sov: '75.0%',
        status: 'active'
      },
      {
        projectId: 'dprj_eatogether_tw',
        name: '饗食天堂 (EATOGETHER)',
        siteUrl: 'https://eatogether.com.tw',
        questionsCount: 16,
        sov: '68.8%',
        status: 'active'
      },
      {
        projectId: 'dprj_lepalais_tw',
        name: '君品酒店 頤宮中餐廳 Le Palais',
        siteUrl: 'https://palaisdechinehotel.com',
        questionsCount: 10,
        sov: '80.0%',
        status: 'active'
      }
    ];
    this.currentOverview = null;
    this.currentPerformance = null;
    this.currentQuestionSets = [];
    this.currentCitations = null;
    this.currentDataQuality = null;
    this.currentEntitlement = null;

    // Fixtures are opt-in acceptance evidence, never a production data fallback.
    this.fixtureMode = false;
    this.currentFixtureKey = 'twelve_weeks'; // 'baseline' | 'twelve_weeks' | 'partial_run' | 'failed_run' | 'version_change'

    // Universal Evidence Drawer
    this.drawer = {
      isOpen: false,
      observationId: null,
      data: null,
      loading: false,
      error: null
    };

    // View-specific Filters & Controls
    this.overviewChartMode = 'overall'; // 'overall' | 'engines'
    this.activeQuestionSetVersion = null; // null means latest active
    this.questionIntentFilter = 'all'; // 'all' | 'discovery' | 'consideration' | 'intent' | 'brand_direct'
    this.questionSearchQuery = '';

    // Modals
    this.modal = {
      isOpen: false,
      type: null, // 'new_question' | 'create_project' | 'auth_session' | 'add_annotation'
      data: null
    };

    // UI Loading & Toast
    this.loading = false;
    this.toast = null;
  }

  // Date Range Controls
  setDatePreset(preset) {
    this.datePreset = preset;
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    let days = 30;
    if (preset === '7d') days = 7;
    else if (preset === '14d') days = 14;
    else if (preset === '30d') days = 30;
    else if (preset === '90d') days = 90;
    else if (preset === '180d') days = 180;
    else if (preset === 'all') days = 365;

    const startD = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    this.customStartDate = startD.toISOString().slice(0, 10);
    this.customEndDate = end;
    this.isDatePickerOpen = false;

    // Map to timeRangeWeeks for backward-compatible API calls
    if (days <= 28) this.timeRangeWeeks = 4;
    else if (days <= 90) this.timeRangeWeeks = 12;
    else this.timeRangeWeeks = 26;

    this.notify();
  }

  setCustomDateRange(startDate, endDate) {
    this.datePreset = 'custom';
    this.customStartDate = startDate;
    this.customEndDate = endDate;
    this.isDatePickerOpen = false;

    const diffMs = new Date(endDate).getTime() - new Date(startDate).getTime();
    const days = Math.max(1, Math.round(diffMs / (24 * 60 * 60 * 1000)));
    if (days <= 28) this.timeRangeWeeks = 4;
    else if (days <= 90) this.timeRangeWeeks = 12;
    else this.timeRangeWeeks = 26;

    this.notify();
  }

  toggleDatePicker(forceOpen) {
    this.isDatePickerOpen = typeof forceOpen === 'boolean' ? forceOpen : !this.isDatePickerOpen;
    this.notify();
  }

  getDateRangeLabel() {
    switch (this.datePreset) {
      case '7d': return '過去 7 天 (1 週)';
      case '14d': return '過去 14 天 (2 週)';
      case '30d': return '過去 30 天 (1 個月)';
      case '90d': return '過去 90 天 (1 季)';
      case '180d': return '過去 180 天 (半年)';
      case 'all': return '全部監測時間';
      case 'custom': return `${this.customStartDate} ~ ${this.customEndDate}`;
      default: return '過去 30 天 (1 個月)';
    }
  }

  // Brand Sliding Drawer Controls
  toggleBrandDrawer(forceOpen) {
    this.isBrandDrawerOpen = typeof forceOpen === 'boolean' ? forceOpen : !this.isBrandDrawerOpen;
    this.notify();
  }

  setBrandDrawerSearch(query) {
    this.brandDrawerSearch = (query || '').trim().toLowerCase();
    this.notify();
  }

  switchProject(projectId) {
    const proj = this.projectsList.find(p => p.projectId === projectId);
    if (proj) {
      this.currentProject = {
        projectId: proj.projectId,
        name: proj.name,
        siteUrl: proj.siteUrl,
        timezone: 'Asia/Taipei',
        cadence: 'weekly',
        enabled: true,
        createdAt: '2026-06-15T00:00:00.000Z',
        nextRunAt: '2026-09-17T02:00:00.000Z'
      };
      this.isBrandDrawerOpen = false;
      this.notify();
    }
  }

  addBrandProject({ name, siteUrl }) {
    const newProj = {
      projectId: `dprj_${Date.now().toString(36)}`,
      name,
      siteUrl,
      questionsCount: 4,
      sov: '0.0%',
      status: 'active'
    };
    this.projectsList.unshift(newProj);
    this.switchProject(newProj.projectId);
  }

  setOverviewChartMode(mode) {
    if (['overall', 'engines'].includes(mode) && this.overviewChartMode !== mode) {
      this.overviewChartMode = mode;
      this.notify();
    }
  }

  setActiveQuestionSetVersion(version) {
    this.activeQuestionSetVersion = Number(version);
    this.notify();
  }

  setQuestionIntentFilter(intent) {
    this.questionIntentFilter = intent;
    this.notify();
  }

  setQuestionSearchQuery(query) {
    this.questionSearchQuery = (query || '').trim().toLowerCase();
    this.notify();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    for (const listener of this.listeners) {
      try {
        listener(this);
      } catch (err) {
        console.error('[DashboardState] Listener error:', err);
      }
    }
  }

  setActiveTab(tab) {
    if (this.activeTab !== tab) {
      this.activeTab = tab;
      window.location.hash = tab;
      this.notify();
    }
  }

  setTimeRangeWeeks(weeks) {
    const num = Number(weeks);
    if ([4, 12, 26].includes(num) && this.timeRangeWeeks !== num) {
      this.timeRangeWeeks = num;
      this.notify();
    }
  }

  toggleEngine(engineId) {
    if (this.activeEngines.has(engineId)) {
      if (this.activeEngines.size > 1) { // Keep at least 1 engine active
        this.activeEngines.delete(engineId);
      }
    } else {
      this.activeEngines.add(engineId);
    }
    this.notify();
  }

  setFixtureMode(enabled, fixtureKey = 'twelve_weeks') {
    this.fixtureMode = Boolean(enabled);
    if (fixtureKey) this.currentFixtureKey = fixtureKey;
    this.notify();
  }

  openEvidenceDrawer(observationId, preloadedData = null) {
    this.drawer = {
      isOpen: true,
      observationId,
      data: preloadedData,
      loading: !preloadedData,
      error: null
    };
    this.notify();
  }

  closeEvidenceDrawer() {
    this.drawer.isOpen = false;
    this.notify();
  }

  setDrawerData(data) {
    this.drawer.data = data;
    this.drawer.loading = false;
    this.notify();
  }

  setDrawerError(error) {
    this.drawer.error = error;
    this.drawer.loading = false;
    this.notify();
  }

  openModal(type, data = null) {
    this.modal = {
      isOpen: true,
      type,
      data
    };
    this.notify();
  }

  closeModal() {
    this.modal.isOpen = false;
    this.notify();
  }

  showToast(message, type = 'info', duration = 3000) {
    this.toast = { message, type, id: Date.now() };
    this.notify();
    setTimeout(() => {
      if (this.toast && this.toast.id === this.toast?.id) {
        this.toast = null;
        this.notify();
      }
    }, duration);
  }
}

export const AppState = new DashboardState();
