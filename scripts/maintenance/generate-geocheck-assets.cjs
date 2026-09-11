const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const targetDir = path.resolve(__dirname, '../../../brand/logos/geocheck');
const markSvg = fs.readFileSync(path.join(targetDir, 'geocheck-mark.svg'), 'utf8');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage();

  // 1. Render Mark PNGs (1024, 512, 128, 64)
  for (const size of [1024, 512, 128, 64]) {
    await page.setViewportSize({ width: size, height: size });
    const renderedSvg = markSvg.replace('width="100%" height="100%"', `width="${size}" height="${size}"`);
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:transparent;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;">${renderedSvg}</body></html>`);
    const filename = size === 64 ? 'geocheck-favicon.png' : `geocheck-mark-${size}.png`;
    await page.screenshot({ path: path.join(targetDir, filename), omitBackground: true });
    console.log('Saved:', filename);
  }

  // 2. Render App Icon Master (512x512)
  const appIconHtml = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body {
        margin: 0;
        padding: 0;
        width: 512px;
        height: 512px;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon-box {
        width: 512px;
        height: 512px;
        background: radial-gradient(circle at 50% 25%, #0E2243 0%, #060E1C 80%);
        border-radius: 115px;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        box-shadow: inset 0 1px 2px rgba(255,255,255,0.18), 0 20px 50px rgba(0,0,0,0.6);
        border: 1px solid rgba(59, 130, 246, 0.3);
        box-sizing: border-box;
      }
      .icon-box::after {
        content: '';
        position: absolute;
        width: 260px;
        height: 260px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(59, 130, 246, 0.25) 0%, transparent 70%);
        pointer-events: none;
      }
      .mark {
        width: 330px;
        height: 330px;
        z-index: 2;
      }
    </style>
  </head>
  <body>
    <div class="icon-box">
      <div class="mark">
        ${markSvg.replace('width="100%" height="100%"', 'width="330" height="330"')}
      </div>
    </div>
  </body>
  </html>`;

  await page.setViewportSize({ width: 512, height: 512 });
  await page.setContent(appIconHtml);
  await page.screenshot({ path: path.join(targetDir, 'geocheck-app-icon-512.png'), omitBackground: true });
  console.log('Saved: geocheck-app-icon-512.png');

  await browser.close();
  console.log('All GeoCheck PNG assets generated successfully!');
})().catch(e => { console.error(e); process.exit(1); });
