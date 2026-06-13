import type { SampleReport } from "../../types/content";

export function SampleReportSection({ report }: { report: SampleReport }) {
  return (
    <section id="sample-report" className="section section-muted">
      <div className="container">
        <header className="section-header">
          <p className="eyebrow">報告範例</p>
          <h2>你會拿到一份這樣的網站健檢報告</h2>
          <p className="section-subtitle">
            報告不只給分數，而是說明 AI 如何理解你的網站、哪些 SEO/GEO 問題正在影響能見度，以及最值得優先修正的方向。
          </p>
        </header>
        <div className="report-grid">
          <article className="score-card">
            <p className="eyebrow">{report.scenario}</p>
            <strong className="score">{report.score.value}</strong>
            <p className="score-label">{report.score.label}</p>
            <p>{report.score.summary}</p>
          </article>
          <article className="report-card">
            <h3>AI 眼中定位摘要</h3>
            <p>{report.positioning.summary}</p>
            <ul>
              {report.positioning.gaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          </article>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>優先級</th>
                <th>類型</th>
                <th>目標</th>
                <th>建議方向</th>
              </tr>
            </thead>
            <tbody>
              {report.actions.map((action) => (
                <tr key={action.priority}>
                  <td>{action.priority}</td>
                  <td>{action.type}</td>
                  <td>{action.target}</td>
                  <td>{action.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
