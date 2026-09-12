// Auth, Onboarding & Management Modals for GeoCheck Product A Dashboard
// Implements Dashboard session (gds_) management & Project/Question Set creation

import { ICONS } from '../shared/icons.js';
import { api } from '../shared/api.js';
import { AppState } from '../shared/state.js';

export function renderModals() {
  const { isOpen, type, data } = AppState.modal;

  if (!isOpen) {
    return `<div id="modal-root" class="modal-root closed" aria-hidden="true"></div>`;
  }

  return `
    <div id="modal-root" class="modal-root open" role="dialog" aria-modal="true">
      <div class="modal-backdrop" id="modal-backdrop"></div>
      
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">${getModalTitle(type)}</h3>
          <button type="button" class="btn-modal-close" id="btn-close-modal" aria-label="關閉對話框">
            ${ICONS.x}
          </button>
        </div>

        <div class="modal-body">
          ${renderModalBody(type, data)}
        </div>
      </div>
    </div>
  `;
}

function getModalTitle(type) {
  switch (type) {
    case 'auth_session':
      return 'Google 帳戶登入';
    case 'create_project':
      return '新增追蹤品牌專案 (Create Project)';
    case 'new_question':
      return '新增 AI 監測提問 (Add Tracked Prompt)';
    case 'new_question_set':
      return '題組版本管理 (Question Sets)';
    case 'add_annotation':
      return '新增行銷里程碑註記 (Add Annotation)';
    case 'ga4_eval':
      return 'Google Analytics 4 (GA4) 服務串接評估報告';
    case 'ga4_connect':
      return '連接 Google Search Console 與匯入搜尋趨勢';
    default:
      return '管理操作';
  }
}

