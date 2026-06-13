const { callAgnesJson } = require("../providers/agnes");
const { getBraveAuditContext } = require("../providers/brave");
const { AppError } = require("./errors");
const { fetchHomepage } = require("./html");

function realLitePrompt({ siteUrl, metadata, text, searchContext }) {
  return `You are an SEO/GEO consultant. Analyze the public homepage text and return only valid JSON.

Goal:
Create a lightweight SEO/GEO audit for a website. Be specific, conservative, and do not invent facts.

Website URL:
${siteUrl}

Extracted metadata:
${JSON.stringify(metadata, null, 2)}

Homepage text excerpt:
${text}

Search and grounding context from Brave Search API:
${JSON.stringify(searchContext, null, 2)}

Return this exact JSON shape:
{
  "score": {
    "value": 0,
    "label": "Critical | Needs Work | Decent | Strong",
    "summary_zh": ""
  },
  "positioning": {
    "perceived_category_zh": "",
    "perceived_audience_zh": [],
    "perceived_use_cases_zh": [],
    "misunderstandings_or_risks_zh": [],
    "missing_signals_zh": [],
    "confidence": "low | medium | high"
  },
  "technical_seo": {
    "issues": [
      {
        "severity": "high | medium | low",
        "check": "",
        "detail_zh": "",
        "impact_zh": ""
      }
    ]
  },
  "geo_questions": [
    {
      "question_zh": "",
      "intent": "awareness | consideration | decision",
      "business_value": 1
    }
  ],
  "content_citeability": {
    "strengths_zh": [],
    "gaps_zh": []
  },
  "priority_actions": [
    {
      "priority": "P1 | P2 | P3",
      "type": "positioning | technical | content | authority",
      "target_zh": "",
      "recommendation_zh": "",
      "reason_zh": "",
      "expected_impact_zh": ""
    }
  ],
  "limitations_zh": []
}

Rules:
- Use Traditional Chinese for all *_zh fields.
- score.value must be 0-100.
- geo_questions must include exactly 3 questions.
- priority_actions must include exactly 3 actions: P1, P2, P3.
- If evidence is missing, say it is missing instead of pretending it exists.
- If Brave context is enabled, use it to reason about search visibility, competitor/source opportunities, and citation-ready content gaps.
- Do not promise rankings or guaranteed AI citations.`;
}

async function runRealLiteAudit(siteUrl) {
  let homepage;
  try {
    homepage = await fetchHomepage(siteUrl);
  } catch (error) {
    if (error instanceof AppError && ["fetch_homepage", "browser_fetch"].includes(error.stage)) {
      return createFetchLimitedReport(siteUrl, error);
    }
    throw error;
  }
  const searchContext = await getBraveAuditContext({
    siteUrl,
    title: homepage.metadata?.title,
    description: homepage.metadata?.description
  });
  const prompt = realLitePrompt({
    siteUrl,
    metadata: homepage.metadata,
    text: homepage.text,
    searchContext
  });
  const result = await callAgnesJson(prompt, { temperature: 0.1, attempts: 4, timeoutMs: 45_000 });
  const audit = normalizeAudit(result.json);

  return {
    id: `real_lite_${Date.now()}`,
    url: siteUrl,
    createdAt: new Date().toISOString(),
    provider: result.provider || "agnes",
    model: result.model,
    latencyMs: result.latencyMs,
    attempts: result.attempts,
    repairedJson: Boolean(result.repairedJson),
    homepage: {
      metadata: homepage.metadata,
      textLength: homepage.text.length,
      fetchMethod: homepage.fetchMethod || "http"
    },
    search: searchContext,
    audit
  };
}

module.exports = { runRealLiteAudit };

