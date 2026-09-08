#!/usr/bin/env python3
"""Compare two result JSON files (audit or geo) and print a change summary.

Usage:
    python diff.py <previous.json> <current.json>

Works on any JSON, but understands two shapes specially:
- audit files: {"pages": {name: {"issues": [{check, severity, detail}]}}}
- geo files:   {"questions": {qid: {"citation_rate": float, ...}}}
Output is a JSON summary on stdout, meant to be read and narrated by Claude.
"""
import json
import sys
from pathlib import Path


def issue_keys(data):
    keys = set()
    for name, page in (data.get("pages") or {}).items():
        for i in page.get("issues", []):
            keys.add((name, i.get("check"), i.get("detail", "")[:60]))
    return keys


def audit_diff(prev, curr):
    p, c = issue_keys(prev), issue_keys(curr)
    return {
        "type": "audit",
        "fixed": sorted(["%s | %s | %s" % k for k in p - c]),
        "new": sorted(["%s | %s | %s" % k for k in c - p]),
        "unchanged_count": len(p & c),
    }


def geo_diff(prev, curr):
    pq = prev.get("questions") or {}
    cq = curr.get("questions") or {}
    gained, lost, moved = [], [], []
    for qid, cur in cq.items():
        pr = pq.get(qid)
        cr = cur.get("citation_rate", 0)
        if pr is None:
            continue
        prr = pr.get("citation_rate", 0)
        if prr == 0 and cr > 0:
            gained.append(qid)
        elif prr > 0 and cr == 0:
            lost.append(qid)
        elif abs(cr - prr) >= 0.25:
            moved.append({"id": qid, "from": prr, "to": cr})
    overall = {"from": prev.get("overall_rate"), "to": curr.get("overall_rate")}
    return {"type": "geo", "overall_rate": overall, "gained_citation": gained,
            "lost_citation": lost, "big_moves": moved,
            "new_questions": sorted(set(cq) - set(pq))}


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    prev = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))
    curr = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8-sig"))

    if "pages" in curr:
        result = audit_diff(prev, curr)
    elif "questions" in curr:
        result = geo_diff(prev, curr)
    else:
        result = {"type": "generic",
                  "keys_added": sorted(set(curr) - set(prev)),
                  "keys_removed": sorted(set(prev) - set(curr)),
                  "keys_changed": sorted(k for k in set(prev) & set(curr)
                                         if prev[k] != curr[k])}
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
