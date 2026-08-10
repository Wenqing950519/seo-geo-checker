#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
SessionStart hook — 把 GeoCheck 的「共同事實來源」摘要注入每個新 session。

目的：Contract 要求 agent 讀 docs/，但那是行為約束（agent 可能跳過）。
這支 hook 讓「現況 + 未確認決策 + Charter 缺口」變成機制保證，開場就在 context 裡。

輸出：stdout 一段 JSON，hookSpecificOutput.additionalContext 會被注入模型 context。
設計原則：**簡短**。這段每個 session 都會載入，只放「會改變行為的事實」與指標，不貼全文。
"""
import json, re, sys
from pathlib import Path

# Windows 重導向時 stdout 預設為地區編碼（cp950），會讓中文輸出變亂碼。
# hook 輸出由 Claude Code 以 UTF-8 讀取，必須強制 UTF-8。
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = Path(__file__).resolve().parents[2]   # .claude/hooks/x.py -> repo root
DOCS = ROOT / "docs"


def read(p: Path) -> str:
    try:
        return p.read_text("utf-8", errors="replace")
    except Exception:
        return ""


def current_state() -> list[str]:
    """抽出服務狀態表與最終審計結果——這兩項最常被誤述。"""
    t = read(DOCS / "CURRENT_STATE.md")
    if not t:
        return ["- ⚠️ docs/CURRENT_STATE.md 不存在或無法讀取"]
    out = []
    m = re.search(r"更新日期：\s*(\S+)", t)
    if m:
        out.append(f"- 現況快照日期：{m.group(1)}")
    # 服務狀態表的每一列
    for row in re.findall(r"^\|\s*([^|\n]+?)\s*\|\s*(已啟用|地區限制|停用|未啟用)\s*\|", t, re.M):
        out.append(f"- 服務 {row[0]}：**{row[1]}**")
    return out or ["- （CURRENT_STATE.md 中未找到服務狀態表）"]


def pending_decisions() -> list[str]:
    """列出尚未由使用者確認的決策——這些不得被當成已定案。"""
    t = read(DOCS / "DECISION_LOG.md")
    if not t:
        return ["- ⚠️ docs/DECISION_LOG.md 不存在"]
    t = re.sub(r"```.*?```", "", t, flags=re.S)  # 剝除格式範本，避免把 D-XXX 佔位符當成真決策
    out = []
    for block in re.split(r"^### ", t, flags=re.M)[1:]:
        title = block.splitlines()[0].strip()
        if not title.startswith("D-") or "XXX" in title:
            continue
        status = re.search(r"\*\*狀態\*\*：\s*\**([^\n*]+)", block)
        s = (status.group(1) if status else "").strip()
        if "Proposed" in s or "待" in s:
            out.append(f"- **{title}** — 尚未確認")
    return out


def charter_gaps() -> list[str]:
    t = read(DOCS / "PROJECT_CHARTER.md")
    if not t:
        return ["- ⚠️ docs/PROJECT_CHARTER.md 不存在"]
    n = len(re.findall(r"TODO", t))
    if n:
        return [f"- PROJECT_CHARTER.md 仍有 **{n} 處 TODO** 未填（品牌定位／目標使用者／研究問題／商業模式等，屬 Human Ownership）"]
    return ["- PROJECT_CHARTER.md 已填寫完成"]


def main() -> int:
    try:
        sys.stdin.read()  # 收掉 stdin，避免管線阻塞
    except Exception:
        pass

    if not DOCS.exists():
        print(json.dumps({}, ensure_ascii=False))
        return 0

    lines = [
        "## GeoCheck 專案事實摘要（由 SessionStart hook 自動注入）",
        "",
        "本專案受 `CLAUDE.md` / `AGENTS.md` 的 Agent Contract 約束。以下為開場即需知道的事實；"
        "**進行重大任務前仍須實際讀取 `docs/` 相關文件**，本摘要不能取代原文。",
        "",
        "### 當前狀態",
        *current_state(),
        "",
        "### 尚未確認的決策（不得視為已定案）",
    ]
    pd = pending_decisions()
    lines += pd if pd else ["- （無）"]
    lines += ["", "### 待補缺口", *charter_gaps()]
    lines += [
        "",
        "### 提醒",
        "- 研究相關任務：先讀 `docs/RESEARCH_STANDARD.md`（Mandatory）與 `.claude/rules/research.md`",
        "- 涉及理解與決策：依 `.claude/rules/learning.md` 的五步流程，不要跳過推理階段",
        "- 未記錄於 `docs/DECISION_LOG.md` 的方向，一律稱為「建議」而非「已決定」",
    ]

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": "\n".join(lines),
        }
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