function renderModalBody(type, data) {
  if (type === 'auth_session') {
    const currentSession = api.getSessionToken();
    if (currentSession) {
      return `
        <div class="modal-form">
          <p class="modal-intro">
            GeoCheck Track 支援 Google 帳戶單一登入，保障品牌專案與觀測資料安全。
          </p>
          
          <div class="current-session-info" style="margin-bottom:20px; padding:16px; background:#F8FAFD; border:1px solid var(--gc-border); border-radius:8px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
              <span style="width:8px; height:8px; border-radius:50%; background:var(--gc-accent);"></span>
              <strong style="color:var(--gc-navy); font-size:0.9rem;">Google 帳號已連線</strong>
            </div>
            <div style="font-size:0.82rem; color:var(--gc-muted); margin-bottom:12px;">
              已認證之行銷會話：<code class="font-mono" style="background:#FFFFFF; padding:2px 6px; border-radius:4px; border:1px solid #E2E8F0;">${currentSession.slice(0, 16)}...</code>
            </div>
            <button type="button" class="btn-secondary" id="btn-clear-session" style="color:var(--gc-danger); border-color:#FCA5A5;">
              登出 Google 帳號
            </button>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" id="btn-cancel-modal">關閉</button>
          </div>
        </div>
      `;
    }

    return `
      <div class="modal-form">
        <p class="modal-intro">
          GeoCheck Track 支援 Google 帳戶單一登入，保障品牌專案與觀測資料安全。
        </p>

        <div style="display:flex; flex-direction:column; align-items:center; padding:16px 0 8px;">
          <button type="button" class="btn-google-signin-hero" id="btn-modal-google-login">
            <svg class="google-icon" width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            <span>使用 Google 帳戶登入</span>
          </button>
        </div>

        <div class="modal-actions" style="margin-top:16px;">
          <button type="button" class="btn-secondary" id="btn-cancel-modal">關閉</button>
        </div>
      </div>
    `;
  }

  if (type === 'create_project') {
    return `
      <form id="form-create-project" class="modal-form">
        <p class="modal-intro">建立新的品牌 AI 可見度追蹤專案。每週固定週期觀測四大主流搜尋模型。</p>

        <div class="form-group">
          <label for="project-name-input">品牌或企業名稱</label>
          <input type="text" id="project-name-input" class="form-input" placeholder="例如：饗食天堂、WILDWOOD" required />
        </div>

        <div class="form-group">
          <label for="project-url-input">官方主網站網址 (Site URL)</label>
          <input type="url" id="project-url-input" class="form-input" placeholder="https://example.com" required />
          <span class="form-hint">用於驗證 AI 回答之第一方官網來源引用 (1st-Party Official Citation)。</span>
        </div>

        <div class="form-group">
          <label for="project-tz-input">時區 (Timezone)</label>
          <select id="project-tz-input" class="form-input">
            <option value="Asia/Taipei" selected>Asia/Taipei (UTC+8)</option>
            <option value="Asia/Tokyo">Asia/Tokyo (UTC+9)</option>
            <option value="America/New_York">America/New_York (UTC-5)</option>
          </select>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="btn-cancel-modal">取消</button>
          <button type="submit" class="btn-primary">確認建立專案</button>
        </div>
      </form>
    `;
  }

  if (type === 'new_question_set') {
    const currentQuestions = AppState.currentQuestionSets[0]?.questions || [];
    return `
      <form id="form-new-question-set" class="modal-form">
        <div class="modal-notice-box">
          ${ICONS.info}
          <div>
            <strong>不可變題組版本原則 (DASHBOARD_UI_SPEC)：</strong>
            <p>送出後將建立新版本題組 (v${(AppState.currentQuestionSets[0]?.version || 1) + 1})。歷史週次之觀測數據將嚴格凍結保留，下一定時排程起將採用此題組。</p>
          </div>
        </div>

        <div class="form-group">
          <label>語系 (Locale)</label>
          <input type="text" id="qs-locale-input" class="form-input font-mono" value="zh-TW" readonly />
        </div>

        <div class="form-group">
          <div class="form-label-bar">
            <label>追蹤提問清單 (最多 50 題)</label>
            <button type="button" class="btn-text-action" id="btn-add-q-row">+ 新增提問項目</button>
          </div>
          
          <div id="dynamic-questions-list" class="dynamic-questions-list">
            ${currentQuestions.map((q, idx) => `
              <div class="q-row-item">
                <input type="text" class="form-input q-text-input" value="${q.text}" placeholder="請輸入消費者提問情境..." required />
                <select class="form-input q-intent-select">
                  <option value="discovery" ${q.intent === 'discovery' ? 'selected' : ''}>探索推薦 (discovery)</option>
                  <option value="consideration" ${q.intent === 'consideration' ? 'selected' : ''}>品類評估 (consideration)</option>
                  <option value="intent" ${q.intent === 'intent' ? 'selected' : ''}>促購決策 (intent)</option>
                  <option value="brand_direct" ${q.intent === 'brand_direct' ? 'selected' : ''}>品牌主詞 (brand_direct)</option>
                </select>
                <input type="text" class="form-input q-tags-input" value="${(q.tags || []).join(', ')}" placeholder="標籤 (以逗號分隔)" />
              </div>
            `).join('')}
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="btn-cancel-modal">取消</button>
          <button type="submit" class="btn-primary">確認發行新題組版本</button>
        </div>
      </form>
    `;
  }

  if (type === 'add_annotation') {
    const todayStr = new Date().toISOString().slice(0, 10);
    return `
      <form id="form-add-annotation" class="modal-form">
        <p class="modal-intro">為趨勢圖表記錄真實營運或行銷操作事件（如門市開幕、發布白皮書、改寫官方網站結構）。</p>

        <div class="form-group">
          <label for="ann-date-input">事件發生日期</label>
          <input type="date" id="ann-date-input" class="form-input" value="${todayStr}" required />
        </div>

        <div class="form-group">
          <label for="ann-note-input">操作內容備註 (1 ~ 500 字)</label>
          <textarea id="ann-note-input" class="form-input form-textarea" rows="3" placeholder="例如：新版官網正式上線，優化結構化資料與菜單..." required></textarea>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="btn-cancel-modal">取消</button>
          <button type="submit" class="btn-primary">保存標記</button>
        </div>
      </form>
    `;
  }

  if (type === 'new_question') {
    return `
      <form id="form-new-single-question" class="modal-form">
        <p class="modal-intro">新增行銷監測提問。加入後每週定時觀測四大主流 AI 搜尋模型在該提問下的品牌推薦表現。</p>

        <div class="form-group">
          <label for="input-prompt-text">消費者搜尋 / AI 提問內容</label>
          <textarea id="input-prompt-text" class="form-input form-textarea" rows="3" placeholder="例如：台北信義區家庭聚餐推薦哪一家高檔吃到飽？" required></textarea>
          <span class="form-hint">建議模擬真實消費者會輸入給 ChatGPT、Gemini、Perplexity 的完整自然語言提問句。</span>
        </div>

        <div class="form-group">
          <label for="select-prompt-intent">行銷決策意圖 (Marketing Intent)</label>
          <select id="select-prompt-intent" class="form-input">
            <option value="discovery" selected>探索推薦 (Discovery) — 使用者尚未有特定口袋名單，詢問品類通用推薦</option>
            <option value="consideration">品類評估 (Consideration) — 比較特定條件、價位、口碑或規格</option>
            <option value="intent">促購決策 (Intent) — 詢問地點、訂位方式、優惠、最新菜單等即將消費情境</option>
            <option value="brand_direct">品牌直達 (Brand Direct) — 直接以品牌名稱或產品為主詞的相關提問</option>
          </select>
        </div>

        <div class="form-group">
          <label for="input-prompt-tags">情境分類標籤</label>
          <input type="text" id="input-prompt-tags" class="form-input" placeholder="以逗號分隔，例如：台北, 吃到飽, 家庭聚餐" />
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="btn-cancel-modal">取消</button>
          <button type="submit" class="btn-primary">加入每週監測清單</button>
        </div>
      </form>
    `;
  }

  if (type === 'ga4_eval') {
    return `
      <div class="modal-eval-content">
        <div class="eval-section">
          <h4>Google Search Console 資料邊界</h4>
          <p>此連線僅讀取目前 Project 對應網站的 Google 搜尋成效。它不建立專案、不掃描 GA4 資產，也不將資料併入 AI 可見度分數。</p>
        </div>

        <div class="eval-section">
          <h4>保存與撤銷</h4>
          <ul class="eval-list">
            <li>初次最多回填 90 天；每日彙總資料最多保存 13 個月。</li>
            <li>解除連線會立即刪除該 Project 的 refresh token 與已匯入 GSC 資料。</li>
          </ul>
        </div>

        <div class="eval-section">
          <h4>權限</h4>
          <ul class="eval-list">
            <li>僅請求 <code>webmasters.readonly</code>；refresh token 只加密保存於伺服端。</li>
            <li>Google 帳號 email 必須與目前已啟用的 Dashboard 帳號一致。</li>
          </ul>
        </div>

        <div class="eval-section">
          <h4>可用性</h4>
          <p>在 Google scope verification 與正式部署 smoke 完成前，這個入口會維持 feature-gated，不能視為對外可用。</p>
        </div>

        <div class="modal-actions" style="margin-top: 20px;">
          <button type="button" class="btn-primary" id="btn-cancel-modal">確認理解</button>
        </div>
      </div>
    `;
  }

  if (type === 'ga4_connect') {
    return `
      <form id="form-ga4-import" class="modal-form">
        <div class="modal-intro" style="display:flex; align-items:center; gap:12px; background:#F8FAFD; border:1px solid #E2E8F0; border-radius:8px; padding:12px 16px; margin-bottom:18px;">
          <div style="width:36px; height:36px; border-radius:50%; background:#FFFFFF; border:1px solid #CBD5E1; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
          </div>
          <div>
            <div style="font-weight:700; color:var(--gc-navy); font-size:0.88rem;">Google Search Console 授權連線</div>
            <div style="font-size:0.78rem; color:var(--gc-muted);">僅請求 Search Console 唯讀權限</div>
          </div>
        </div>

        <p style="font-size:0.86rem; color:#475569; margin-bottom:14px; line-height:1.5;">
          將驗證 Google email 與目前 Dashboard 帳號一致，並只接受可匹配此 Project 網域的 Search Console property。
        </p>

        <div class="form-group">
          <div class="ga4-property-item">
            <div class="ga4-prop-info">
              <div class="ga4-prop-name">尚未連接任何 property</div>
              <div class="ga4-prop-meta">不顯示 fixture 或他人網站。完成 Google 授權後，伺服端會檢查 Project 網域相符性。</div>
            </div>
          </div>
        </div>

        <div style="background:#F1F5F9; border-radius:6px; padding:10px 14px; font-size:0.78rem; color:#64748B; margin-bottom:18px;">
          僅請求 Search Console 唯讀權限。每日點擊、曝光、CTR、平均排序獨立保存，不會併入 AI 可見度分數；可隨時解除連線並刪除匯入資料。
        </div>

        <div class="modal-actions">
          <button type="button" class="btn-secondary" id="btn-cancel-modal">取消</button>
          <button type="button" class="btn-primary" id="btn-google-gsc-connect">使用 Google 連接 Search Console</button>
        </div>
      </form>
    `;
  }

  return `<div>未知操作類型</div>`;
}
