// This adapter belongs only to geocheck-web Pages, not the Developer API's
// shared asset binding. API/report Workers keep their existing routes.
const GONE_HTML = '<!doctype html><html lang="zh-Hant-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>頁面已移除｜LS-Labs GeoCheck</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem"><h1>這個頁面已移除</h1><p><a href="/">回到 GeoCheck 首頁</a></p></body></html>';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    if (!['GET','HEAD'].includes(request.method) || /^\/(?:api|app-api|report|v1|internal)(?:\/|$)/.test(pathname)) {
      return env.ASSETS.fetch(request);
    }
    if (/^\/research\/xinyi-dining-wave0(?:\.html|\/index\.html|\/)?$/.test(pathname)) {
      return Response.redirect('https://lslabs.tw/blog/', 302);
    }
    if (/^\/brand(?:\.html|\/)?$/.test(pathname)) {
      return Response.redirect('https://lslabs.tw/brand/', 308);
    }
    const platformPaths = {
      '/developers':'/', '/developers/':'/', '/developers.html':'/',
      '/developers/docs':'/docs', '/developers/docs/':'/docs', '/developers-docs':'/docs',
      '/developers/docs.html':'/docs', '/docs':'/docs', '/docs/':'/docs',
      '/developers-console':'/console', '/developers-console.html':'/console',
      '/developers/console':'/console', '/developers/console/':'/console',
      '/console':'/console', '/console/':'/console'
    };
    if (Object.hasOwn(platformPaths, pathname)) {
      return Response.redirect('https://platform.lslabs.tw' + platformPaths[pathname] + url.search, 308);
    }
    if (pathname === '/app' || pathname.startsWith('/app/')) {
      return Response.redirect('https://app.lslabs.tw' + (pathname.slice(4) || '/') + url.search, 308);
    }
    if (url.hostname === 'geocheck.lisheng.cv') {
      url.hostname = 'geocheck.lslabs.tw';
      url.protocol = 'https:';
      return Response.redirect(url.href, 308);
    }
    // Retired pages (LSL-D-001 demo; 2026-10-19 removal of the Track sales pages)
    // answer 410 so crawlers drop them instead of retrying a 404.
    if (/^\/(?:demo|pricing|refund)(?:\/|\.html)?$/.test(pathname)) {
      return new Response(request.method === 'HEAD' ? null : GONE_HTML, {
        status: 410,
        headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
