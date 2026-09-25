// Platform code panels: tabbed samples ([data-tabs]) and a copy button
// ([data-copy]) that copies whichever panel is showing.
(function () {
  const toast = document.getElementById('toast');
  let toastTimer;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }
  window.showPlatformToast = showToast;

  document.querySelectorAll('[data-tabs]').forEach((panel) => {
    const tabs = [...panel.querySelectorAll('[role="tab"]')];
    function select(tab) {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const target = document.getElementById(t.getAttribute('aria-controls'));
        if (target) target.hidden = !on;
      });
    }
    tabs.forEach((tab, i) => {
      tab.tabIndex = tab.getAttribute('aria-selected') === 'true' ? 0 : -1;
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        select(next);
        next.focus();
      });
    });
    panel.querySelector('[data-copy]')?.addEventListener('click', () => {
      const visible = [...panel.querySelectorAll('pre')].find((pre) => !pre.hidden);
      if (!visible) return;
      navigator.clipboard.writeText(visible.innerText).then(
        () => showToast('已複製到剪貼簿'),
        () => showToast('無法存取剪貼簿，請手動選取複製')
      );
    });
  });
})();
