#!/usr/bin/env python3
"""Structural SEO checks on locally saved HTML files. Stdlib only.

Usage:
    python audit_checks.py <html_dir> <output.json> [--base-url https://example.com] [--manifest manifest.json]

<html_dir>: directory of .html files (one per page).
--base-url: site root, used to classify absolute same-domain links as internal.
--manifest: optional JSON mapping filename -> URL, used only for labeling.

Checks covered here are the ones marked [腳本] in references/audit-checklist.md.
Thresholds are defined in THRESHOLDS below so they can be tuned in one place.
"""
import json
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

THRESHOLDS = {
    "title_min": 15,
    "title_max": 60,
    "meta_desc_min": 50,
    "meta_desc_max": 160,
    "min_internal_links": 1,
}


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ""
        self._in_title = False
        self.meta_desc = None
        self.canonical = None
        self.og = {}
        self.headings = []  # list of (level, text-started flag)
        self._in_heading = None
        self.h_texts = {}
        self.jsonld = []
        self._in_jsonld = False
        self._jsonld_buf = ""
        self.images = 0
        self.images_missing_alt = 0
        self.links = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "title":
            self._in_title = True
        elif tag == "meta":
            name = (a.get("name") or a.get("property") or "").lower()
            if name == "description":
                self.meta_desc = (a.get("content") or "").strip()
            elif name.startswith("og:"):
                self.og[name] = (a.get("content") or "").strip()
        elif tag == "link" and (a.get("rel") or "").lower() == "canonical":
            self.canonical = a.get("href")
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.headings.append(int(tag[1]))
            self._in_heading = tag
        elif tag == "script" and (a.get("type") or "").lower() == "application/ld+json":
            self._in_jsonld = True
            self._jsonld_buf = ""
        elif tag == "img":
            self.images += 1
            if not (a.get("alt") or "").strip():
                self.images_missing_alt += 1
        elif tag == "a" and a.get("href"):
            self.links.append(a["href"])

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_jsonld:
            self._in_jsonld = False
            try:
                self.jsonld.append(json.loads(self._jsonld_buf))
            except Exception:
                self.jsonld.append({"_parse_error": True})
        elif self._in_heading == tag:
            self._in_heading = None

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_jsonld:
            self._jsonld_buf += data


def jsonld_types(blocks):
    types = []
    for b in blocks:
        items = b if isinstance(b, list) else [b]
        for it in items:
            if isinstance(it, dict):
                t = it.get("@type")
                if t:
                    types.extend(t if isinstance(t, list) else [t])
    return types


def is_internal_href(href, base_url=""):
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
        return False
    parsed = urlparse(href)
    if not parsed.scheme and not parsed.netloc:
        return True
    if href.startswith("//"):
        parsed = urlparse(f"https:{href}")
    base = urlparse(base_url or "")
    return bool(base.netloc and parsed.netloc == base.netloc)


def check_page(html, base_url=""):
    p = PageParser()
    try:
        p.feed(html)
    except Exception as e:
        return {"issues": [{"check": "parse", "severity": "warning",
                            "detail": f"HTML parse error: {e}"}]}

    issues = []
    t = p.title.strip()
    if not t:
        issues.append({"check": "title", "severity": "critical", "detail": "missing title"})
    elif not (THRESHOLDS["title_min"] <= len(t) <= THRESHOLDS["title_max"]):
        issues.append({"check": "title", "severity": "warning",
                       "detail": f"title length {len(t)} outside "
                                 f"{THRESHOLDS['title_min']}-{THRESHOLDS['title_max']}"})
    if p.meta_desc is None or not p.meta_desc:
        issues.append({"check": "meta_description", "severity": "warning",
                       "detail": "missing meta description"})
    elif not (THRESHOLDS["meta_desc_min"] <= len(p.meta_desc) <= THRESHOLDS["meta_desc_max"]):
        issues.append({"check": "meta_description", "severity": "info",
                       "detail": f"length {len(p.meta_desc)} outside recommended range"})

    h1s = [h for h in p.headings if h == 1]
    if len(h1s) == 0:
        issues.append({"check": "h1", "severity": "warning", "detail": "no h1"})
    elif len(h1s) > 1:
        issues.append({"check": "h1", "severity": "warning", "detail": f"{len(h1s)} h1 tags"})
    prev = 0
    for lvl in p.headings:
        if prev and lvl > prev + 1:
            issues.append({"check": "heading_order", "severity": "info",
                           "detail": f"jump h{prev} -> h{lvl}"})
            break
        prev = lvl

    if not p.canonical:
        issues.append({"check": "canonical", "severity": "warning", "detail": "missing canonical"})
    if not p.jsonld:
        issues.append({"check": "structured_data", "severity": "warning",
                       "detail": "no JSON-LD structured data"})
    if p.images and p.images_missing_alt:
        issues.append({"check": "img_alt", "severity": "info",
                       "detail": f"{p.images_missing_alt}/{p.images} images missing alt"})

    internal = [h for h in p.links if is_internal_href(h, base_url)]
    if len(internal) < THRESHOLDS["min_internal_links"]:
        issues.append({"check": "internal_links", "severity": "info",
                       "detail": f"only {len(internal)} internal links"})

    return {
        "title": t,
        "meta_description_length": len(p.meta_desc or ""),
        "canonical": p.canonical,
        "jsonld_types": jsonld_types(p.jsonld),
        "og_tags": sorted(p.og.keys()),
        "images": p.images,
        "images_missing_alt": p.images_missing_alt,
        "internal_links": len(internal),
        "issues": issues,
    }


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    html_dir, out_path = Path(sys.argv[1]), Path(sys.argv[2])
    if not html_dir.exists() or not html_dir.is_dir():
        print(f"HTML directory not found: {html_dir}", file=sys.stderr)
        sys.exit(2)

    base_url = ""
    manifest = {}
    if "--base-url" in sys.argv:
        base_url = sys.argv[sys.argv.index("--base-url") + 1]
    if "--manifest" in sys.argv:
        manifest = json.loads(Path(sys.argv[sys.argv.index("--manifest") + 1])
                              .read_text(encoding="utf-8-sig"))

    pages, all_issues = {}, 0
    html_files = sorted(html_dir.glob("*.html"))
    if not html_files:
        print(f"No .html files found in: {html_dir}", file=sys.stderr)
        sys.exit(2)

    for f in html_files:
        result = check_page(f.read_text(encoding="utf-8", errors="replace"), base_url)
        result["url"] = manifest.get(f.name, f.name)
        pages[f.name] = result
        all_issues += len(result["issues"])

    titles = {}
    for name, r in pages.items():
        if r.get("title"):
            titles.setdefault(r["title"], []).append(name)
    for title, names in titles.items():
        if len(names) > 1:
            for n in names:
                pages[n]["issues"].append({"check": "title", "severity": "critical",
                                           "detail": f"duplicate title across {len(names)} pages"})
                all_issues += 1

    summary = {"pages_checked": len(pages), "total_issues": all_issues,
               "by_severity": {}}
    for r in pages.values():
        for i in r["issues"]:
            s = i["severity"]
            summary["by_severity"][s] = summary["by_severity"].get(s, 0) + 1

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"summary": summary, "pages": pages},
                                   ensure_ascii=False, indent=2),
                        encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
