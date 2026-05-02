import { useEffect, useMemo, useState } from "react";
import {
  query,
  onSnapshot,
  orderBy,
  limit,
  getDocs,
  collection,
  where,
  type Timestamp,
} from "firebase/firestore";
import { db, resolveTenantId, auditLogsCol } from "../firebase";
import { pageStyles } from "../styles/pageStyles";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditLog {
  id:          string;
  actorUserId: string;
  action:      string;
  entityType:  string;
  entityId:    string;
  timestamp:   Timestamp;
}

interface MemberSnapshot {
  uid:   string;
  name:  string;
  email: string;
  role:  string;
}

interface EnrichedLog extends AuditLog {
  actorName:  string;
  actorEmail: string;
  actorRole:  string;
}

// ── Action config ─────────────────────────────────────────────────────────────

const ACTIONS: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  TENANT_CREATED:        { label: "Group registered",       color: "#1A3A2A", bg: "#F0F7F3", icon: "🏛️" },
  CREATE_CONTRIBUTION:   { label: "Contribution recorded",  color: "#16A34A", bg: "#ECFDF5", icon: "💰" },
  CONTRIBUTION_VERIFIED: { label: "Contribution verified",  color: "#16A34A", bg: "#ECFDF5", icon: "✅" },
  CONTRIBUTION_REJECTED: { label: "Contribution rejected",  color: "#DC2626", bg: "#FEF2F2", icon: "❌" },
  CREATE_PLEDGE:         { label: "Pledge created",         color: "#2563EB", bg: "#EFF6FF", icon: "🤝" },
  INVITE_MEMBER:         { label: "Member invited",         color: "#7C3AED", bg: "#F5F3FF", icon: "👤" },
  CREATE_MEETING:        { label: "Meeting scheduled",      color: "#C8891A", bg: "#FDF8F0", icon: "📅" },
  CREATE_ANNOUNCEMENT:   { label: "Announcement posted",    color: "#0891B2", bg: "#ECFEFF", icon: "📢" },
};

const FALLBACK_ACTION = { label: "System action", color: "#6B7280", bg: "#F3F4F6", icon: "⚙️" };

const getAction = (key: string) => ACTIONS[key] ?? FALLBACK_ACTION;

// ── Helpers ───────────────────────────────────────────────────────────────────

const timeAgo = (ts: Timestamp): string => {
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  const hrs  = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days)  return `${days}d ago`;
  if (hrs)   return `${hrs}h ago`;
  if (mins)  return `${mins}m ago`;
  return "just now";
};

const formatFullDate = (ts: Timestamp): string =>
  ts.toDate().toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

// ── Component ─────────────────────────────────────────────────────────────────

