// Report page and Markdown export for an MCAC GeoCheck report: four results read
// separately, the fact check against the official site, every question's raw answer
// and sources, and the unscored site checks. Every model-written string is escaped.

const FLAG = {
  yes: ["有", "yes"], part: ["部分", "part"], no: ["無", "no"], unknown: ["未知", "unknown"],
  correct: ["正確", "yes"], mismatch: ["不一致", "part"], not_provided: ["未提供", "absent"], unverifiable: ["無法核對", "unknown"]
};
const FIELD = { correct: "正確", mismatch: "和你的頁面不一致", not_provided: "未提供", unverifiable: "無法核對", unknown: "未知", not_judged: "未判定（v0）" };
const SOURCE = { official: "官網", maps: "地圖", social: "社群", booking: "訂位平台", ugc: "評論論壇", wiki: "維基", gov_edu: "政府學校", other: "其他", unattributable: "無法歸屬" };
const ENTRY = { website: "網站", map: "地圖", phone: "電話", booking: "訂位", order: "訂購", line: "LINE", address: "地址", other: "其他" };
const PROBE = { discovery: "推薦題（不帶店名）", fact: "事實題", action: "行動題" };
const ENGINE = { perplexity: "Perplexity Sonar", gemini: "Gemini Flash（Google 搜尋）" };
const TRUTH_SOURCE = { json_ld: "結構化資料", visible_text: "頁面文字" };

