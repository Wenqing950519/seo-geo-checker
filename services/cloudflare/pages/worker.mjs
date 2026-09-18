// This adapter belongs only to geocheck-web Pages, not the Developer API's
// shared asset binding. API/report Workers keep their existing routes.
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
    return env.ASSETS.fetch(request);
  }
};
