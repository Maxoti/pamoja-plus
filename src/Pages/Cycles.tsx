import { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection, query, onSnapshot, addDoc, updateDoc,
  getDocs, doc, Timestamp, orderBy, where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { usePermissions } from "../auth/usePermissions";
import { useTenant } from "../hooks/useTenant";
import { pageStyles } from "../styles/pageStyles";

// ── Types ─────────────────────────────────────────────────────────────────────

type CycleStatus = "active" | "closed" | "upcoming";

interface Cycle {
  id:        string;
  title:     string;
  groupId:   string;
  startDate: Timestamp;
  endDate:   Timestamp;
  status:    CycleStatus;
  createdAt: Timestamp;
  createdBy: string;
}

interface CycleForm {
  title:     string;
  startDate: string;
  endDate:   string;
  groupId:   string;
}

interface CycleStats {
  totalPledged:      number;
  totalCollected:    number;
  pledgeCount:       number;
  fulfilledCount:    number;
  defaultedCount:    number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_FORM: CycleForm = {
  title:     "",
  startDate: "",
  endDate:   "",
  groupId:   "group_001",
};

const STATUS_CONFIG: Record<CycleStatus, {
  label: string; color: string; bg: string; icon: string;
}> = {
  active:   { label: "Active",    color: "#16A34A", bg: "#ECFDF5", icon: "◉" },
  closed:   { label: "Closed",    color: "#6B7280", bg: "#F3F4F6", icon: "○" },
  upcoming: { label: "Upcoming",  color: "#2563EB", bg: "#EFF6FF", icon: "◷" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatDate = (ts: Timestamp): string =>
  ts?.toDate().toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });

const formatKES = (n: number): string =>
  `KES ${n.toLocaleString("en-KE")}`;

const getDuration = (start: Timestamp, end: Timestamp): string => {
  const days = Math.round(
    (end.toDate().getTime() - start.toDate().getTime()) / (1000 * 60 * 60 * 24)
  );
  return `${days} days`;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Cycles() {
  const { currentUser }        = useAuth();
  const { tenantId }           = useTenant();
  const { canWrite, isAdmin }  = usePermissions();

  // ── State ──────────────────────────────────────────────────────────────────
  const [cycles,      setCycles]      = useState<Cycle[]>([]);
  const [statsMap,    setStatsMap]    = useState<Record<string, CycleStats>>({});
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState<string | null>(null);
  const [showModal,   setShowModal]   = useState(false);
  const [form,        setForm]        = useState<CycleForm>(INITIAL_FORM);
  const [formError,   setFormError]   = useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [closing,     setClosing]     = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  // ── Realtime cycles ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    return onSnapshot(
      query(
        collection(db, `tenants/${tenantId}/cycles`),
        orderBy("startDate", "desc")
      ),
      async (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Cycle));
        setCycles(rows);
        setLoading(false);
        setFetchError(null);

        // Load stats for each cycle in parallel
        const statsEntries = await Promise.all(
          rows.map(async (cycle) => {
            const [pledgesSnap, contribSnap] = await Promise.all([
              getDocs(
                query(
                  collection(db, `tenants/${tenantId}/pledges`),
                  where("cycleId", "==", cycle.id)
                )
              ),
              getDocs(
                query(
                  collection(db, `tenants/${tenantId}/contributions`),
                  where("cycleId", "==", cycle.id)
                )
              ),
            ]);

            const pledges = pledgesSnap.docs.map((d) => d.data());
            const contribs = contribSnap.docs.map((d) => d.data());

            return [cycle.id, {
              totalPledged:   pledges.reduce((s, p) => s + (p.amountPlanned ?? 0), 0),
              totalCollected: contribs
                .filter((c) => c.status === "verified")
                .reduce((s, c) => s + (c.amount ?? 0), 0),
              pledgeCount:    pledges.length,
              fulfilledCount: pledges.filter((p) => p.status === "fulfilled").length,
              defaultedCount: pledges.filter((p) => p.status === "defaulted").length,
            }] as [string, CycleStats];
          })
        );

        setStatsMap(Object.fromEntries(statsEntries));
      },
      (err) => {
        console.error("[Cycles] listener:", err);
        setFetchError("Could not load cycles. Check your connection.");
        setLoading(false);
      }
    );
  }, [tenantId]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeCycle   = useMemo(() => cycles.find((c) => c.status === "active"),   [cycles]);
  const upcomingCount = useMemo(() => cycles.filter((c) => c.status === "upcoming").length, [cycles]);
  const closedCount   = useMemo(() => cycles.filter((c) => c.status === "closed").length,   [cycles]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const resetModal = useCallback(() => {
    setShowModal(false);
    setForm(INITIAL_FORM);
    setFormError("");
  }, []);

  const handleCreate = useCallback(async () => {
    if (!tenantId || !currentUser) return;
    if (!form.title.trim())    { setFormError("Title is required");      return; }
    if (!form.startDate)       { setFormError("Start date is required"); return; }
    if (!form.endDate)         { setFormError("End date is required");   return; }

    const start = new Date(form.startDate);
    const end   = new Date(form.endDate);
    if (end <= start) { setFormError("End date must be after start date"); return; }

    // Only one active cycle at a time
    if (activeCycle) {
      setFormError("Close the current active cycle before creating a new one.");
      return;
    }

    setSubmitting(true);
    setFormError("");

    try {
      const now    = Timestamp.now();
      const today  = new Date();
      const status: CycleStatus = start > today ? "upcoming" : "active";

      const ref = await addDoc(
        collection(db, `tenants/${tenantId}/cycles`),
        {
          title:     form.title.trim(),
          groupId:   form.groupId,
          startDate: Timestamp.fromDate(start),
          endDate:   Timestamp.fromDate(end),
          status,
          createdAt: now,
          createdBy: currentUser.uid,
        }
      );

      addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser.uid,
        action:      "CREATE_CYCLE",
        entityType:  "cycle",
        entityId:    ref.id,
        timestamp:   now,
      }).catch((err) => console.warn("[Cycles] audit log:", err));

      resetModal();
    } catch (err) {
      console.error("[Cycles] create:", err);
      setFormError("Failed to create cycle. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [form, tenantId, currentUser, activeCycle, resetModal]);

  const handleClose = useCallback(async (cycle: Cycle) => {
    if (!isAdmin) { setActionError("Only admins can close cycles."); return; }
    if (!tenantId || !currentUser) return;
    if (!window.confirm(
      `Close "${cycle.title}"? This will mark all active pledges as defaulted.`
    )) return;

    setClosing(cycle.id);
    setActionError("");

    try {
      // 1. Close the cycle
      await updateDoc(doc(db, `tenants/${tenantId}/cycles`, cycle.id), {
        status: "closed",
      });

      // 2. Flag all active pledges in this cycle as defaulted
      const activePledges = await getDocs(
        query(
          collection(db, `tenants/${tenantId}/pledges`),
          where("cycleId", "==", cycle.id),
          where("status",  "==", "active")
        )
      );

      await Promise.all(
        activePledges.docs.map((d) =>
          updateDoc(d.ref, { status: "defaulted" })
        )
      );

      addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser.uid,
        action:      "CLOSE_CYCLE",
        entityType:  "cycle",
        entityId:    cycle.id,
        metadata:    { defaultedPledges: activePledges.size },
        timestamp:   Timestamp.now(),
      }).catch((err) => console.warn("[Cycles] audit log:", err));

    } catch (err) {
      console.error("[Cycles] close:", err);
      setActionError("Failed to close cycle. Please try again.");
    } finally {
      setClosing(null);
    }
  }, [isAdmin, tenantId, currentUser]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <style>{pageStyles}</style>

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Cycles</h1>
          <p className="page-sub">Manage contribution periods for your group</p>
        </div>
        {canWrite && (
          <button className="btn-add" onClick={() => setShowModal(true)}>
            + New Cycle
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="stat-row">
        {[
          {
            label: "Active Cycle",
            value: activeCycle ? activeCycle.title : "None",
            sub:   activeCycle
              ? `${formatDate(activeCycle.startDate)} — ${formatDate(activeCycle.endDate)}`
              : "Create a new cycle to start",
            small: true,
          },
          {
            label: "Total Cycles",
            value: cycles.length,
            sub:   "all time",
          },
          {
            label: "Upcoming",
            value: upcomingCount,
            sub:   "scheduled ahead",
          },
          {
            label: "Closed",
            value: closedCount,
            sub:   "completed cycles",
          },
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

      {/* ── Action error ── */}
      {actionError && (
        <div className="error-box" style={{ marginBottom: 16 }}>⚠ {actionError}</div>
      )}

      {/* ── No active cycle warning ── */}
      {!activeCycle && !loading && (
        <div style={{
          background: "#FEF3C7", border: "1px solid #FDE68A",
          borderRadius: 12, padding: "14px 18px",
          fontSize: 13, color: "#92400E", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <strong>No active cycle.</strong> Members cannot be linked to a contribution period.{" "}
            {canWrite && (
              <span
                style={{ color: "#1A3A2A", fontWeight: 600, cursor: "pointer", textDecoration: "underline" }}
                onClick={() => setShowModal(true)}
              >
                Create one now →
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Cycle list ── */}
      {fetchError ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-title" style={{ color: "#DC2626" }}>{fetchError}</div>
          </div>
        </div>
      ) : loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : cycles.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">🔄</div>
            <div className="empty-title">No cycles yet</div>
            <div className="empty-sub">
              {canWrite
                ? "Create your first cycle to start tracking contributions."
                : "No contribution cycles have been created yet."}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {cycles.map((cycle) => {
            const statusCfg = STATUS_CONFIG[cycle.status];
            const stats     = statsMap[cycle.id];
            const isClosing = closing === cycle.id;

            return (
              <div
                key={cycle.id}
                style={{
                  background: "white", border: "1px solid #E8E8E0",
                  borderRadius: 16, overflow: "hidden",
                  borderLeft: cycle.status === "active"
                    ? "4px solid #16A34A" : "4px solid transparent",
                }}
              >
                {/* ── Cycle header ── */}
                <div style={{
                  padding: "20px 24px",
                  display: "flex", alignItems: "flex-start",
                  justifyContent: "space-between", gap: 12,
                  flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                      <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: "#1A1A1A" }}>
                        {cycle.title}
                      </h3>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: statusCfg.color, background: statusCfg.bg,
                        padding: "3px 10px", borderRadius: 100,
                        textTransform: "uppercase", letterSpacing: 0.5,
                      }}>
                        {statusCfg.icon} {statusCfg.label}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, color: "#888", display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span>📅 {formatDate(cycle.startDate)} — {formatDate(cycle.endDate)}</span>
                      <span>⏱ {getDuration(cycle.startDate, cycle.endDate)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  {isAdmin && cycle.status === "active" && (
                    <button
                      onClick={() => handleClose(cycle)}
                      disabled={isClosing}
                      style={{
                        background: "#FEF2F2", border: "1px solid #FECACA",
                        color: "#DC2626", borderRadius: 10,
                        padding: "8px 16px", fontSize: 13,
                        fontWeight: 600, cursor: "pointer",
                        opacity: isClosing ? 0.6 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {isClosing ? "Closing…" : "🔒 Close Cycle"}
                    </button>
                  )}
                </div>

                {/* ── Cycle stats ── */}
                {stats && (
                  <div style={{
                    borderTop: "1px solid #F3F4F6",
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                    gap: 0,
                  }}>
                    {[
                      { label: "Pledged",    value: formatKES(stats.totalPledged)   },
                      { label: "Collected",  value: formatKES(stats.totalCollected) },
                      { label: "Pledges",    value: stats.pledgeCount               },
                      { label: "Fulfilled",  value: stats.fulfilledCount            },
                      { label: "Defaulted",  value: stats.defaultedCount            },
                    ].map((s, i, arr) => (
                      <div
                        key={s.label}
                        style={{
                          padding: "14px 20px",
                          borderRight: i < arr.length - 1 ? "1px solid #F3F4F6" : "none",
                        }}
                      >
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: "#AAA", marginBottom: 4 }}>
                          {s.label}
                        </div>
                        <div style={{
                          fontFamily: "'Playfair Display', serif",
                          fontSize: 18, fontWeight: 700, color: "#1A1A1A",
                        }}>
                          {s.value}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create cycle modal ── */}
      {showModal && canWrite && (
        <div className="modal-overlay" onClick={resetModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">New Cycle</h2>
              <button className="modal-close" onClick={resetModal}>✕</button>
            </div>

            <div className="modal-body">
              {formError && <div className="error-box">⚠ {formError}</div>}

              {activeCycle && (
                <div style={{
                  background: "#FEF3C7", border: "1px solid #FDE68A",
                  borderRadius: 8, padding: "10px 14px",
                  fontSize: 13, color: "#92400E", marginBottom: 16,
                }}>
                  ⚠ Close <strong>{activeCycle.title}</strong> before creating a new cycle.
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Cycle Title</label>
                <input
                  className="form-input"
                  placeholder="e.g. May 2026 Cycle"
                  value={form.title}
                  onChange={(e) => { setForm((p) => ({ ...p, title: e.target.value })); setFormError(""); }}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.startDate}
                    onChange={(e) => { setForm((p) => ({ ...p, startDate: e.target.value })); setFormError(""); }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date</label>
                  <input
                    className="form-input"
                    type="date"
                    value={form.endDate}
                    onChange={(e) => { setForm((p) => ({ ...p, endDate: e.target.value })); setFormError(""); }}
                  />
                </div>
              </div>

              <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
                ℹ Only one cycle can be active at a time. Closing a cycle automatically marks unpaid pledges as defaulted.
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={resetModal}>Cancel</button>
                <button
                  className="btn-submit"
                  onClick={handleCreate}
                  disabled={submitting || !!activeCycle}
                >
                  {submitting ? "Creating…" : "Create Cycle"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}