import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const T = {
  navy: "#071A2C",
  navyMid: "#0D2640",
  navyLight: "#132F50",
  navyBorder: "rgba(255,255,255,0.07)",
  teal: "#00B4D8",
  tealDim: "rgba(0,180,216,0.12)",
  tealBorder: "rgba(0,180,216,0.22)",
  amber: "#F5A623",
  amberDim: "rgba(245,166,35,0.12)",
  red: "#FF6B6B",
  redDim: "rgba(255,107,107,0.12)",
  green: "#5DC96A",
  greenDim: "rgba(93,201,106,0.12)",
  muted: "rgba(255,255,255,0.42)",
  mutedMid: "rgba(255,255,255,0.62)",
  white: "#ffffff",
};

const FONT_DISPLAY = "'Syne', sans-serif";
const FONT_BODY = "'DM Sans', sans-serif";

const normalizeRow = (row) => ({
  id: row.id,
  company: row.applicant_name,
  type: row.loan_type,
  amount: row.loan_amount,
  status: row.status,
  risk: row.risk_level || "low",
  riskScore: row.risk_score || 0,
  submitted: row.created_at ? new Date(row.created_at).toISOString().split("T")[0] : "",
  analyst: row.analyst || "Unassigned",
  industry: row.industry || "",
  abn: row.abn || "",
  notes: row.notes || "",
  documents: row.documents || [],
});

const AUDIT_LOGS = [
  { id: 1, deal: "D001", action: "Status changed to Approved", user: "Tom C.", time: "2026-05-07 14:32", note: "All checks passed. Strong DTI ratio." },
  { id: 2, deal: "D003", action: "Risk flag raised", user: "Swiftlend AI", time: "2026-05-05 09:18", note: "Irregular cash flow detected in months 3, 5, 6." },
  { id: 3, deal: "D002", action: "Sent for human review", user: "Swiftlend AI", time: "2026-05-06 11:05", note: "Medium risk score 54 — requires analyst sign-off." },
  { id: 4, deal: "D007", action: "Status changed to Declined", user: "James L.", time: "2026-05-03 16:44", note: "DTI 3.8x exceeds policy limit of 2.5x." },
  { id: 5, deal: "D006", action: "Status changed to Approved", user: "Tom C.", time: "2026-05-04 10:20", note: "Government contracts provide strong security." },
  { id: 6, deal: "D004", action: "Application received", user: "System", time: "2026-05-08 08:03", note: "Auto-ingested via broker portal." },
];

const LENDERS = [
  { name: "Pepper Money", types: ["Equipment Finance", "Commercial Loan"], risk: ["medium", "high"], maxAmount: 2000000, industries: "all" },
  { name: "Liberty Financial", types: ["Commercial Loan", "Working Capital"], risk: ["low", "medium"], maxAmount: 1000000, industries: "all" },
  { name: "Thinktank", types: ["Equipment Finance", "Commercial Loan"], risk: ["low", "medium"], maxAmount: 5000000, industries: ["Transport", "Construction", "Healthcare", "Manufacturing", "Energy", "Hospitality", "Technology", "Agriculture", "Other"] },
  { name: "La Trobe Financial", types: ["Commercial Loan"], risk: ["medium", "high"], maxAmount: 3000000, industries: "all" },
  { name: "Bluestone", types: ["Equipment Finance", "Working Capital"], risk: ["low"], maxAmount: 500000, industries: "all" },
  { name: "Prospa", types: ["Working Capital"], risk: ["medium"], maxAmount: 150000, industries: "all" },
  { name: "Moula", types: ["Working Capital"], risk: ["low", "medium"], maxAmount: 250000, industries: "all" },
  { name: "OnDeck", types: ["Working Capital", "Equipment Finance"], risk: ["medium"], maxAmount: 300000, industries: "all" },
];

const fmt = (n) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);
const riskColor = (r) => ({ low: T.teal, medium: T.amber, high: T.red }[r] || T.muted);
const riskBg = (r) => ({ low: T.tealDim, medium: T.amberDim, high: T.redDim }[r] || "transparent");
const statusColor = (s) => ({ approved: T.teal, review: T.amber, flagged: T.red, pending: T.mutedMid, declined: T.red }[s] || T.muted);
const statusBg = (s) => ({ approved: T.tealDim, review: T.amberDim, flagged: T.redDim, pending: "rgba(255,255,255,0.06)", declined: T.redDim }[s] || "transparent");
const initials = (name) => name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

async function callClaude(messages, systemPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.map(b => b.text || "").join("") || "";
}

const Badge = ({ label, color, bg }) => (
  <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 9px", borderRadius: 5, background: bg, color, textTransform: "capitalize", whiteSpace: "nowrap" }}>{label}</span>
);

