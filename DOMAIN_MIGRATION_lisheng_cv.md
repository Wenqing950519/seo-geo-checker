# GEOCheck Domain Migration Plan

## Final URL Structure

Primary GEOCheck product URL:

```text
https://geocheck.lisheng.cv/
```

Personal / portfolio root:

```text
https://lisheng.cv/
```

Legacy URL, redirect only:

```text
https://geocheck.tungowo.com/
```

## Why This Structure

- `lisheng.cv` is the long-term domain that will keep being renewed.
- `geocheck.lisheng.cv` keeps GEOCheck as a clear product under the personal brand.
- `tungowo.com` should not remain the canonical domain because it will expire after the current term.
- Keeping GEOCheck on a subdomain leaves `lisheng.cv` free for portfolio, consulting identity, case studies, and future products.

## DNS Setup

Create these DNS records at the DNS provider for `lisheng.cv`.

```text
Type: CNAME
Name: geocheck
Target: your hosting provider target
Proxy/CDN: depends on hosting provider
```

Examples:

```text
Vercel: cname.vercel-dns.com
Cloudflare Pages: your-project.pages.dev
Render/Fly/Railway: use the target shown in the provider dashboard
```

Keep the old `geocheck.tungowo.com` record active until the `tungowo.com` domain expires, but make it redirect to the new URL.

## App Environment Variables

Production environment:

```text
SITE_ORIGIN=https://geocheck.lisheng.cv
LEGACY_HOST=geocheck.tungowo.com
```

The app now uses these for:

- old host 301 redirect
- `/robots.txt`
- `/sitemap.xml`

## Redirect Rules

Preferred behavior:

```text
https://geocheck.tungowo.com/* -> 301 -> https://geocheck.lisheng.cv/*
```

The Node server already supports this if traffic for the old host reaches the same service.

If using Cloudflare Redirect Rules:

```text
If hostname equals geocheck.tungowo.com
Then static redirect to https://geocheck.lisheng.cv${uri.path}
Status code: 301
Preserve query string: yes
```

If using Vercel, add a redirect rule in `vercel.json` or the dashboard:

```json
{
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "geocheck.tungowo.com" }],
      "destination": "https://geocheck.lisheng.cv/$1",
      "permanent": true
    }
  ]
}
```

## SEO / GEO Signals Updated

The homepage now points canonical and structured data to:

```text
https://geocheck.lisheng.cv/
```

Updated fields:

- canonical URL
- Open Graph URL
- Open Graph image
- Twitter image
- JSON-LD Organization `@id`
- JSON-LD Organization `url`
- JSON-LD WebSite `@id`
- JSON-LD WebSite `url`
- JSON-LD publisher/provider references

## Search Console Setup

Add these properties:

```text
lisheng.cv
geocheck.lisheng.cv
```

Submit sitemap:

```text
https://geocheck.lisheng.cv/sitemap.xml
```

Use URL inspection for:

```text
https://geocheck.lisheng.cv/
https://geocheck.lisheng.cv/home
```

## GA4

GA tag remains:

```text
G-CBTTKVLT82
```

After deployment, verify Realtime in GA4 by opening:

```text
https://geocheck.lisheng.cv/
```

## Deployment Verification

Run these checks after deployment:

```powershell
Invoke-WebRequest -Uri "https://geocheck.lisheng.cv/home" -UseBasicParsing
Invoke-WebRequest -Uri "https://geocheck.lisheng.cv/robots.txt" -UseBasicParsing
Invoke-WebRequest -Uri "https://geocheck.lisheng.cv/sitemap.xml" -UseBasicParsing
```

Check legacy redirect:

```powershell
Invoke-WebRequest -Uri "https://geocheck.tungowo.com/home" -MaximumRedirection 0 -ErrorAction SilentlyContinue
```

Expected:

```text
Status: 301
Location: https://geocheck.lisheng.cv/home
```

## Recommended Public Links

Use this URL everywhere going forward:

```text
https://geocheck.lisheng.cv/
```

Use it in:

- portfolio
- LinkedIn
- GitHub README
- product screenshots
- pitch deck
- client messages
- future case studies

