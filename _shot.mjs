import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8899';
const OUT = 'C:/Users/eason/Downloads';

const JOBS = [
  ['藍新補件_01_官方首頁_服務介紹與價格入口.jpg', '/home.html', 'full'],
  ['藍新補件_02_服務價格與收費模式_完整頁面.jpg', '/pricing.html', 'full'],
  ['藍新補件_03_訂閱方案與售價_NT330每月.jpg', '/pricing.html', [1]],
  ['藍新補件_04_收費模式總覽_計費週期與自動續訂.jpg', '/pricing.html', [2]],
  ['藍新補件_05_交易流程與商店客服資訊.jpg', '/pricing.html', [3, 4]],
  ['藍新補件_06_服務條款.jpg', '/terms.html', 'full'],
  ['藍新補件_07_退款政策.jpg', '/refund.html', 'full'],
  ['藍新補件_08_隱私權政策.jpg', '/privacy.html', 'full'],
];

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

for (const [file, path, mode] of JOBS) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.querySelectorAll('.reveal, .fade-item').forEach(el => {
      el.classList.add('in', 'visible', 'show');
      el.style.opacity = '1';
      el.style.transform = 'none';
    });
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(900);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  const opts = { path: `${OUT}/${file}`, type: 'jpeg', quality: 82, fullPage: true };

  if (Array.isArray(mode)) {
    const secs = await page.$$('section');
    const boxes = [];
    for (const i of mode) boxes.push(await secs[i].boundingBox());
    const x = Math.min(...boxes.map(b => b.x));
    const y = Math.min(...boxes.map(b => b.y));
    const r = Math.max(...boxes.map(b => b.x + b.width));
    const bt = Math.max(...boxes.map(b => b.y + b.height));
    opts.clip = { x, y, width: r - x, height: bt - y };
  }
  await page.screenshot(opts);
  console.log('ok', file);
}

await browser.close();
