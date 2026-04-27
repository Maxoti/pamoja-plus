import { useEffect, useState } from "react";
import { collection, query, onSnapshot, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import type { Timestamp } from "firebase/firestore";
import { pageStyles } from "../styles/pageStyles";

const TENANT_ID = "tenant_001";

interface AuditLog {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: Timestamp;
}
 const now = Date.now();

const ACTION_CONFIG: Record<string, {  color: string; bg: string; label: string }> = {
  CREATE_CONTRIBUTION: {  color: "#16A34A", bg: "#EDFAF2", label: "Contribution recorded" },
  CONTRIBUTION_VERIFIED: {   color: "#16A34A", bg: "#EDFAF2", label: "Contribution verified" },
  CONTRIBUTION_REJECTED: {  color: "#DC2626", bg: "#FEF2F2", label: "Contribution rejected" },
  CONTRIBUTION_FLAGGED: {  color: "#EA580C", bg: "#FFF7ED", label: "Contribution flagged" },
  CREATE_PLEDGE: {  color: "#2563EB", bg: "#EFF6FF", label: "Pledge added" },
  INVITE_MEMBER: {  color: "#7C3AED", bg: "#F5F0FF", label: "Member invited" },
  CREATE_MEETING: {  color: "#0891B2", bg: "#ECFEFF", label: "Meeting scheduled" },
  CREATE_ANNOUNCEMENT: {  color: "#B45309", bg: "#FEF9EC", label: "Announcement posted" },
  CREATE_PAYOUT: {  color: "#C8891A", bg: "#FDF8F0", label: "Payout initiated" },
};

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");

  useEffect(() => {
    const q = query(
      collection(db, `tenants/${TENANT_ID}/auditLogs`),
      orderBy("timestamp", "desc"),
      limit(200)
    );
    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const uniqueActions = [...new Set(logs.map((l) => l.action))];

  const filtered = logs.filter((l) => {
    const matchSearch =
      l.actorUserId.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.entityId.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filterAction === "all" || l.action === filterAction;
    return matchSearch && matchFilter;
  });


const timeAgo = (ts: Timestamp) => {
  const diff = now - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "Just now";
};

  const cfg = (action: string) =>
    ACTION_CONFIG[action] || { icon: "◉", color: "#6B7280", bg: "#F3F4F6", label: action };

  return (
    <div className="page">
      <style>{pageStyles}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-sub">Complete immutable history — every action, every actor, every timestamp</p>
        </div>
        <div style={{ background: "#FEF9EC", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#92400E", display: "flex", alignItems: "center", gap: 8 }}>
           Read-only — cannot be modified
        </div>
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total Actions</div>
          <div className="stat-value">{logs.length}</div>
          <div className="stat-sub">all time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Today</div>
          <div className="stat-value">
            {logs.filter((l) => {
              const d = l.timestamp?.toDate();
              const now = new Date();
              return d?.toDateString() === now.toDateString();
            }).length}
          </div>
          <div className="stat-sub">actions today</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Action Types</div>
          <div className="stat-value">{uniqueActions.length}</div>
          <div className="stat-sub">distinct events</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Action</div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {logs.length > 0 ? timeAgo(logs[0].timestamp) : "—"}
          </div>
          <div className="stat-sub">{logs.length > 0 ? cfg(logs[0].action).label : "No logs"}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search by actor, action, or entity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={{ padding: "10px 16px", border: "1.5px solid #E8E8E0", borderRadius: 100, fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", cursor: "pointer", background: "white" }}
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
        >
          <option value="all">All actions</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"></div>
            <div className="empty-title">No audit logs found</div>
            <div className="empty-sub">Actions in the system will appear here automatically.</div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div style={{ padding: "8px 0" }}>
            {filtered.map((log, i) => {
              const c = cfg(log.action);
              const showDate = i === 0 ||
                log.timestamp?.toDate().toDateString() !== filtered[i - 1]?.timestamp?.toDate().toDateString();

              return (
                <div key={log.id}>
                  {showDate && (
                    <div style={{ padding: "12px 20px 4px", fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#BBB" }}>
                      {log.timestamp?.toDate().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </div>
                  )}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 16, padding: "14px 20px",
                    borderBottom: i < filtered.length - 1 ? "1px solid #F7F7F4" : "none",
                    transition: "background 0.15s",
                  }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAF7")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {/* Icon */}
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, background: c.bg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, flexShrink: 0,
                    }}>
                    </div>

                    {/* Action */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A1A" }}>{c.label}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, background: c.bg, color: c.color, padding: "2px 8px", borderRadius: 100, letterSpacing: 0.5 }}>
                          {log.action}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#AAA" }}>
                        By <strong style={{ color: "#888" }}>{log.actorUserId}</strong>
                        {log.entityId && <> · Entity: <span style={{ fontFamily: "monospace", color: "#555" }}>{log.entityId}</span></>}
                        · Type: <span style={{ color: "#888" }}>{log.entityType}</span>
                      </div>
                    </div>

                    {/* Time */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#555" }}>{timeAgo(log.timestamp)}</div>
                      <div style={{ fontSize: 11, color: "#BBB", marginTop: 2 }}>
                        {log.timestamp?.toDate().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Footer note */}
      <div style={{ textAlign: "center", fontSize: 12, color: "#BBB", marginTop: 24, padding: "16px" }}>
         Audit logs are immutable. No record can be edited or deleted. Showing last 200 actions.
      </div>
    </div>
  );
}