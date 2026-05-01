import { useEffect, useMemo, useState } from "react";
import {
  query,
  onSnapshot,
  orderBy,
  limit,
  collection,
  getDocs,
  type Timestamp,
} from "firebase/firestore";

import { db, resolveTenantId, auditLogsCol } from "../firebase";
import { pageStyles } from "../styles/pageStyles";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface AuditLog {
  id: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: Timestamp;
}

interface UserSnapshot {
  uid: string;
  name: string;
  email: string;
  role: string;
}

interface EnrichedAuditLog extends AuditLog {
  actorName: string;
  actorEmail: string;
  actorRole: string;
}

// ─────────────────────────────────────────────────────────────
// UI Config
// ─────────────────────────────────────────────────────────────

const ACTIONS: Record<string, { label: string; color: string; bg: string }> =
{
  CREATE_CONTRIBUTION: { label: "Contribution recorded", color: "#16A34A", bg: "#ECFDF5" },
  CONTRIBUTION_VERIFIED: { label: "Contribution verified", color: "#16A34A", bg: "#ECFDF5" },
  CONTRIBUTION_REJECTED: { label: "Contribution rejected", color: "#DC2626", bg: "#FEF2F2" },
  CREATE_PLEDGE: { label: "Pledge created", color: "#2563EB", bg: "#EFF6FF" },
  INVITE_MEMBER: { label: "Member invited", color: "#7C3AED", bg: "#F5F3FF" },
};

const fallback = { label: "Unknown action", color: "#6B7280", bg: "#F3F4F6" };

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const formatTimeAgo = (ts: Timestamp) => {
  const diff = Date.now() - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (days) return `${days}d ago`;
  if (hrs) return `${hrs}h ago`;
  if (mins) return `${mins}m ago`;
  return "just now";
};

const getAction = (action: string) => ACTIONS[action] ?? fallback;

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function AuditLog() {
  const tenantId = resolveTenantId() ?? "tenant_001";

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<Record<string, UserSnapshot>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  // ─────────────────────────────────────────────
  // Load audit logs (real-time)
  // ─────────────────────────────────────────────

  useEffect(() => {
    const q = query(
      auditLogsCol(tenantId),
      orderBy("timestamp", "desc"),
      limit(200)
    );

    const unsub = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as AuditLog)));
      setLoading(false);
    });

    return unsub;
  }, [tenantId]);

  // ─────────────────────────────────────────────
  // Load user snapshots (once)
  // ─────────────────────────────────────────────

  useEffect(() => {
    const loadUsers = async () => {
      const snap = await getDocs(collection(db, "userSnapshots"));

      const map: Record<string, UserSnapshot> = {};
      snap.forEach(doc => {
        map[doc.id] = doc.data() as UserSnapshot;
      });

      setUsers(map);
    };

    loadUsers();
  }, []);

  // ─────────────────────────────────────────────
  // Enrich logs
  // ─────────────────────────────────────────────

  const enriched: EnrichedAuditLog[] = useMemo(() => {
    return logs.map(log => {
      const u = users[log.actorUserId];

      return {
        ...log,
        actorName: u?.name ?? log.actorUserId,
        actorEmail: u?.email ?? "",
        actorRole: u?.role ?? "",
      };
    });
  }, [logs, users]);

  // ─────────────────────────────────────────────
  // Filtered logs
  // ─────────────────────────────────────────────

  const filtered = useMemo(() => {
    return enriched.filter(l => {
      const q = search.toLowerCase();

      const matchesSearch =
        l.actorName.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.entityId.toLowerCase().includes(q);

      const matchesFilter =
        filter === "all" || l.action === filter;

      return matchesSearch && matchesFilter;
    });
  }, [enriched, search, filter]);

  const actions = useMemo(
    () => [...new Set(logs.map(l => l.action))],
    [logs]
  );

  // ─────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────

  return (
    <div className="page">
      <style>{pageStyles}</style>

      {/* HEADER */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-sub">
            System-wide immutable activity tracking
          </p>
        </div>
      </div>

      {/* SEARCH + FILTER (STYLED) */}
      <div style={styles.searchBar}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by user, action, or entity..."
          style={styles.searchInput}
        />

        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={styles.select}
        >
          <option value="all">All actions</option>
          {actions.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* LIST */}
      <div className="card">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 20, textAlign: "center", color: "#888" }}>
            No audit logs found
          </div>
        ) : (
          filtered.map(log => {
            const c = getAction(log.action);

            return (
              <div key={log.id} style={styles.row}>
                <div style={styles.icon(c.bg)} />

                <div style={{ flex: 1 }}>
                  <div style={styles.title}>
                    {c.label}
                  </div>

                  <div style={styles.meta}>
                    <strong>{log.actorName}</strong>
                    {log.actorEmail && ` • ${log.actorEmail}`}
                    {log.actorRole && ` • ${log.actorRole}`}
                  </div>

                  <div style={styles.small}>
                    {log.entityType} → {log.entityId}
                  </div>
                </div>

                <div style={styles.time}>
                  {formatTimeAgo(log.timestamp)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles (clean + modern search bar)
// ─────────────────────────────────────────────────────────────

const styles = {
  searchBar: {
    display: "flex",
    gap: 12,
    marginBottom: 18,
  } as React.CSSProperties,

  searchInput: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    outline: "none",
    fontSize: 14,
    background: "#fff",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  } as React.CSSProperties,

  select: {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    background: "#fff",
    fontSize: 14,
    cursor: "pointer",
  } as React.CSSProperties,

  row: {
    display: "flex",
    gap: 14,
    padding: "14px 16px",
    borderBottom: "1px solid #F3F4F6",
  } as React.CSSProperties,

  icon: (bg: string) => ({
    width: 36,
    height: 36,
    borderRadius: 10,
    background: bg,
  }) as React.CSSProperties,

  title: {
    fontWeight: 600,
    fontSize: 14,
  } as React.CSSProperties,

  meta: {
    fontSize: 12,
    color: "#666",
  } as React.CSSProperties,

  small: {
    fontSize: 11,
    color: "#999",
  } as React.CSSProperties,

  time: {
    fontSize: 12,
    color: "#888",
    minWidth: 80,
    textAlign: "right" as const,
  },
};