export function renderBilling(entitlement = {}) {
  const paid = entitlement.plan === 'paid_beta';
  const status = entitlement.status || 'active';
  return `
    <section class="dashboard-section" aria-labelledby="billing-title">
      <div class="section-header"><div><p class="eyebrow">方案與訂閱</p><h1 id="billing-title">${paid ? 'Paid Beta' : 'Free'} 方案</h1><p class="section-subtitle">方案只控制 Project 與更新權益；觀測證據、歷史與資料品質保持可見。</p></div></div>
      <div class="overview-kpi-grid">
        <article class="kpi-card"><span class="kpi-label">月費</span><strong class="kpi-value font-number">${paid ? 'TWD 330' : 'TWD 0'}</strong><span class="kpi-context">${paid ? '訂閱週年月' : '免費方案'}</span></article>
        <article class="kpi-card"><span class="kpi-label">Active Projects</span><strong class="kpi-value font-number">${entitlement.active_project_limit || 2}</strong><span class="kpi-context">每個每週自動監測</span></article>
        <article class="kpi-card"><span class="kpi-label">立即更新</span><strong class="kpi-value font-number">${entitlement.manual_run_limit || 0}</strong><span class="kpi-context">每期共享；每日最多 ${entitlement.daily_manual_limit || 0} 次</span></article>
      </div>
      <article class="data-table-card" style="margin-top:20px"><div class="table-card-header"><h2>訂閱狀態</h2><span class="status-badge ${status === 'active' ? 'status-complete' : 'status-partial'}">${status}</span></div><div class="table-empty-state"><p>手動額度於每個訂閱週期重置且不累積。只有四引擎完整成功才會扣除；partial 或 failed 保留資料品質紀錄但不扣額度。</p><p>取消後權益保留至期末；續扣失敗有 3 天寬限期，期滿後所有 Project 僅能唯讀。</p><button type="button" class="btn-primary" id="btn-billing-upgrade" ${paid ? 'disabled' : ''}>${paid ? '目前為 Paid Beta' : '以 Sandbox 升級'}</button></div></article>
    </section>`;
}
