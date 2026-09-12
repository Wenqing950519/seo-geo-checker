// Empty and unavailable states for the GeoCheck Product A Dashboard.
//
// A spinner means "data is on its way". Rendering one when nothing is coming —
// a new account with no Project, or a request that already failed — leaves the
// Dashboard spinning forever and reads as a broken product. These states say
// what actually happened and what the user can do next.

import { ICONS } from './icons.js';

export function renderNoProjectState() {
  return `
    <div class="view-empty-state animate-fade-in">
      <div class="empty-state-icon">${ICONS.overview}</div>
      <h2 class="empty-state-title">還沒有追蹤中的品牌</h2>
      <p class="empty-state-body">
        建立第一個專案後，LS-Labs 會每週固定觀測四大 AI 搜尋模型，
        記錄你的品牌是否被提及、官方網站是否被引用。
      </p>
      <button type="button" class="btn-primary" id="btn-create-first-project">
        建立第一個專案
      </button>
    </div>
  `;
}

export function renderNoQuestionsState() {
  return `
    <div class="view-empty-state animate-fade-in">
      <div class="empty-state-icon">${ICONS.questions}</div>
      <h2 class="empty-state-title">專案建好了，還差追蹤題目</h2>
      <p class="empty-state-body">
        題目就是你想知道「AI 被問到這件事時，會不會提到我」的問題。
        設定後，LS-Labs 每週固定用同一組題目觀測四大 AI 搜尋模型，
        跨期比較才有意義。
      </p>
      <button type="button" class="btn-primary" data-tab="questions">前往設定追蹤題目</button>
    </div>
  `;
}

// The question set exists, the schedule has simply not produced a result yet.
// This is a normal day-one state, not a failure, and must not read like one.
export function renderAwaitingFirstRunState() {
  return `
    <div class="view-empty-state animate-fade-in">
      <div class="empty-state-icon">${ICONS.performance}</div>
      <h2 class="empty-state-title">題目已設定，等待首次觀測</h2>
      <p class="empty-state-body">
        這組題目還沒有完成的觀測紀錄。首次觀測完成前，這裡不會顯示任何比例或趨勢；
        排程時間可在頁首的「下次追蹤」確認。
      </p>
      <button type="button" class="btn-secondary" data-tab="questions">檢視追蹤題目</button>
    </div>
  `;
}

// Observations exist, but none fall inside the selected window. Widening the
// range is the fix; nothing is broken and nothing needs retrying.
export function renderNoDataInRangeState(weeks) {
  const range = Number.isFinite(weeks) ? `最近 ${weeks} 週` : '目前區間';
  return `
    <div class="view-empty-state animate-fade-in">
      <div class="empty-state-icon">${ICONS.performance}</div>
      <h2 class="empty-state-title">${range}沒有觀測紀錄</h2>
      <p class="empty-state-body">
        這個專案有觀測資料，但不在目前選取的時間區間內。放寬時間範圍後再看一次；
        這裡不會把空區間補成 0。
      </p>
    </div>
  `;
}

// The request itself failed. Say so plainly: silently reusing the "no data"
// copy would present an outage as a normal empty account.
export function renderLoadFailedState(message) {
  const detail = message ? `<code class="empty-state-detail">${message}</code>` : '';
  return `
    <div class="view-empty-state animate-fade-in">
      <div class="empty-state-icon">${ICONS.quality}</div>
      <h2 class="empty-state-title">資料讀取失敗</h2>
      <p class="empty-state-body">
        這一次沒有成功取得資料，因此畫面不顯示任何數字。
        這與「沒有觀測結果」不同：你的已有紀錄並未消失。
      </p>
      ${detail}
      <button type="button" class="btn-secondary" id="btn-retry-load">重新載入</button>
    </div>
  `;
}

export function renderDataUnavailableState() {
  return `
    <div class="view-empty-state animate-fade-in">
      <div class="empty-state-icon">${ICONS.quality}</div>
      <h2 class="empty-state-title">目前沒有可顯示的資料</h2>
      <p class="empty-state-body">
        這個專案還沒有已完成的觀測紀錄。
        這不代表你的品牌沒有 AI 能見度——只代表目前沒有證據可以呈現。
      </p>
      <button type="button" class="btn-secondary" id="btn-retry-load">重新載入</button>
    </div>
  `;
}