function createFetchLimitedReport(siteUrl, error) {
  const host = (() => {
    try {
      return new URL(siteUrl).hostname.replace(/^www\./, "");
    } catch {
      return siteUrl;
    }
  })();

  return {
    id: `real_lite_${Date.now()}`,
    url: siteUrl,
    createdAt: new Date().toISOString(),
    provider: "local-fallback",
    model: "fetch-limited",
    latencyMs: 0,
    attempts: 0,
    repairedJson: false,
    homepage: {
      metadata: {
        title: "",
        description: "",
        h1: "",
        hasJsonLd: false
      },
      textLength: 0,
      fetchBlocked: true,
      fetchError: {
        message: error.message,
        details: error.details
      }
    },
    audit: normalizeAudit({
      score: {
        value: 35,
        label: "Critical",
        summary_zh: `${host} 的首頁目前無法被健檢工具讀取，伺服器回傳 ${error.details?.httpStatus || "錯誤"}。這不代表 Google 或 AI 一定無法讀取，但代表公開抓取流程存在阻礙，需要先確認防火牆、CDN、WAF 或反爬設定。`
      },
      positioning: {
        perceived_category_zh: "無法判定：首頁公開內容讀取失敗",
        perceived_audience_zh: [],
        perceived_use_cases_zh: [],
        misunderstandings_or_risks_zh: [
          "因無法讀取首頁內容，本次無法可靠判斷 AI 眼中定位。",
          "若搜尋引擎或 AI crawler 也被阻擋，可能影響收錄、摘要理解與 AI 引用機會。"
        ],
        missing_signals_zh: [
          "需要確認 robots.txt、CDN/WAF、bot protection、地區封鎖與 user-agent 規則。",
          "需要提供可被公開讀取的首頁 HTML，才能進一步檢查 title、meta、H1、schema 與內容可引用性。"
        ],
        confidence: "low"
      },
      technical_seo: {
        issues: [
          {
            severity: "high",
            check: "Homepage fetchability",
            detail_zh: `健檢工具讀取首頁時失敗：${error.message}`,
            impact_zh: "若搜尋引擎或 AI crawler 也遇到同樣阻擋，可能影響內容被讀取、理解與引用。"
          },
          {
            severity: "medium",
            check: "Crawler access validation",
            detail_zh: "目前無法確認 title、meta description、H1、schema、內容段落與 llms.txt 導覽是否完整。",
            impact_zh: "報告只能產出受限診斷，無法提供完整 SEO/GEO 優先級判斷。"
          }
        ]
      },
      geo_questions: [
        {
          question_zh: `${host} 是什麼？`,
          intent: "awareness",
          business_value: 3
        },
        {
          question_zh: `有哪些和 ${host} 類似的服務或品牌？`,
          intent: "consideration",
          business_value: 3
        },
        {
          question_zh: `如何判斷 ${host} 是否值得信任？`,
          intent: "decision",
          business_value: 4
        }
      ],
      content_citeability: {
        strengths_zh: [],
        gaps_zh: [
          "因首頁無法讀取，無法判斷是否有可被 AI 引用的定義段落、FAQ、案例或數據。",
          "需先排除抓取阻擋，再進行內容可引用性分析。"
        ]
      },
      priority_actions: [
        {
          priority: "P1",
          type: "technical",
          target_zh: "網站伺服器 / CDN / WAF",
          recommendation_zh: "確認是否阻擋一般 server-side fetch、搜尋引擎 crawler 或 AI crawler。必要時調整防火牆、bot protection 或 allowlist 規則。",
          reason_zh: "健檢工具收到 403，代表公開抓取路徑存在阻礙。",
          expected_impact_zh: "恢復可讀取性後，才能進一步檢查 SEO/GEO 訊號與內容可引用性。"
        },
        {
          priority: "P2",
          type: "technical",
          target_zh: "robots.txt / sitemap.xml / llms.txt",
          recommendation_zh: "確認 robots.txt 沒有誤擋重要路徑，sitemap.xml 可公開讀取，並考慮提供 llms.txt 作為 AI 內容導覽。",
          reason_zh: "公開導覽檔能協助搜尋引擎與 AI 更穩定理解網站結構。",
          expected_impact_zh: "降低 crawler 讀取不完整造成的理解偏差。"
        },
        {
          priority: "P3",
          type: "content",
          target_zh: "首頁 / 主要服務頁",
          recommendation_zh: "在解除抓取阻擋後，補上清楚的一句話定位、服務對象、FAQ、案例與結構化資料。",
          reason_zh: "這些內容是 AI 判斷品牌定位與可引用性的基礎。",
          expected_impact_zh: "提升搜尋引擎與 AI 對網站的理解品質。"
        }
      ],
      limitations_zh: [
        "本次報告為受限健檢：首頁公開內容讀取失敗，因此沒有進行完整 AI positioning 與內容可引用性分析。",
        "403 可能來自 CDN、WAF、bot protection、地區限制或 user-agent 規則。這不必然等於 Googlebot 被阻擋，需要另行驗證。"
      ]
    })
  };
}

