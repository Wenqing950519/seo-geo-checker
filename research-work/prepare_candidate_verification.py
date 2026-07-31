from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path


ROW_RE = re.compile(
    r"^\|\s*(\d{3})\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|$"
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    rows: list[dict[str, str]] = []
    for line in args.input.read_text(encoding="utf-8-sig").splitlines():
        match = ROW_RE.match(line)
        if not match:
            continue
        candidate_id, name, cuisine, business_type, price, crawl_estimate, priority, discovery_source = match.groups()
        rows.append(
            {
                "candidate_id": candidate_id,
                "candidate_name": name,
                "initial_cuisine": cuisine,
                "initial_business_type": business_type,
                "initial_price_band": price,
                "initial_crawl_estimate": crawl_estimate,
                "initial_priority": priority,
                "discovery_source": discovery_source,
                "canonical_name": "",
                "address": "",
                "district_verified": "",
                "business_status": "",
                "dine_in": "",
                "official_site_url": "",
                "branch_page_url": "",
                "social_url": "",
                "booking_url": "",
                "root_domain": "",
                "shared_domain_group": "",
                "crawl_result": "",
                "extractable_fields": "",
                "verification_date": "",
                "evidence_urls": "",
                "exclusion_reason": "",
                "verification_status": "pending",
                "reviewer": "",
            }
        )

    if len(rows) != 140:
        raise SystemExit(f"Expected 140 candidate rows, found {len(rows)}")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