export default function AuditLog() {
  const tenantId = resolveTenantId() ?? "tenant_001";

  // ── State ──────────────────────────────────────────────────────────────────
  const [logs,       setLogs]       = useState<AuditLog[]>([]);
  const [members,    setMembers]    = useState<Record<string, MemberSnapshot>>({});
  const [loading,    setLoading]    = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("all");

  // ── Realtime audit logs ────────────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      auditLogsCol(tenantId),
      orderBy("timestamp", "desc"),
      limit(200)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog)));
        setLoading(false);
        setFetchError(null);
      },
      (err) => {
        console.error("[AuditLog] listener error:", err);
        setFetchError("Could not load audit logs. Check your connection.");
        setLoading(false);
      }
    );

    return unsub;
  }, [tenantId]);

  // ── Load member names once (scoped to tenant) ──────────────────────────────
  useEffect(() => {
    const loadMembers = async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "tenantMembers"),
            where("tenantId", "==", tenantId)
          )
        );

        const map: Record<string, MemberSnapshot> = {};
        snap.forEach((doc) => {
          const data = doc.data();
          map[data.userId] = {
            uid:   data.userId,
            name:  data.name  ?? "Unknown",
            email: data.email ?? "",
            role:  data.role  ?? "",
          };
        });

        setMembers(map);
      } catch (err) {
        console.warn("[AuditLog] failed to load member names:", err);
      }
    };

    loadMembers();
  }, [tenantId]);

  // ── Enrich logs with actor names ───────────────────────────────────────────
  const enriched = useMemo<EnrichedLog[]>(() =>
    logs.map((log) => {
      const member = members[log.actorUserId];
      return {
        ...log,
        actorName:  member?.name  ?? "Unknown user",
        actorEmail: member?.email ?? "",
        actorRole:  member?.role  ?? "",
      };
    }),
  [logs, members]);

  // ── Filter + search ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return enriched.filter((l) => {
      const matchesSearch =
        l.actorName.toLowerCase().includes(term)  ||
        l.action.toLowerCase().includes(term)     ||
        l.entityId.toLowerCase().includes(term);
      const matchesFilter = filter === "all" || l.action === filter;
      return matchesSearch && matchesFilter;
    });
  }, [enriched, search, filter]);

  const uniqueActions = useMemo(
    () => [...new Set(logs.map((l) => l.action))],
    [logs]
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <style>{pageStyles}</style>

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-sub">System-wide immutable activity tracking</p>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="stat-row">
        {[
          { label: "Total Events",  value: logs.length,         sub: "all time" },
          { label: "Today",         value: logs.filter((l) => {
              const d = l.timestamp?.toDate();
              const n = new Date();
              return d?.toDateString() === n.toDateString();
            }).length, sub: "activity today" },
          { label: "Action Types",  value: uniqueActions.length, sub: "distinct actions" },
          { label: "Last Activity", value: logs[0] ? timeAgo(logs[0].timestamp) : "—",
            sub: logs[0] ? getAction(logs[0].action).label : "No activity", small: true },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={s.small ? { fontSize: 16 } : {}}>
              {s.value}
            </div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Search + filter ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, action, or entity..."
          style={{
            flex: 1, padding: "12px 16px", borderRadius: 12,
            border: "1.5px solid #E8E8E0", outline: "none",
            fontSize: 14, background: "#fff",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            padding: "12px 14px", borderRadius: 12,
            border: "1.5px solid #E8E8E0", background: "#fff",
            fontSize: 14, cursor: "pointer",
          }}
        >
          <option value="all">All actions</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>
              {getAction(a).label}
            </option>
          ))}
        </select>
      </div>

      {/* ── Log list ── */}
      {fetchError ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-title" style={{ color: "#DC2626" }}>{fetchError}</div>
          </div>
        </div>
      ) : loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <div className="empty-title">No audit logs found</div>
            <div className="empty-sub">Activity will appear here as members take actions.</div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {filtered.map((log, i) => {
            const action = getAction(log.action);
            return (
              <div
                key={log.id}
                style={{
                  display: "flex", gap: 14, padding: "16px 20px",
                  borderBottom: i < filtered.length - 1 ? "1px solid #F3F4F6" : "none",
                  alignItems: "flex-start",
                }}
              >
                {/* Icon */}
                <div style={{
                  width: 38, height: 38, borderRadius: 10,
                  background: action.bg, flexShrink: 0,
                  display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 16,
                }}>
                  {action.icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: action.color, marginBottom: 3 }}>
                    {action.label}
                  </div>

                  <div style={{ fontSize: 13, color: "#444", marginBottom: 2 }}>
                    <strong>{log.actorName}</strong>
                    {log.actorEmail && (
                      <span style={{ color: "#888" }}> · {log.actorEmail}</span>
                    )}
                    {log.actorRole && (
                      <span style={{
                        marginLeft: 6, fontSize: 11, fontWeight: 600,
                        color: "#1A3A2A", background: "#F0F7F3",
                        padding: "1px 6px", borderRadius: 4,
                        textTransform: "capitalize",
                      }}>
                        {log.actorRole}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 11, color: "#AAA" }}>
                    {log.entityType} · {log.entityId}
                  </div>
                </div>

                {/* Time */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>
                    {timeAgo(log.timestamp)}
                  </div>
                  <div style={{ fontSize: 11, color: "#BBB" }}>
                    {formatFullDate(log.timestamp)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}