function normalizeAudit(audit) {
  const normalized = audit && typeof audit === "object" ? audit : {};
  normalized.score = normalized.score || {};
  normalized.score.value = clampNumber(normalized.score.value, 0, 100, 50);
  normalized.score.label = normalizeLabel(normalized.score.label);
  normalized.score.summary_zh = String(normalized.score.summary_zh || "本次健檢已完成，但模型未提供完整摘要。");

  normalized.positioning = normalized.positioning || {};
  normalized.positioning.perceived_audience_zh = ensureArray(normalized.positioning.perceived_audience_zh);
  normalized.positioning.perceived_use_cases_zh = ensureArray(normalized.positioning.perceived_use_cases_zh);
  normalized.positioning.misunderstandings_or_risks_zh = ensureArray(normalized.positioning.misunderstandings_or_risks_zh);
  normalized.positioning.missing_signals_zh = ensureArray(normalized.positioning.missing_signals_zh);
  normalized.positioning.confidence = ["low", "medium", "high"].includes(normalized.positioning.confidence)
    ? normalized.positioning.confidence
    : "medium";

  normalized.technical_seo = normalized.technical_seo || {};
  normalized.technical_seo.issues = ensureArray(normalized.technical_seo.issues).slice(0, 8);

  normalized.geo_questions = ensureArray(normalized.geo_questions).slice(0, 3);
  while (normalized.geo_questions.length < 3) {
    normalized.geo_questions.push({
      question_zh: "使用者會如何在 AI 中搜尋這類服務？",
      intent: "consideration",
      business_value: 3
    });
  }

  normalized.content_citeability = normalized.content_citeability || {};
  normalized.content_citeability.strengths_zh = ensureArray(normalized.content_citeability.strengths_zh);
  normalized.content_citeability.gaps_zh = ensureArray(normalized.content_citeability.gaps_zh);

  normalized.priority_actions = ensureArray(normalized.priority_actions).slice(0, 3);
  const defaults = ["P1", "P2", "P3"];
  while (normalized.priority_actions.length < 3) {
    const priority = defaults[normalized.priority_actions.length];
    normalized.priority_actions.push({
      priority,
      type: "content",
      target_zh: "首頁或主要服務頁",
      recommendation_zh: "補充更清楚的定位、FAQ 與可引用證據。",
      reason_zh: "目前可用資料不足，需補強 AI 與搜尋引擎能理解的內容訊號。",
      expected_impact_zh: "提升網站被理解與引用的機會。"
    });
  }
  normalized.priority_actions = normalized.priority_actions.map((action, index) => ({
    ...action,
    priority: defaults[index]
  }));

  normalized.limitations_zh = ensureArray(normalized.limitations_zh);
  if (!normalized.limitations_zh.length) {
    normalized.limitations_zh.push("本報告只分析公開首頁內容，尚未結合 Search Console、完整站內頁面與真實 AI 搜尋多次測試。");
  }

  return normalized;
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeLabel(label) {
  const valid = ["Critical", "Needs Work", "Decent", "Strong"];
  return valid.includes(label) ? label : "Needs Work";
}