const RiskMeter = ({ score }) => {
  const color = score < 35 ? T.teal : score < 65 ? T.amber : T.red;
  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: T.muted }}>Risk score</span>
        <span style={{ fontSize: 12, fontWeight: 600, color }}>{score}/100</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${score}%`, background: color, borderRadius: 2, transition: "width 0.8s ease" }} />
      </div>
    </div>
  );
};

const Spinner = () => (
  <div style={{ display: "inline-block", width: 14, height: 14, border: `2px solid rgba(0,180,216,0.22)`, borderTopColor: T.teal, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
);

const NAV = [
  { id: "dashboard", icon: "ti-layout-dashboard", label: "Dashboard" },
  { id: "pipeline", icon: "ti-git-branch", label: "Pipeline" },
  { id: "intake", icon: "ti-file-plus", label: "New Application" },
  { id: "risk", icon: "ti-shield-check", label: "Risk Review" },
  { id: "lender", icon: "ti-building-bank", label: "Lender Match" },
  { id: "audit", icon: "ti-clipboard-list", label: "Audit Trail" },
  { id: "admin", icon: "ti-settings", label: "Admin & Billing" },
];

const Sidebar = ({ active, setActive, user, onSignOut }) => (
  <div style={{ width: 220, background: T.navyMid, borderRight: `0.5px solid ${T.navyBorder}`, display: "flex", flexDirection: "column", flexShrink: 0, height: "100vh", position: "sticky", top: 0 }}>
    <div style={{ padding: "20px 20px 16px", borderBottom: `0.5px solid ${T.navyBorder}` }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}>Swift<span style={{ color: T.teal }}>lend</span></div>
      <div style={{ fontSize: 10, color: T.muted, marginTop: 2, letterSpacing: "0.06em" }}>AI CREDIT PLATFORM</div>
    </div>
    <nav style={{ flex: 1, padding: "12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
      {NAV.map(n => (
        <button key={n.id} onClick={() => setActive(n.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer", width: "100%", textAlign: "left", fontFamily: FONT_BODY, fontSize: 13, fontWeight: active === n.id ? 500 : 400, background: active === n.id ? T.tealDim : "transparent", color: active === n.id ? T.teal : T.mutedMid, borderLeft: active === n.id ? `2px solid ${T.teal}` : "2px solid transparent" }}>
          <i className={`ti ${n.icon}`} style={{ fontSize: 15 }} />
          {n.label}
        </button>
      ))}
    </nav>
    <div style={{ padding: "14px 16px", borderTop: `0.5px solid ${T.navyBorder}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: T.tealDim, border: `1px solid ${T.tealBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: T.teal, flexShrink: 0 }}>{user?.initials}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.name}</div>
          <div style={{ fontSize: 10, color: T.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.email}</div>
        </div>
      </div>
      <button onClick={onSignOut} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, border: `0.5px solid ${T.navyBorder}`, background: "transparent", color: T.muted, fontSize: 12, fontFamily: FONT_BODY, cursor: "pointer" }}>
        <i className="ti ti-logout" style={{ fontSize: 14 }} />
        Sign out
      </button>
    </div>
  </div>
);

const Topbar = ({ title, subtitle }) => (
  <div style={{ padding: "18px 32px", borderBottom: `0.5px solid ${T.navyBorder}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
    <div>
      <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 18, letterSpacing: -0.5 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{subtitle}</div>}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ fontSize: 12, color: T.muted }}>{new Date().toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.teal, boxShadow: `0 0 6px ${T.teal}` }} />
      <span style={{ fontSize: 12, color: T.teal }}>Live</span>
    </div>
  </div>
);

