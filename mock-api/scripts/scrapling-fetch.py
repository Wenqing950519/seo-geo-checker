#!/usr/bin/env python3
"""One-shot Scrapling fetcher for the Node GeoCheck service.

The process accepts one JSON object through stdin and prints one JSON object to
stdout.  Keeping this boundary narrow prevents a submitted URL from becoming a
shell command and lets the Node layer retain its existing scoring and evidence
normalisation rules.
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from typing import Any
from urllib.parse import urljoin
from urllib.robotparser import RobotFileParser

if hasattr(sys.stdout, "reconfigure"):
    # Node reads this process through a UTF-8 pipe; using the Windows console
    # code page here can fail on otherwise valid Taiwanese site content.
    sys.stdout.reconfigure(encoding="utf-8")


def emit(value: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(value, ensure_ascii=False))
    sys.stdout.flush()


def response_payload(page: Any, mode: str, robots: dict[str, Any]) -> dict[str, Any]:
    body = page.body
    if isinstance(body, bytes):
        html = body.decode(page.encoding or "utf-8", errors="replace")
    else:
        html = str(body or "")
    return {
        "ok": True,
        "mode": mode,
        "html": html,
        "statusCode": int(page.status or 0),
        "finalUrl": str(getattr(page, "url", "") or ""),
        "headers": {
            "contentType": str((page.headers or {}).get("content-type", "")),
            "xRobotsTag": str((page.headers or {}).get("x-robots-tag", "")),
        },
        "robots": robots,
    }


def assert_robots_allowed(url: str) -> dict[str, Any]:
    robots_url = urljoin(url, "/robots.txt")
    parser = RobotFileParser()
    parser.set_url(robots_url)
    try:
        parser.read()
    except Exception as error:
        raise PermissionError(f"robots.txt could not be read: {error}") from error
    if not parser.can_fetch("GeoCheck-Audit", url):
        raise PermissionError("robots.txt disallows GeoCheck-Audit from fetching this URL")
    return {"checked": True, "allowed": True, "url": robots_url}


def main() -> None:
    try:
        request = json.loads(sys.stdin.read())
        url = str(request["url"])
        mode = str(request.get("mode", "http"))
        timeout_ms = max(1_000, min(int(request.get("timeoutMs", 45_000)), 90_000))
        executable_path = os.environ.get("SCRAPLING_EXECUTABLE_PATH") or None
        respect_robots = bool(request.get("respectRobots", True))
        robots = assert_robots_allowed(url) if respect_robots else {"checked": False, "allowed": None}

        from scrapling.fetchers import DynamicFetcher, FetcherSession, StealthyFetcher

        if mode == "http":
            # The explicit session avoids a Scrapling 0.4.14 process-lifetime
            # bug in the one-shot Fetcher convenience method on Python 3.13.
            with FetcherSession(
                timeout=max(1, timeout_ms // 1_000),
                retries=0,
                follow_redirects="safe",
                impersonate="chrome",
                stealthy_headers=True,
            ) as session:
                page = session.get(url)
                payload = response_payload(page, mode, robots)
        elif mode == "dynamic":
            page = DynamicFetcher.fetch(
                url,
                headless=True,
                disable_resources=True,
                network_idle=True,
                timeout=timeout_ms,
                wait=500,
                executable_path=executable_path,
            )
            payload = response_payload(page, mode, robots)
        elif mode == "stealth":
            page = StealthyFetcher.fetch(
                url,
                headless=True,
                disable_resources=True,
                network_idle=True,
                timeout=timeout_ms,
                wait=500,
                block_webrtc=True,
                solve_cloudflare=False,
                executable_path=executable_path,
            )
            payload = response_payload(page, mode, robots)
        else:
            raise ValueError("mode must be http, dynamic, or stealth")
        emit(payload)
    except Exception as error:  # The Node caller maps this to an AppError.
        emit({
            "ok": False,
            "error": str(error),
            "errorType": type(error).__name__,
            "trace": traceback.format_exc(limit=3),
        })


if __name__ == "__main__":
    main()