function mcacReportHtml(report) {
  const m = report.mcac || {};
  const rows = summaryRows(report);
  const probes = Array.isArray(m.probes) ? m.probes : [];
  const checks = report.siteChecks || {};
  const host = safeHost(report.finalUrl || report.url);
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>AI 能見度檢測單（MCAC）｜${esc(host)}｜LS-Labs GeoCheck</title>
<style>
:root{--ink:#0B1F3B;--text:#1E293B;--muted:#64748B;--rule:#D5DDE8;--desk:#EEF2F7;--paper:#fff;--action:#1D4ED8;
--yes:#047857;--yes-t:#ECFDF5;--part:#B45309;--part-t:#FFF4E0;--no:#B91C1C;--no-t:#FEF2F2;--unk:#475569;--unk-t:#F1F5F9}
*{box-sizing:border-box}body{margin:0;background:var(--desk);color:var(--text);font:16px/1.7 "Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif}
.top{background:var(--ink);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.top a{color:#BFDBFE;text-decoration:none;font-weight:700;font-size:.9rem;margin-left:16px}
.sheet{max-width:880px;margin:24px auto;background:var(--paper);border:1px solid var(--rule);border-radius:4px;padding:28px 28px 20px;box-shadow:0 1px 0 var(--rule),0 28px 56px -32px rgba(11,31,59,.4)}
h1{font-size:1.4rem;margin:0;color:var(--ink)}h2{font-size:1.1rem;color:var(--ink);margin:32px 0 10px}
.meta{font:400 .8rem/1.7 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);margin-top:6px;border-bottom:2px solid var(--ink);padding-bottom:12px}
.meta span{margin-right:18px;display:inline-block}.note{font-size:.9rem;color:var(--muted);margin:12px 0 0}
.limited{margin-top:16px;padding:12px 14px;border-radius:4px;background:var(--part-t);color:var(--part);font-weight:700}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;vertical-align:top;padding:12px 8px;border-bottom:1px solid var(--rule)}
thead th{font-size:.75rem;letter-spacing:.08em;color:var(--muted);font-weight:500}
tbody th{color:var(--ink);font-weight:700;width:30%}tbody th small{display:block;font-weight:400;color:var(--muted);font-size:.8rem;line-height:1.5}
td.flag{text-align:right;white-space:nowrap}
.f{display:inline-flex;align-items:center;gap:6px;padding:2px 10px;border-radius:4px;font-size:.8rem;font-weight:700}
.f::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.f-yes{color:var(--yes);background:var(--yes-t)}.f-part{color:var(--part);background:var(--part-t)}.f-no{color:var(--no);background:var(--no-t)}
.f-unknown{color:var(--unk);background:var(--unk-t)}.f-unknown::before{background:transparent;border:1.5px solid currentColor}
.f-absent{color:var(--unk);background:transparent;border:1px dashed var(--unk)}.f-absent::before{width:8px;height:2px;border-radius:1px}
details{border-bottom:1px solid var(--rule)}summary{cursor:pointer;padding:12px 0;font-weight:700;color:var(--ink)}
.answer{white-space:pre-wrap;background:var(--desk);border-radius:4px;padding:12px;font-size:.9rem;margin:0 0 10px}
.src{font:400 .78rem/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);margin:0 0 14px;padding-left:18px;word-break:break-all}
ul.plain{margin:6px 0 0;padding-left:18px}.foot{margin-top:28px;font:400 .76rem/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted)}
@media print{.top{display:none}body{background:#fff}.sheet{box-shadow:none;border:0;margin:0}details{display:block}details>*{display:block}}
@media (max-width:600px){.sheet{margin:0;border-radius:0;padding:20px 16px}tbody th{width:auto}}
</style>
</head>
<body>
<div class="top"><strong>LS-Labs GeoCheck · AI 能見度檢測單</strong><span><a href="/report/${encodeURIComponent(report.id || "")}/markdown">下載這份報告</a><a href="https://geocheck.lslabs.tw/">再檢查一次</a></span></div>
<main class="sheet">
<h1>AI 能見度檢測單</h1>
<div class="meta">
<span>受檢網站 ${esc(host)}</span><span>品牌名稱 ${esc(report.entity?.name || "未知")}</span><span>地區 ${esc(report.entity?.location || "未知")}</span>
<span>方法 MCAC v${esc(String(m.method_version || "0.1.0"))}</span><span>AI 搜尋 ${esc(ENGINE[report.engine?.id] || report.engine?.id || "未知")}</span>
<span>檢測時間 ${esc(taipeiTime(report.createdAt))}</span><span>報告編號 ${esc(report.id || "")}</span>
</div>
<p class="note">四項分開判讀，不合成總分。每項都附題數與原始回答；這是一次快照，換題目、順序或時間，結果都可能不同。</p>
${report.limited ? `<p class="limited">這次讀不到網站，所以沒有詢問 AI；四項都是未知，不代表 0。</p>` : ""}
<table>
<thead><tr><th scope="col">項目</th><th scope="col">結果</th><th scope="col" class="flag">判讀</th></tr></thead>
<tbody>
${rows.map((row) => `<tr><th scope="row">${esc(row.label)}<small>${esc(row.hint)}</small></th><td>${row.resultHtml}</td><td class="flag">${flag(row.flag)}</td></tr>`).join("\n")}
</tbody>
</table>
<h2>資訊正確性：你的頁面寫的與 AI 說的</h2>
<table>
<thead><tr><th scope="col">欄位</th><th scope="col">你的頁面</th><th scope="col">AI 回答</th><th scope="col" class="flag">判定</th></tr></thead>
<tbody>
${factRow("電話", report.truth?.phone, m.accuracy?.claimed?.phone, m.accuracy?.fields?.phone)}
${factRow("地址", report.truth?.address, m.accuracy?.claimed?.address, m.accuracy?.fields?.address)}
${factRow("營業時間", report.truth?.hours, null, "not_judged")}
</tbody>
</table>
<p class="note">以你的頁面公開的資料為準：AI 給的值出現在頁面上算「正確」；沒有出現標「和你的頁面不一致」，本工具無法判斷哪一方才對；頁面沒寫的項目標「無法核對」。</p>
${hasMismatch(m) ? `<p class="limited">${esc(MISMATCH_ADVICE)}</p>` : ""}
<h2>每一題的原始回答與來源</h2>
${probes.length ? probes.map((probe, index) => probeBlock(probe, index)).join("\n") : `<p class="note">這次沒有可顯示的回答。</p>`}
<h2>網站條件（不計分）</h2>
${checks.issues?.length ? `<ul class="plain">${checks.issues.map((item) => `<li><b>${esc(item.check || "")}</b>：${esc(item.detail || "")}</li>`).join("")}</ul>` : `<p class="note">沒有發現阻擋讀取的網站設定。</p>`}
${checks.citeability?.gaps_zh?.length ? `<p class="note">可以補強的內容：${esc(checks.citeability.gaps_zh.join("；"))}</p>` : ""}
<h2>判讀限制</h2>
<ul class="plain">
<li>每項只有 1 到 2 題，屬於快檢，不能當成研究結論或長期趨勢。</li>
<li>被提到不等於被推薦，也可能是比較或批評；來源出現次數不是 AI 的信任權重。</li>
<li>判讀規則為 v0 暫定（${esc(m.flag_rules_version || "mcac-flags-v0")}）；本工具沒有量測後續來客或轉換。</li>
</ul>
<p class="foot">GeoCheck · MCAC v${esc(String(m.method_version || "0.1.0"))} · ${esc(report.pipelineVersion || "")}<br>方法依據：<a href="https://lslabs.tw/blog/AI搜尋時代的檢索機制報告/">AI 搜尋時代的檢索機制報告</a></p>
</main>
</body>
</html>`;
}

function summaryRows(report) {
  const m = report.mcac || {};
  const mention = m.mention || {};
  const citation = m.citation || {};
  const accuracy = m.accuracy || {};
  const conversion = m.conversion || {};
  const ranks = (mention.ranks || []).filter((rank) => Number.isFinite(rank));
  const byType = Object.entries(citation.by_type || {}).sort((a, b) => b[1] - a[1]).map(([type, count]) => `${SOURCE[type] || type} ${count}`).join("・");
  return [
    {
      label: "提及（Mention）",
      hint: "顧客沒說店名時，AI 有沒有主動講到你",
      flag: mention.flag,
      resultHtml: mention.n ? `${esc(mention.hits)} / ${esc(mention.n)} 題推薦題提到你${ranks.length ? `<br><small>清單名次：${esc(ranks.map((rank) => `第 ${rank} 名`).join("、"))}</small>` : ""}` : "沒有可判讀的推薦題回答"
    },
    {
      label: "引用來源（Citation）",
      hint: "回答列出的來源裡，有沒有你的官網",
      flag: citation.flag,
      resultHtml: citation.n ? `官網出現在 ${esc(citation.official_probes)} / ${esc(citation.n)} 題${byType ? `<br><small>${esc(byType)}</small>` : ""}` : "沒有可判讀的回答"
    },
    {
      label: "資訊正確性（Accuracy）",
      hint: "AI 給的地址、電話跟你的頁面一不一致",
      flag: accuracy.flag,
      resultHtml: `電話：${esc(FIELD[accuracy.fields?.phone] || "未知")}・地址：${esc(FIELD[accuracy.fields?.address] || "未知")}`
    },
    {
      label: "行動資訊（Conversion-readiness）",
      hint: "AI 有沒有給出電話、網址、地圖或訂位等下一步",
      flag: conversion.flag,
      resultHtml: conversion.entries?.length
        ? `${esc(conversion.entries.map((entry) => ENTRY[entry] || entry).join("、"))}<br><small>官網入口：${conversion.official_entry ? "有" : "沒有"}</small>`
        : (conversion.flag === "unknown" ? "沒有可判讀的行動題回答" : "沒有可執行的下一步")
    }
  ];
}

function factRow(label, truth, claimed, status) {
  const claimedText = Array.isArray(claimed) && claimed.length ? claimed.join("、") : (status === "not_judged" ? "—" : "沒有提供");
  const listed = Array.isArray(truth?.values) && truth.values.length ? truth.values : (truth?.value ? [truth.value] : []);
  const truthText = listed.length ? `${listed.join("、")}（${TRUTH_SOURCE[truth.source] || "頁面"}${listed.length > 1 ? `等，共 ${listed.length} 組` : ""}）` : "頁面沒有寫";
  return `<tr><th scope="row">${esc(label)}</th><td>${esc(truthText)}</td><td>${esc(claimedText)}</td><td class="flag">${esc(FIELD[status] || "未知")}</td></tr>`;
}

function probeBlock(probe, index) {
  const sources = Array.isArray(probe.sources) ? probe.sources : [];
  const status = probe.answerStatus === "answered" ? "" : `（${probe.answerStatus === "failed" ? "這題沒有拿到回答，標為未知" : "這題回答無法判讀，標為未知"}）`;
  return `<details${index === 0 ? " open" : ""}>
<summary>${esc(PROBE[probe.type] || probe.type)}：${esc(probe.query || "")}${esc(status)}</summary>
${probe.answer ? `<p class="answer">${esc(probe.answer)}</p>` : ""}
${sources.length ? `<ul class="src">${sources.map((source) => `<li>${esc(SOURCE[source.type] || source.type)}｜${esc(source.url)}</li>`).join("")}</ul>` : `<p class="note">這題沒有列出來源。</p>`}
</details>`;
}

function mcacReportMarkdown(report) {
  const m = report.mcac || {};
  const lines = [
    `# AI 能見度檢測單（MCAC）`,
    ``,
    `- 受檢網站：${safeHost(report.finalUrl || report.url)}`,
    `- 方法：MCAC v${m.method_version || "0.1.0"}（四項分開判讀，不合成總分）`,
    `- AI 搜尋：${ENGINE[report.engine?.id] || report.engine?.id || "未知"}`,
    `- 檢測時間：${taipeiTime(report.createdAt)}`,
    ``,
    `| 項目 | 結果 | 判讀 |`,
    `|---|---|---|`,
    ...summaryRows(report).map((row) => `| ${row.label} | ${row.resultHtml.replace(/<br>/g, "；").replace(/<[^>]+>/g, "")} | ${(FLAG[row.flag] || FLAG.unknown)[0]} |`),
    ``,
    `## 每一題的原始回答`,
    ...(m.probes || []).flatMap((probe) => [``, `### ${PROBE[probe.type] || probe.type}：${probe.query || ""}`, ``, probe.answer || "（沒有回答）", ``, ...(probe.sources || []).map((source) => `- ${SOURCE[source.type] || source.type}：${source.url}`)]),
    ``,
    ...(hasMismatch(m) ? [`> ${MISMATCH_ADVICE}`, ``] : []),
    `判讀限制：每項只有 1 到 2 題；被提到不等於被推薦；來源出現次數不是 AI 的信任權重；規則為 v0 暫定。`
  ];
  return lines.join("\n");
}

// The page and the answer disagree; the tool cannot tell which is right (2026-10-20 decision).
const MISMATCH_ADVICE = "AI 給的電話或地址和你的頁面不同。可能是頁面資料過時，也可能是 Google 地圖等其他平台列的資料不一樣；請確認哪一個正確，並把官網、粉專、Google 商家等各平台的資料統一。";

function hasMismatch(m) {
  return m?.accuracy?.fields?.phone === "mismatch" || m?.accuracy?.fields?.address === "mismatch";
}

function flag(value) {
  const [label, tone] = FLAG[value] || FLAG.unknown;
  return `<span class="f f-${tone}">${label}</span>`;
}

function taipeiTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
}

function safeHost(value) {
  try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return String(value || ""); }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
}

module.exports = { mcacReportHtml, mcacReportMarkdown };