const DashboardView = ({ deals, setActive, setSelectedDeal }) => {
  const total = deals.reduce((a, d) => a + d.amount, 0);
  const approved = deals.filter(d => d.status === "approved").length;
  const flagged = deals.filter(d => d.status === "flagged" || d.risk === "high").length;
  const pending = deals.filter(d => d.status === "pending").length;
  const statCard = (label, value, sub, color = T.white) => (
    <div style={{ background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 12, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 8, letterSpacing: "0.04em" }}>{label}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 800, color, letterSpacing: -0.5, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.muted }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        {statCard("Total Pipeline", fmt(total), `${deals.length} active deals`)}
        {statCard("Approved This Week", approved, "deals approved", T.teal)}
        {statCard("Flagged / High Risk", flagged, "requires attention", T.red)}
        {statCard("Pending Review", pending, "awaiting assessment", T.amber)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Recent deals</div>
          {deals.length === 0 ? (
            <div style={{ fontSize: 13, color: T.muted, textAlign: "center", padding: "24px 0" }}>No deals yet — submit your first application.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {deals.slice(0, 5).map(d => (
                <div key={d.id} onClick={() => { setSelectedDeal(d); setActive("risk"); }} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: T.navyMid, borderRadius: 8, cursor: "pointer", border: `0.5px solid ${T.navyBorder}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: 7, background: riskBg(d.risk), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: riskColor(d.risk) }}>{initials(d.company)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>{d.company}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{d.type} · {fmt(d.amount)}</div>
                  </div>
                  <Badge label={d.status} color={statusColor(d.status)} bg={statusBg(d.status)} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 12, padding: 20 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Risk distribution</div>
          {deals.length === 0 ? (
            <div style={{ fontSize: 13, color: T.muted, textAlign: "center", padding: "24px 0" }}>No data yet.</div>
          ) : (
            <>
              {["low", "medium", "high"].map(r => {
                const count = deals.filter(d => d.risk === r).length;
                const pct = Math.round((count / deals.length) * 100);
                return (
                  <div key={r} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 12, color: T.mutedMid, textTransform: "capitalize" }}>{r} risk</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: riskColor(r) }}>{count} deals ({pct}%)</span>
                    </div>
                    <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: riskColor(r), borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop: 20, padding: "12px 14px", background: T.tealDim, border: `0.5px solid rgba(0,180,216,0.2)`, borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: T.teal, fontWeight: 500, marginBottom: 3 }}>Portfolio health</div>
                <div style={{ fontSize: 12, color: T.mutedMid }}>Overall risk is <strong style={{ color: T.teal }}>moderate</strong>. {flagged} deal{flagged !== 1 ? "s" : ""} require{flagged === 1 ? "s" : ""} immediate attention.</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const PipelineView = ({ deals, setActive, setSelectedDeal }) => {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const filtered = deals.filter(d => {
    if (filter !== "all" && d.status !== filter) return false;
    if (search && !d.company.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <div style={{ flex: 1, position: "relative" }}>
          <i className="ti ti-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: T.muted, fontSize: 14 }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies..." style={{ width: "100%", background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 8, padding: "9px 12px 9px 34px", color: T.white, fontSize: 13, fontFamily: FONT_BODY, outline: "none" }} />
        </div>
        {["all", "pending", "review", "flagged", "approved", "declined"].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{ padding: "7px 14px", borderRadius: 7, border: `0.5px solid ${filter === s ? T.teal : T.navyBorder}`, background: filter === s ? T.tealDim : "transparent", color: filter === s ? T.teal : T.muted, fontSize: 12, cursor: "pointer", fontFamily: FONT_BODY, textTransform: "capitalize" }}>{s}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: T.muted }}>
          <i className="ti ti-git-branch" style={{ fontSize: 36, display: "block", marginBottom: 12, opacity: 0.3 }} />
          <div style={{ fontSize: 14, marginBottom: 6 }}>{deals.length === 0 ? "No deals yet" : "No deals match this filter"}</div>
          <div style={{ fontSize: 12 }}>{deals.length === 0 ? "Submit a new application to get started." : "Try a different filter or search."}</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
          {filtered.map(d => (
            <div key={d.id} onClick={() => { setSelectedDeal(d); setActive("risk"); }} style={{ background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 12, padding: 18, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.borderColor = T.tealBorder} onMouseLeave={e => e.currentTarget.style.borderColor = T.navyBorder}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: riskBg(d.risk), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: riskColor(d.risk) }}>{initials(d.company)}</div>
                <Badge label={d.status} color={statusColor(d.status)} bg={statusBg(d.status)} />
              </div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{d.company}</div>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 12 }}>{d.type} · {d.industry}</div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 800, marginBottom: 14 }}>{fmt(d.amount)}</div>
              <RiskMeter score={d.riskScore} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
                <span style={{ fontSize: 11, color: T.muted }}>{d.submitted}</span>
                <span style={{ fontSize: 11, color: T.muted }}>{d.analyst}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const IntakeView = ({ setActive, user, onDealSaved }) => {
  const [form, setForm] = useState({ company: "", abn: "", type: "Equipment Finance", amount: "", industry: "", notes: "" });
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [aiResult, setAiResult] = useState(null);
  const [files, setFiles] = useState([]);
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const runAI = async () => {
    setLoading(true);
    setStep(3);
    try {
      const prompt = `Assess this loan application. Return JSON only, no markdown:\n{"riskScore":number,"riskLevel":"low"|"medium"|"high","summary":"2 sentences","flags":["up to 4 concerns"],"recommendation":"approve"|"review"|"decline","confidence":number}\nCompany: ${form.company}, Industry: ${form.industry}, Type: ${form.type}, Amount: AUD ${form.amount}, Notes: ${form.notes || "None"}`;
      const raw = await callClaude([{ role: "user", content: prompt }], "You are a financial risk AI. Respond only with valid JSON, no markdown, no backticks.");
      const result = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setAiResult(result);
    } catch (e) {
      setAiResult({ riskScore: 45, riskLevel: "medium", summary: "Unable to complete AI assessment. Please review manually.", flags: ["Assessment error — manual review required"], recommendation: "review", confidence: 0 });
    }
    setLoading(false);
  };

  const saveDeal = async () => {
    setSaving(true);
    setSaveError(null);
    console.log("Saving deal, user:", user?.id, "form:", form.company);
    const { data, error } = await supabase.from("deals").insert({
      user_id: user.id,
      applicant_name: form.company,
      loan_amount: Number(form.amount),
      loan_type: form.type,
      status: "pending",
      risk_score: aiResult.riskScore,
      risk_level: aiResult.riskLevel,
      industry: form.industry || null,
      notes: form.notes || null,
      analyst: user.name,
      documents: files.length > 0 ? files : null,
    }).select();
    console.log("Insert result:", { data, error });
    if (error) {
      console.error("Supabase insert error:", error);
      setSaveError(error.message);
      setSaving(false);
      return;
    }
    await onDealSaved();
    setSaving(false);
    setStep(1);
    setAiResult(null);
    setFiles([]);
    setForm({ company: "", abn: "", type: "Equipment Finance", amount: "", industry: "", notes: "" });
    setActive("pipeline");
  };

  const fieldStyle = { width: "100%", background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 8, padding: "10px 14px", color: T.white, fontSize: 13, fontFamily: FONT_BODY, outline: "none", boxSizing: "border-box" };
  const labelStyle = { fontSize: 11, color: T.muted, display: "block", marginBottom: 6, letterSpacing: "0.04em" };
  return (
    <div style={{ padding: 32, maxWidth: 680 }}>
      <div style={{ display: "flex", marginBottom: 32, background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 10, overflow: "hidden" }}>
        {["Application details", "Documents", "AI Assessment"].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: "10px 0", textAlign: "center", fontSize: 12, fontWeight: step === i + 1 ? 500 : 400, background: step === i + 1 ? T.tealDim : "transparent", color: step === i + 1 ? T.teal : T.muted, borderRight: i < 2 ? `0.5px solid ${T.navyBorder}` : "none" }}>
            <span style={{ marginRight: 6, fontSize: 10, opacity: 0.6 }}>0{i + 1}</span>{s}
          </div>
        ))}
      </div>
      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div><label style={labelStyle}>COMPANY NAME</label><input value={form.company} onChange={e => upd("company", e.target.value)} style={fieldStyle} placeholder="e.g. Apex Transport Pty Ltd" /></div>
            <div><label style={labelStyle}>ABN</label><input value={form.abn} onChange={e => upd("abn", e.target.value)} style={fieldStyle} placeholder="XX XXX XXX XXX" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div><label style={labelStyle}>FINANCE TYPE</label><select value={form.type} onChange={e => upd("type", e.target.value)} style={{ ...fieldStyle, cursor: "pointer" }}>{["Equipment Finance", "Commercial Loan", "Working Capital", "Trade Finance", "Asset Finance"].map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label style={labelStyle}>AMOUNT (AUD)</label><input value={form.amount} onChange={e => upd("amount", e.target.value)} style={fieldStyle} placeholder="e.g. 250000" type="number" /></div>
          </div>
          <div><label style={labelStyle}>INDUSTRY</label><select value={form.industry} onChange={e => upd("industry", e.target.value)} style={{ ...fieldStyle, cursor: "pointer" }}><option value="">Select industry…</option>{["Transport", "Construction", "Retail", "Healthcare", "Manufacturing", "Energy", "Hospitality", "Technology", "Agriculture", "Other"].map(i => <option key={i}>{i}</option>)}</select></div>
          <div><label style={labelStyle}>ADDITIONAL NOTES</label><textarea value={form.notes} onChange={e => upd("notes", e.target.value)} rows={3} style={{ ...fieldStyle, resize: "vertical" }} placeholder="Any context about the applicant…" /></div>
          <button onClick={() => setStep(2)} disabled={!form.company || !form.amount} style={{ alignSelf: "flex-start", background: T.teal, color: T.navy, border: "none", padding: "11px 28px", borderRadius: 8, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 14, cursor: "pointer", opacity: (!form.company || !form.amount) ? 0.5 : 1 }}>Continue →</button>
        </div>
      )}
      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: T.navyLight, border: `1.5px dashed ${T.navyBorder}`, borderRadius: 12, padding: 32, textAlign: "center" }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); setFiles(f => [...f, ...Array.from(e.dataTransfer.files).map(fl => fl.name)]); }}>
            <i className="ti ti-cloud-upload" style={{ fontSize: 32, color: T.muted, marginBottom: 12, display: "block" }} />
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Drag and drop documents here</div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>Financials, bank statements, tax returns, quotes</div>
            <label style={{ background: T.tealDim, border: `0.5px solid ${T.tealBorder}`, color: T.teal, padding: "8px 18px", borderRadius: 7, fontSize: 13, cursor: "pointer", fontFamily: FONT_BODY }}>Browse files<input type="file" multiple style={{ display: "none" }} onChange={e => setFiles(f => [...f, ...Array.from(e.target.files).map(fl => fl.name)])} /></label>
          </div>
          {files.length > 0 && <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{files.map((f, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 8 }}><i className="ti ti-file-text" style={{ color: T.teal, fontSize: 14 }} /><span style={{ fontSize: 12, flex: 1 }}>{f}</span><button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: T.muted, cursor: "pointer", fontSize: 14 }}>×</button></div>))}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStep(1)} style={{ background: "transparent", border: `0.5px solid ${T.navyBorder}`, color: T.muted, padding: "10px 20px", borderRadius: 8, fontFamily: FONT_BODY, fontSize: 13, cursor: "pointer" }}>Back</button>
            <button onClick={runAI} style={{ background: T.teal, color: T.navy, border: "none", padding: "10px 28px", borderRadius: 8, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Run AI Assessment →</button>
          </div>
        </div>
      )}
      {step === 3 && (
        <div>
          {loading ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <Spinner />
              <div style={{ marginTop: 16, fontSize: 14, color: T.muted }}>Swiftlend AI is analysing the application…</div>
            </div>
          ) : aiResult && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ background: riskBg(aiResult.riskLevel), border: `0.5px solid ${riskColor(aiResult.riskLevel)}33`, borderRadius: 12, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  <div style={{ fontFamily: FONT_DISPLAY, fontSize: 48, fontWeight: 800, color: riskColor(aiResult.riskLevel), letterSpacing: -2 }}>{aiResult.riskScore}</div>
                  <div><div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700 }}>Risk Score</div><Badge label={aiResult.riskLevel + " risk"} color={riskColor(aiResult.riskLevel)} bg={riskBg(aiResult.riskLevel)} /></div>
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: T.muted, marginBottom: 3 }}>Recommendation</div>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, textTransform: "capitalize", color: aiResult.recommendation === "approve" ? T.teal : aiResult.recommendation === "decline" ? T.red : T.amber }}>{aiResult.recommendation}</div>
                    <div style={{ fontSize: 11, color: T.muted }}>{aiResult.confidence}% confidence</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: T.mutedMid, lineHeight: 1.6, marginBottom: 14 }}>{aiResult.summary}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{aiResult.flags?.map((f, i) => (<div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.mutedMid }}>▲ {f}</div>))}</div>
              </div>
              {saveError && (
                <div style={{ background: T.redDim, border: `0.5px solid rgba(255,107,107,0.3)`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: T.red }}>
                  Save failed: {saveError}
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setStep(1); setAiResult(null); setFiles([]); setSaveError(null); setForm({ company: "", abn: "", type: "Equipment Finance", amount: "", industry: "", notes: "" }); }} style={{ background: "transparent", border: `0.5px solid ${T.navyBorder}`, color: T.muted, padding: "10px 20px", borderRadius: 8, fontFamily: FONT_BODY, fontSize: 13, cursor: "pointer" }}>New Application</button>
                <button onClick={saveDeal} disabled={saving} style={{ background: T.teal, color: T.navy, border: "none", padding: "10px 24px", borderRadius: 8, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1, display: "flex", alignItems: "center", gap: 8 }}>
                  {saving ? <><Spinner /> Saving…</> : "Save & View in Pipeline →"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const RiskView = ({ deals, selectedDeal, setSelectedDeal }) => {
  const [deal, setDeal] = useState(selectedDeal || null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (selectedDeal) {
      setDeal(selectedDeal);
    } else if (!deal && deals.length > 0) {
      setDeal(deals[0]);
    }
  }, [selectedDeal, deals]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

  const runAnalysis = async () => {
    if (!deal) return;
    setLoading(true);
    setAiAnalysis(null);
    try {
      const raw = await callClaude([{ role: "user", content: `Analyse this loan for risk. Return JSON only:\n{"riskScore":number,"riskLevel":"low"|"medium"|"high","summary":"2 sentences","positives":["up to 3"],"concerns":["up to 4"],"recommendation":"approve"|"review"|"decline","confidence":number,"nextSteps":["1-3 steps"]}\nDeal: ${deal.company} | ${deal.type} | AUD ${deal.amount.toLocaleString()} | ${deal.industry}\nNotes: ${deal.notes}` }], "Financial risk analyst AI. Return only valid JSON.");
      const result = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setAiAnalysis(result);
    } catch {
      setAiAnalysis({ riskScore: deal.riskScore, riskLevel: deal.risk, summary: deal.notes, positives: ["Established business"], concerns: ["Requires further review"], recommendation: "review", confidence: 70, nextSteps: ["Request updated financials"] });
    }
    setLoading(false);
  };

  const sendChat = async () => {
    if (!chatInput.trim() || !deal) return;
    const msg = chatInput.trim();
    setChatInput("");
    const newHistory = [...chatHistory, { role: "user", content: msg }];
    setChatHistory(newHistory);
    setChatLoading(true);
    try {
      const reply = await callClaude(newHistory, `You are Swiftlend AI helping a broker. Be concise and professional. Context: ${deal.company}, ${deal.type}, AUD ${deal.amount.toLocaleString()}, risk score ${deal.riskScore}/100, notes: ${deal.notes}`);
      setChatHistory(h => [...h, { role: "assistant", content: reply }]);
    } catch {
      setChatHistory(h => [...h, { role: "assistant", content: "Sorry, I could not process that. Please try again." }]);
    }
    setChatLoading(false);
  };

  if (!deal && deals.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: T.muted }}>
        <i className="ti ti-shield-check" style={{ fontSize: 40, display: "block", marginBottom: 14, opacity: 0.3 }} />
        <div style={{ fontSize: 14, marginBottom: 6, color: T.mutedMid }}>No deals to review</div>
        <div style={{ fontSize: 12 }}>Submit a new application to get started.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 300px", height: "100%", minHeight: 0 }}>
      <div style={{ borderRight: `0.5px solid ${T.navyBorder}`, overflowY: "auto", padding: "16px 10px" }}>
        <div style={{ fontSize: 10, color: T.muted, letterSpacing: "0.08em", padding: "0 8px", marginBottom: 8 }}>ALL DEALS</div>
        {deals.map(d => (
          <div key={d.id} onClick={() => { setDeal(d); setAiAnalysis(null); setChatHistory([]); }} style={{ padding: "10px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 4, background: deal?.id === d.id ? T.tealDim : "transparent", border: `0.5px solid ${deal?.id === d.id ? T.tealBorder : "transparent"}` }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2, color: deal?.id === d.id ? T.teal : T.white }}>{d.company}</div>
            <div style={{ fontSize: 10, color: T.muted, marginBottom: 4 }}>{fmt(d.amount)}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: riskColor(d.risk) }} /><span style={{ fontSize: 10, color: riskColor(d.risk) }}>{d.risk} risk</span></div>
          </div>
        ))}
      </div>
      {deal && (
        <>
          <div style={{ overflowY: "auto", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>{deal.company}</div>
                <div style={{ fontSize: 12, color: T.muted }}>{deal.type} · {deal.industry} · ABN {deal.abn}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge label={deal.status} color={statusColor(deal.status)} bg={statusBg(deal.status)} />
                <button onClick={runAnalysis} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, background: T.teal, color: T.navy, border: "none", padding: "8px 16px", borderRadius: 7, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                  {loading ? <><Spinner /> Analysing…</> : "Run AI Analysis"}
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
              {[["Amount", fmt(deal.amount)], ["Submitted", deal.submitted], ["Analyst", deal.analyst]].map(([l, v]) => (
                <div key={l} style={{ background: T.navyLight, borderRadius: 10, padding: "12px 14px", border: `0.5px solid ${T.navyBorder}` }}>
                  <div style={{ fontSize: 10, color: T.muted, marginBottom: 4, letterSpacing: "0.04em" }}>{l.toUpperCase()}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: FONT_DISPLAY }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 20 }}><RiskMeter score={aiAnalysis?.riskScore ?? deal.riskScore} /></div>
            {aiAnalysis && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 11, color: T.muted, marginBottom: 8, letterSpacing: "0.04em" }}>AI SUMMARY</div>
                  <p style={{ fontSize: 13, color: T.mutedMid, lineHeight: 1.65, marginBottom: 12 }}>{aiAnalysis.summary}</p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 11, color: T.muted }}>Recommendation:</span>
                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: "capitalize", color: aiAnalysis.recommendation === "approve" ? T.teal : aiAnalysis.recommendation === "decline" ? T.red : T.amber }}>{aiAnalysis.recommendation}</span>
                    <span style={{ fontSize: 11, color: T.muted }}>· {aiAnalysis.confidence}% confidence</span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ background: T.tealDim, border: `0.5px solid ${T.tealBorder}`, borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 10, color: T.teal, marginBottom: 8, letterSpacing: "0.06em", fontWeight: 600 }}>POSITIVE SIGNALS</div>
                    {aiAnalysis.positives?.map((p, i) => <div key={i} style={{ fontSize: 12, color: T.mutedMid, marginBottom: 5 }}>✓ {p}</div>)}
                  </div>
                  <div style={{ background: T.redDim, border: `0.5px solid rgba(255,107,107,0.2)`, borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 10, color: T.red, marginBottom: 8, letterSpacing: "0.06em", fontWeight: 600 }}>RISK CONCERNS</div>
                    {aiAnalysis.concerns?.map((c, i) => <div key={i} style={{ fontSize: 12, color: T.mutedMid, marginBottom: 5 }}>▲ {c}</div>)}
                  </div>
                </div>
                <div style={{ background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 10, color: T.muted, marginBottom: 8, letterSpacing: "0.04em" }}>RECOMMENDED NEXT STEPS</div>
                  {aiAnalysis.nextSteps?.map((s, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                      <div style={{ width: 18, height: 18, borderRadius: "50%", background: T.tealDim, border: `0.5px solid ${T.tealBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: T.teal, flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                      <span style={{ fontSize: 12, color: T.mutedMid, lineHeight: 1.5 }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!aiAnalysis && !loading && (
              <div style={{ textAlign: "center", padding: "40px 0", color: T.muted }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
                <div style={{ fontSize: 14, marginBottom: 6 }}>No AI analysis yet</div>
                <div style={{ fontSize: 12 }}>Click "Run AI Analysis" to assess this deal</div>
              </div>
            )}
          </div>
          <div style={{ borderLeft: `0.5px solid ${T.navyBorder}`, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "14px 16px", borderBottom: `0.5px solid ${T.navyBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: 6, background: T.tealDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: T.teal }}>🤖</div>
              <div><div style={{ fontSize: 12, fontWeight: 600 }}>Swiftlend AI</div><div style={{ fontSize: 10, color: T.teal }}>Online</div></div>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 10px", display: "flex", flexDirection: "column", gap: 10, minHeight: 200 }}>
              {chatHistory.length === 0 && <div style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: "20px 0" }}>Ask me anything about this deal.</div>}
              {chatHistory.map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 8, flexDirection: m.role === "user" ? "row-reverse" : "row" }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: m.role === "user" ? T.navyLight : T.tealDim, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: m.role === "user" ? T.mutedMid : T.teal, fontWeight: 600 }}>{m.role === "user" ? "ME" : "AI"}</div>
                  <div style={{ maxWidth: "80%", background: m.role === "user" ? T.navyLight : T.tealDim, border: `0.5px solid ${m.role === "user" ? T.navyBorder : T.tealBorder}`, borderRadius: 10, padding: "8px 12px", fontSize: 12, lineHeight: 1.55, color: T.mutedMid }}>{m.content}</div>
                </div>
              ))}
              {chatLoading && <div style={{ display: "flex", gap: 8 }}><div style={{ width: 26, height: 26, borderRadius: "50%", background: T.tealDim, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner /></div><div style={{ background: T.tealDim, border: `0.5px solid ${T.tealBorder}`, borderRadius: 10, padding: "8px 12px", fontSize: 12, color: T.muted }}>Thinking…</div></div>}
              <div ref={chatEndRef} />
            </div>
            <div style={{ padding: "10px 12px", borderTop: `0.5px solid ${T.navyBorder}`, display: "flex", gap: 8 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChat()} placeholder="Ask about this deal…" style={{ flex: 1, background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 7, padding: "8px 12px", color: T.white, fontSize: 12, fontFamily: FONT_BODY, outline: "none" }} />
              <button onClick={sendChat} style={{ background: T.teal, color: T.navy, border: "none", borderRadius: 7, padding: "8px 12px", cursor: "pointer", fontSize: 14 }}>→</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const LenderMatchView = ({ deals }) => {
  const [deal, setDeal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (deals.length > 0 && !deal) setDeal(deals[0]);
  }, [deals]);

  const likelihoodColor = (l) => ({ High: T.teal, Medium: T.amber, Low: T.red }[l] || T.muted);
  const likelihoodBg = (l) => ({ High: T.tealDim, Medium: T.amberDim, Low: T.redDim }[l] || "transparent");

  const runMatch = async () => {
    if (!deal) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const lenderSummary = LENDERS.map(l =>
        `${l.name}: types=${l.types.join(", ")}, accepted risk=${l.risk.join("/")}, max=AUD ${l.maxAmount.toLocaleString()}, industries=${Array.isArray(l.industries) ? l.industries.join(", ") : l.industries}`
      ).join("\n");
      const prompt = `Analyse this loan deal against the lenders below. Return JSON only, no markdown, no backticks.\n\nDeal: ${deal.company} | Type: ${deal.type} | Amount: AUD ${deal.amount.toLocaleString()} | Industry: ${deal.industry} | Risk: ${deal.risk} (score ${deal.riskScore}/100) | Notes: ${deal.notes}\n\nLenders:\n${lenderSummary}\n\nReturn this exact JSON structure:\n{"matches":[{"lenderName":"...","matchScore":85,"reason":"one sentence why they match","likelihood":"High"},{"lenderName":"...","matchScore":70,"reason":"one sentence","likelihood":"Medium"},{"lenderName":"...","matchScore":55,"reason":"one sentence","likelihood":"Low"}],"ruledOut":[{"lenderName":"...","reason":"one sentence why ruled out"}]}\n\nPut the top 3 best-fit lenders in matches ranked by matchScore. All remaining lenders go in ruledOut.`;
      const raw = await callClaude([{ role: "user", content: prompt }], "You are a commercial lending specialist. Analyse deal-lender compatibility and return only valid JSON, no markdown.");
      const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
      setResult(parsed);
    } catch {
      setError("AI matching failed. Please try again.");
    }
    setLoading(false);
  };

  if (deals.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: T.muted }}>
        <i className="ti ti-building-bank" style={{ fontSize: 40, display: "block", marginBottom: 14, opacity: 0.3 }} />
        <div style={{ fontSize: 14, marginBottom: 6, color: T.mutedMid }}>No deals available</div>
        <div style={{ fontSize: 12 }}>Submit a new application first to run lender matching.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 860 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end", marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, letterSpacing: "0.04em" }}>SELECT DEAL</div>
          <select
            value={deal?.id || ""}
            onChange={e => { setDeal(deals.find(d => d.id === e.target.value)); setResult(null); setError(null); }}
            style={{ width: "100%", background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 8, padding: "10px 14px", color: T.white, fontSize: 13, fontFamily: FONT_BODY, outline: "none", cursor: "pointer" }}
          >
            {deals.map(d => (
              <option key={d.id} value={d.id}>{d.company} — {d.type} — {fmt(d.amount)}</option>
            ))}
          </select>
        </div>
        <button
          onClick={runMatch}
          disabled={loading || !deal}
          style={{ display: "flex", alignItems: "center", gap: 8, background: T.teal, color: T.navy, border: "none", padding: "11px 24px", borderRadius: 8, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1, whiteSpace: "nowrap" }}
        >
          {loading ? <><Spinner /> Matching…</> : <><i className="ti ti-building-bank" style={{ fontSize: 15 }} /> Find Lenders</>}
        </button>
      </div>

      {deal && (
        <div style={{ background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 10, padding: "14px 18px", marginBottom: 28, display: "flex", gap: 20, alignItems: "center" }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, background: riskBg(deal.risk), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: riskColor(deal.risk), flexShrink: 0 }}>{initials(deal.company)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{deal.company}</div>
            <div style={{ fontSize: 12, color: T.muted }}>{deal.type} · {deal.industry} · {fmt(deal.amount)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: T.muted, marginBottom: 2, letterSpacing: "0.04em" }}>RISK SCORE</div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 800, color: riskColor(deal.risk) }}>{deal.riskScore}/100</div>
          </div>
          <Badge label={deal.risk + " risk"} color={riskColor(deal.risk)} bg={riskBg(deal.risk)} />
        </div>
      )}

      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Spinner />
          <div style={{ marginTop: 16, fontSize: 14, color: T.muted }}>Swiftlend AI is analysing lender compatibility…</div>
        </div>
      )}

      {error && !loading && (
        <div style={{ background: T.redDim, border: `0.5px solid rgba(255,107,107,0.3)`, borderRadius: 10, padding: "14px 18px", color: T.red, fontSize: 13 }}>{error}</div>
      )}

      {result && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Top lender matches</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {result.matches?.map((m, i) => (
                <div key={m.lenderName} style={{ background: T.navyLight, border: `0.5px solid ${i === 0 ? T.tealBorder : T.navyBorder}`, borderRadius: 12, padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: T.tealDim, border: `0.5px solid ${T.tealBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_DISPLAY, fontSize: 12, fontWeight: 800, color: T.teal, flexShrink: 0 }}>#{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 5 }}>
                        <span style={{ fontFamily: FONT_DISPLAY, fontSize: 15, fontWeight: 700 }}>{m.lenderName}</span>
                        <Badge label={m.likelihood} color={likelihoodColor(m.likelihood)} bg={likelihoodBg(m.likelihood)} />
                      </div>
                      <p style={{ fontSize: 12, color: T.mutedMid, lineHeight: 1.6 }}>{m.reason}</p>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 28, fontWeight: 800, color: likelihoodColor(m.likelihood), letterSpacing: -1 }}>{m.matchScore}</div>
                      <div style={{ fontSize: 10, color: T.muted }}>match score</div>
                    </div>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, marginBottom: 14 }}>
                    <div style={{ height: "100%", width: `${m.matchScore}%`, background: likelihoodColor(m.likelihood), borderRadius: 2, transition: "width 0.8s ease" }} />
                  </div>
                  <button style={{ background: T.teal, color: T.navy, border: "none", padding: "8px 20px", borderRadius: 7, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                    Submit to Lender →
                  </button>
                </div>
              ))}
            </div>
          </div>

          {result.ruledOut?.length > 0 && (
            <div>
              <div style={{ fontFamily: FONT_DISPLAY, fontSize: 13, fontWeight: 700, marginBottom: 12, color: T.muted }}>Why not matched</div>
              <div style={{ background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 12, overflow: "hidden" }}>
                {result.ruledOut.map((r, i) => (
                  <div key={r.lenderName} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 18px", borderBottom: i < result.ruledOut.length - 1 ? `0.5px solid ${T.navyBorder}` : "none" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.mutedMid, minWidth: 150 }}>{r.lenderName}</span>
                    <span style={{ fontSize: 12, color: T.muted }}>{r.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!result && !loading && !error && (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <i className="ti ti-building-bank" style={{ fontSize: 40, display: "block", marginBottom: 14, color: T.muted, opacity: 0.4 }} />
          <div style={{ fontSize: 14, marginBottom: 6, color: T.mutedMid }}>No match results yet</div>
          <div style={{ fontSize: 12, color: T.muted }}>Select a deal above and click "Find Lenders" to run AI lender matching</div>
        </div>
      )}
    </div>
  );
};

const AuditView = ({ deals }) => (
  <div style={{ padding: 32 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {AUDIT_LOGS.map((log, i) => {
        const d = deals.find(d => d.id === log.deal);
        return (
          <div key={log.id} style={{ display: "flex", gap: 16, padding: "16px 0", borderBottom: `0.5px solid ${T.navyBorder}` }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 32 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: log.user === "Swiftlend AI" ? T.teal : log.user === "System" ? T.muted : T.amber, flexShrink: 0, marginTop: 4 }} />
              {i < AUDIT_LOGS.length - 1 && <div style={{ width: 1, flex: 1, background: T.navyBorder, marginTop: 4 }} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{log.action}</span>
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: T.tealDim, color: T.teal }}>{log.deal}</span>
              </div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{log.note}</div>
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: T.muted }}>
                <span>{log.user}</span>
                <span>{log.time}</span>
                {d && <span>{d.company}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const AdminView = () => (
  <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 28 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
      {[
        { name: "Starter", price: "$299", desc: "Up to 50 applications/mo", features: ["AI risk scoring", "Document ingestion", "Basic audit trail"] },
        { name: "Growth", price: "$799", desc: "Up to 250 applications/mo", features: ["Everything in Starter", "Custom lending rules", "Portfolio analytics", "Priority support"], featured: true },
        { name: "Enterprise", price: "Custom", desc: "Unlimited applications", features: ["Everything in Growth", "Custom AI tuning", "CRM integrations", "SLA guarantee"] },
      ].map(p => (
        <div key={p.name} style={{ background: T.navyLight, border: `${p.featured ? "1.5px" : "0.5px"} solid ${p.featured ? T.teal : T.navyBorder}`, borderRadius: 14, padding: 22, position: "relative" }}>
          {p.featured && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: T.teal, color: T.navy, fontSize: 10, fontWeight: 700, padding: "3px 12px", borderRadius: 20, whiteSpace: "nowrap" }}>Most popular</div>}
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{p.name}</div>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 16 }}>{p.desc}</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: 800, letterSpacing: -1, marginBottom: 16 }}>{p.price}<span style={{ fontSize: 12, fontWeight: 400, color: T.muted }}>{p.price !== "Custom" ? "/mo" : ""}</span></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{p.features.map(f => <div key={f} style={{ display: "flex", gap: 8, fontSize: 12, color: T.mutedMid }}>✓ {f}</div>)}</div>
        </div>
      ))}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div style={{ background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Current billing</div>
        {[["Plan", "Growth"], ["Billing cycle", "Monthly"], ["Next renewal", "1 June 2026"], ["Applications used", "187 / 250"], ["Seats", "2 analysts"]].map(([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `0.5px solid ${T.navyBorder}`, fontSize: 13 }}>
            <span style={{ color: T.muted }}>{l}</span><span style={{ fontWeight: 500 }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Team members</div>
        {[
          { name: "Thomas Cason", role: "Broker", email: "thomas@swiftlend.com.au" },
          { name: "James L.", role: "Analyst", email: "james.l@swiftlend.com.au" },
        ].map(u => (
          <div key={u.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `0.5px solid ${T.navyBorder}` }}>
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: T.tealDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: T.teal }}>{initials(u.name)}</div>
            <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 500 }}>{u.name}</div><div style={{ fontSize: 11, color: T.muted }}>{u.email}</div></div>
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: T.navyBorder, color: T.muted }}>{u.role}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const LoginView = ({ onLogin }) => {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    const sbUser = data.user;
    const displayName = sbUser.user_metadata?.full_name || sbUser.email.split("@")[0];
    const words = displayName.trim().split(" ");
    const userInitials = words.length >= 2
      ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
      : displayName.slice(0, 2).toUpperCase();
    onLogin({ email: sbUser.email, name: displayName, role: sbUser.user_metadata?.role || "Broker", initials: userInitials, id: sbUser.id });
    setLoading(false);
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    const { error: authError } = await supabase.auth.signUp({ email: email.trim(), password });
    if (authError) {
      setError(authError.message);
    } else {
      setMessage("Account created. Check your email to confirm before signing in.");
      setMode("signin");
    }
    setLoading(false);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (authError) {
      setError(authError.message);
    } else {
      setMessage("Password reset email sent. Check your inbox.");
    }
    setLoading(false);
  };

  const fieldStyle = {
    width: "100%", background: T.navyLight, border: `0.5px solid ${T.navyBorder}`, borderRadius: 8,
    padding: "11px 14px", color: T.white, fontSize: 13, fontFamily: FONT_BODY, outline: "none", boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 11, color: T.muted, display: "block", marginBottom: 7, letterSpacing: "0.05em" };

  const headings = {
    signin: { title: "Welcome back", sub: "Sign in to your broker portal" },
    signup: { title: "Create account", sub: "Get started with Swiftlend" },
    reset:  { title: "Reset password", sub: "We'll send a reset link to your email" },
  };

  return (
    <div style={{ minHeight: "100vh", background: T.navy, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(0,180,216,0.13) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: "linear-gradient(90deg, transparent, rgba(0,180,216,0.15), transparent)" }} />

      <div style={{ width: "100%", maxWidth: 420, padding: "0 24px", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: 36, letterSpacing: -1.5, marginBottom: 10 }}>
            Swift<span style={{ color: T.teal }}>lend</span>
          </div>
          <div style={{ fontSize: 11, color: T.muted, letterSpacing: "0.12em" }}>AI CREDIT PLATFORM</div>
          <div style={{ width: 40, height: 2, background: `linear-gradient(90deg, transparent, ${T.teal}, transparent)`, margin: "16px auto 0" }} />
        </div>

        <div style={{ background: T.navyMid, border: `0.5px solid ${T.navyBorder}`, borderRadius: 16, padding: "36px 32px", boxShadow: "0 24px 64px rgba(0,0,0,0.4)" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{headings[mode].title}</div>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 32 }}>{headings[mode].sub}</div>

          {message && (
            <div style={{ background: T.tealDim, border: `0.5px solid ${T.tealBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: T.teal, marginBottom: 20 }}>
              {message}
            </div>
          )}

          <form onSubmit={mode === "signin" ? handleSignIn : mode === "signup" ? handleSignUp : handleReset} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div>
              <label style={labelStyle}>EMAIL ADDRESS</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@swiftlend.com.au" required autoFocus
                style={fieldStyle}
                onFocus={e => e.target.style.borderColor = T.teal}
                onBlur={e => e.target.style.borderColor = T.navyBorder}
              />
            </div>

            {mode !== "reset" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>PASSWORD</label>
                  {mode === "signin" && (
                    <button type="button" onClick={() => switchMode("reset")} style={{ background: "none", border: "none", color: T.teal, fontSize: 11, cursor: "pointer", fontFamily: FONT_BODY, padding: 0 }}>
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••" required minLength={6}
                  style={fieldStyle}
                  onFocus={e => e.target.style.borderColor = T.teal}
                  onBlur={e => e.target.style.borderColor = T.navyBorder}
                />
              </div>
            )}

            {mode === "signup" && (
              <div>
                <label style={labelStyle}>CONFIRM PASSWORD</label>
                <input
                  type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••" required minLength={6}
                  style={fieldStyle}
                  onFocus={e => e.target.style.borderColor = T.teal}
                  onBlur={e => e.target.style.borderColor = T.navyBorder}
                />
              </div>
            )}

            {error && (
              <div style={{ background: "rgba(255,107,107,0.1)", border: `0.5px solid rgba(255,107,107,0.3)`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: T.red }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{ width: "100%", background: T.teal, color: T.navy, border: "none", borderRadius: 8, padding: "13px 0", fontFamily: FONT_BODY, fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.8 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}
            >
              {loading ? <><Spinner /> {mode === "signin" ? "Signing in…" : mode === "signup" ? "Creating account…" : "Sending reset email…"}</> :
                mode === "signin" ? "Sign in →" : mode === "signup" ? "Create account →" : "Send reset email →"}
            </button>
          </form>

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: `0.5px solid ${T.navyBorder}`, textAlign: "center" }}>
            {mode === "signin" && (
              <span style={{ fontSize: 13, color: T.muted }}>
                Don't have an account?{" "}
                <button type="button" onClick={() => switchMode("signup")} style={{ background: "none", border: "none", color: T.teal, fontSize: 13, cursor: "pointer", fontFamily: FONT_BODY, padding: 0, fontWeight: 500 }}>
                  Create account
                </button>
              </span>
            )}
            {(mode === "signup" || mode === "reset") && (
              <button type="button" onClick={() => switchMode("signin")} style={{ background: "none", border: "none", color: T.muted, fontSize: 13, cursor: "pointer", fontFamily: FONT_BODY, padding: 0 }}>
                ← Back to sign in
              </button>
            )}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 28, fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
          Swiftlend · AI-powered commercial lending · Australia
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [active, setActive] = useState("dashboard");
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [deals, setDeals] = useState([]);

  const buildUser = (sbUser) => {
    const displayName = sbUser.user_metadata?.full_name || sbUser.email.split("@")[0];
    const words = displayName.trim().split(" ");
    const userInitials = words.length >= 2
      ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
      : displayName.slice(0, 2).toUpperCase();
    return { email: sbUser.email, name: displayName, role: sbUser.user_metadata?.role || "Broker", initials: userInitials, id: sbUser.id };
  };

  const fetchDeals = async (userId) => {
    const { data } = await supabase
      .from("deals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data) setDeals(data.map(normalizeRow));
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = buildUser(session.user);
        setUser(u);
        fetchDeals(u.id);
      }
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const u = buildUser(session.user);
        setUser(u);
        fetchDeals(u.id);
      } else {
        setUser(null);
        setDeals([]);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setActive("dashboard");
    setSelectedDeal(null);
    setDeals([]);
  };

  const PAGE_TITLES = {
    dashboard: ["Dashboard", `Good morning, ${user?.name || ""} — welcome to Swiftlend`],
    pipeline: ["Deal Pipeline", `${deals.length} active application${deals.length !== 1 ? "s" : ""}`],
    intake: ["New Application", "Submit and AI-assess a new finance application"],
    risk: ["Risk Review", "AI-powered deal assessment with live chat"],
    lender: ["Lender Match", "AI-powered lender compatibility matching"],
    audit: ["Audit Trail", "Full compliance log of all decisions and AI actions"],
    admin: ["Admin & Billing", "Manage your plan, team, and account settings"],
  };
  const [title, subtitle] = PAGE_TITLES[active] || ["Swiftlend", ""];

  const renderView = () => {
    switch (active) {
      case "dashboard": return <DashboardView deals={deals} setActive={setActive} setSelectedDeal={setSelectedDeal} />;
      case "pipeline": return <PipelineView deals={deals} setActive={setActive} setSelectedDeal={setSelectedDeal} />;
      case "intake": return <IntakeView setActive={setActive} user={user} onDealSaved={() => fetchDeals(user.id)} />;
      case "risk": return <RiskView deals={deals} selectedDeal={selectedDeal} setSelectedDeal={setSelectedDeal} />;
      case "lender": return <LenderMatchView deals={deals} />;
      case "audit": return <AuditView deals={deals} />;
      case "admin": return <AdminView />;
      default: return null;
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #071A2C; color: #ffffff; font-family: 'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        input::placeholder, textarea::placeholder { color: rgba(255,255,255,0.25); }
        select option { background: #0D2640; }
      `}</style>
      {authLoading ? (
        <div style={{ minHeight: "100vh", background: T.navy, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spinner />
        </div>
      ) : !user ? (
        <LoginView onLogin={setUser} />
      ) : (
        <div style={{ display: "flex", height: "100vh", background: "#071A2C", overflow: "hidden" }}>
          <Sidebar active={active} setActive={(v) => { setActive(v); if (v !== "risk") setSelectedDeal(null); }} user={user} onSignOut={handleSignOut} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Topbar title={title} subtitle={subtitle} />
            <div style={{ flex: 1, overflowY: active === "risk" ? "hidden" : "auto" }}>{renderView()}</div>
          </div>
        </div>
      )}
    </>
  );
}
