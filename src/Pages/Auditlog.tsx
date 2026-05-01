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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

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

// Enriched log (UI layer only)
interface EnrichedAuditLog extends AuditLog {
  actorName: string;
  actorEmail: string;
  actorRole: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_CONFIG: Record<
  string,
  { color: string; bg: string; label: string; icon: string }
> = {
  CREATE_CONTRIBUTION: { color: "#16A34A", bg: "#EDFAF2", label: "Contribution recorded", icon: "💰" },
  CONTRIBUTION_VERIFIED: { color: "#16A34A", bg: "#EDFAF2", label: "Contribution verified", icon: "✔" },
  CONTRIBUTION_REJECTED: { color: "#DC2626", bg: "#FEF2F2", label: "Contribution rejected", icon: "✕" },
  CREATE_PLEDGE: { color: "#2563EB", bg: "#EFF6FF", label: "Pledge added", icon: "📌" },
  INVITE_MEMBER: { color: "#7C3AED", bg: "#F5F0FF", label: "Member invited", icon: "👤" },
};

const DEFAULT_CFG = {
  color: "#6B7280",
  bg: "#F3F4F6",
  label: "Unknown action",
  icon: "•",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const getActionConfig = (action: string) =>
  ACTION_CONFIG[action] ?? DEFAULT_CFG;

const timeAgo = (ts: Timestamp, now: number) => {
  const diff = now - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);

  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "just now";
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AuditLog() {
  const tenantId = resolveTenantId() ?? "tenant_001";

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [usersMap, setUsersMap] = useState<Record<string, UserSnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [now] = useState(() => Date.now());

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Load audit logs (real-time)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const q = query(
      auditLogsCol(tenantId),
      orderBy("timestamp", "desc"),
      limit(200)
    );

    const unsub = onSnapshot(q, (snap) => {
      setLogs(
        snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as AuditLog[]
      );
      setLoading(false);
    });

    return unsub;
  }, [tenantId]);

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Load user snapshots (ONE-TIME BATCH)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadUsers = async () => {
      const snap = await getDocs(collection(db, "userSnapshots"));

      const map: Record<string, UserSnapshot> = {};
      snap.forEach((doc) => {
        map[doc.id] = doc.data() as UserSnapshot;
      });

      setUsersMap(map);
    };

    loadUsers();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Enrich logs (NO extra Firestore calls)
  // ─────────────────────────────────────────────────────────────────────────

  const enrichedLogs: EnrichedAuditLog[] = useMemo(() => {
    return logs.map((log) => {
      const user = usersMap[log.actorUserId];

      return {
        ...log,
        actorName: user?.name ?? log.actorUserId,
        actorEmail: user?.email ?? "",
        actorRole: user?.role ?? "",
      };
    });
  }, [logs, usersMap]);

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Filtering
  // ─────────────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return enrichedLogs.filter((l) => {
      const matchSearch =
        l.actorName.toLowerCase().includes(search.toLowerCase()) ||
        l.action.toLowerCase().includes(search.toLowerCase()) ||
        l.entityId.toLowerCase().includes(search.toLowerCase());

      const matchFilter =
        filterAction === "all" || l.action === filterAction;

      return matchSearch && matchFilter;
    });
  }, [enrichedLogs, search, filterAction]);

  const uniqueActions = useMemo(
    () => [...new Set(logs.map((l) => l.action))],
    [logs]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <style>{pageStyles}</style>

      {/* HEADER */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-sub">
            Immutable system history with enriched actor context
          </p>
        </div>
      </div>

      {/* SEARCH */}
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search actor, action, entity..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
        >
          <option value="all">All actions</option>
          {uniqueActions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* LIST */}
      <div className="card">
        {loading ? (
          <div className="loading">
            <div className="spinner" />
          </div>
        ) : (
          filtered.map((log) => {
            const cfg = getActionConfig(log.action);

            return (
              <div
                key={log.id}
                style={{
                  display: "flex",
                  gap: 14,
                  padding: "14px 18px",
                  borderBottom: "1px solid #F3F3F3",
                }}
              >
                {/* ICON */}
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: cfg.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {cfg.icon}
                </div>

                {/* CONTENT */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    {cfg.label}
                  </div>

                  <div style={{ fontSize: 12, color: "#666" }}>
                    <strong>{log.actorName}</strong>
                    {log.actorEmail && ` • ${log.actorEmail}`}
                    {log.actorRole && ` • ${log.actorRole}`}
                  </div>

                  <div style={{ fontSize: 11, color: "#999" }}>
                    {log.entityType} → {log.entityId}
                  </div>
                </div>

                {/* TIME */}
                <div style={{ fontSize: 12, color: "#888" }}>
                  {timeAgo(log.timestamp, now)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}