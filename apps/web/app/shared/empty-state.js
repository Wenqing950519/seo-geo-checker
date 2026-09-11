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
        建立第一個專案後，GeoCheck 會每週固定觀測四大 AI 搜尋模型，
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
        設定後，GeoCheck 每週固定用同一組題目觀測四大 AI 搜尋模型，
        跨期比較才有意義。
      </p>
      <button type="button" class="btn-primary" data-tab="questions">前往設定追蹤題目</button>
    </div>
  `;
}

export function renderDataUnavailableState() {
  return `
    <div class="view-empty-state animate-fade-in">
      <div class="empty-state-icon">${ICONS.quality}</div>
      <h2 class="empty-state-title">目前沒有可顯示的資料</h2>
      <p class="empty-state-body">
        這個專案還沒有已完成的觀測紀錄，或這次讀取沒有成功。
        這不代表你的品牌沒有 AI 能見度——只代表目前沒有證據可以呈現。
      </p>
      <button type="button" class="btn-secondary" id="btn-retry-load">重新載入</button>
    </div>
  `;
}
