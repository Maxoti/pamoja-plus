import { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection, query, onSnapshot, addDoc,
  Timestamp, orderBy, doc, updateDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { usePermissions } from "../auth/usePermissions";
import { pageStyles } from "../styles/pageStyles";

// ── Types ─────────────────────────────────────────────────────────────────────

type ContributionStatus = "pending" | "verified" | "rejected" | "flagged";

interface Contribution {
  id:                 string;
  userId:             string;
  groupId:            string;
  cycleId:            string;
  pledgeId?:          string | null;
  amount:             number;
  mpesaRef:           string;
  status:             ContributionStatus;
  verificationMethod: string;
  verifiedBy?:        string | null;
  verifiedAt?:        Timestamp | null;
  createdAt:          Timestamp;
}

interface ContributionForm {
  amount:   string;
  mpesaRef: string;
  groupId:  string;
  cycleId:  string;
  pledgeId: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_FORM: ContributionForm = {
  amount:   "",
  mpesaRef: "",
  groupId:  "group_001",
  cycleId:  "cycle_001",
  pledgeId: "",
};

const STATUS_CONFIG: Record<ContributionStatus, {
  label: string; color: string; bg: string; 
}> = {
  verified: { label: "Verified", color: "#16A34A", bg: "#ECFDF5", },
  pending:  { label: "Pending",  color: "#D97706", bg: "#FEF3C7", },
  rejected: { label: "Rejected", color: "#DC2626", bg: "#FEF2F2",  },
  flagged:  { label: "Flagged",  color: "#7C3AED", bg: "#F5F3FF",  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatDate = (ts: Timestamp): string =>
  ts?.toDate().toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });

const formatKES = (amount: number): string =>
  `KES ${amount.toLocaleString("en-KE")}`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function Contributions() {
  const { currentUser, tenantId } = useAuth();
  const { canWrite, isAdmin, isTreasurer } = usePermissions();

  // ── State ──────────────────────────────────────────────────────────────────
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [fetchError,    setFetchError]    = useState<string | null>(null);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState<ContributionStatus | "all">("all");
  const [showModal,     setShowModal]     = useState(false);
  const [form,          setForm]          = useState<ContributionForm>(INITIAL_FORM);
  const [formError,     setFormError]     = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [actionError,   setActionError]   = useState("");

  // ── Realtime listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;

    const q = query(
      collection(db, `tenants/${tenantId}/contributions`),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setContributions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contribution)));
        setLoading(false);
        setFetchError(null);
      },
      (err) => {
        console.error("[Contributions] listener error:", err);
        setFetchError("Could not load contributions. Check your connection.");
        setLoading(false);
      }
    );

    return unsub;
  }, [tenantId]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const verified = contributions.filter((c) => c.status === "verified");
    return {
      totalCollected: contributions.reduce((s, c) => s + c.amount, 0),
      count:          contributions.length,
      verified:       verified.length,
      verifiedAmount: verified.reduce((s, c) => s + c.amount, 0),
      pending:        contributions.filter((c) => c.status === "pending").length,
      flagged:        contributions.filter((c) => c.status === "flagged").length,
    };
  }, [contributions]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return contributions.filter((c) => {
      const matchesSearch =
        c.mpesaRef.toLowerCase().includes(term) ||
        c.userId.toLowerCase().includes(term)   ||
        String(c.amount).includes(term);
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contributions, search, statusFilter]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const resetModal = useCallback(() => {
    setShowModal(false);
    setForm(INITIAL_FORM);
    setFormError("");
  }, []);

  const updateForm = useCallback((field: keyof ContributionForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value })), []);

  const handleSubmit = useCallback(async () => {
    if (!tenantId || !currentUser) return;
    if (!form.amount)   { setFormError("Amount is required");        return; }
    if (!form.mpesaRef) { setFormError("M-Pesa reference is required"); return; }

    const amount = Number(form.amount);
    if (isNaN(amount) || amount <= 0) { setFormError("Enter a valid amount"); return; }

    setSubmitting(true);
    setFormError("");

    try {
      const mpesaRef = form.mpesaRef.trim().toUpperCase();

      const ref = await addDoc(
        collection(db, `tenants/${tenantId}/contributions`),
        {
          userId:             currentUser.uid,
          groupId:            form.groupId,
          cycleId:            form.cycleId,
          pledgeId:           form.pledgeId || null,
          amount,
          mpesaRef,
          status:             "pending",
          verificationMethod: "manual",
          verifiedBy:         null,
          verifiedAt:         null,
          createdAt:          Timestamp.now(),
        }
      );

      addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser.uid,
        action:      "CREATE_CONTRIBUTION",
        entityType:  "contribution",
        entityId:    ref.id,
        timestamp:   Timestamp.now(),
      }).catch((err) => console.warn("[Contributions] audit log failed:", err));

      resetModal();
    } catch (err) {
      console.error("[Contributions] create error:", err);
      setFormError("Failed to save contribution. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [form, tenantId, currentUser, resetModal]);

  const updateStatus = useCallback(async (
    contribution: Contribution,
    status: ContributionStatus
  ) => {
    if (!isAdmin && !isTreasurer) {
      setActionError("Only admins and treasurers can verify contributions.");
      return;
    }
    if (!tenantId || !currentUser) return;

    try {
      await updateDoc(
        doc(db, `tenants/${tenantId}/contributions`, contribution.id),
        { status, verifiedBy: currentUser.uid, verifiedAt: Timestamp.now() }
      );

      addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser.uid,
        action:      status === "verified" ? "CONTRIBUTION_VERIFIED" : "CONTRIBUTION_REJECTED",
        entityType:  "contribution",
        entityId:    contribution.id,
        timestamp:   Timestamp.now(),
      }).catch((err) => console.warn("[Contributions] audit log failed:", err));

      setActionError("");
    } catch (err) {
      console.error("[Contributions] status update error:", err);
      setActionError("Failed to update status. Please try again.");
    }
  }, [isAdmin, isTreasurer, tenantId, currentUser]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <style>{pageStyles}</style>

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Contributions</h1>
          <p className="page-sub">All M-Pesa payments — verified, pending, and flagged</p>
        </div>
        {canWrite && (
          <button className="btn-add" onClick={() => setShowModal(true)}>
            + Record Contribution
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="stat-row">
        {[
          { label: "Total Collected", value: formatKES(stats.totalCollected), sub: `${stats.count} transactions` },
          { label: "Verified",        value: stats.verified,  sub: formatKES(stats.verifiedAmount) },
          { label: "Pending Review",  value: stats.pending,   sub: "awaiting verification" },
          { label: "Flagged",         value: stats.flagged,   sub: "needs attention" },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Action error ── */}
      {actionError && (
        <div style={{
          background: "#FEF2F2", border: "1px solid #FECACA",
          borderRadius: 10, padding: "10px 16px",
          fontSize: 13, color: "#DC2626", marginBottom: 16,
        }}>
          ⚠ {actionError}
        </div>
      )}

      {/* ── Search + filter ── */}
      <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        <input
          className="search-input"
          placeholder="Search by M-Pesa ref or member..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ContributionStatus | "all")}
          style={{
            padding: "12px 14px", borderRadius: 12,
            border: "1.5px solid #E8E8E0", background: "#fff",
            fontSize: 14, cursor: "pointer",
          }}
        >
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_CONFIG) as ContributionStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
      </div>

      {/* ── Contributions list ── */}
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
            <div className="empty-icon"></div>
            <div className="empty-title">No contributions recorded yet</div>
            <div className="empty-sub">
              {canWrite
                ? "Record your first M-Pesa contribution to get started."
                : "No contributions have been recorded yet."}
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr 1.2fr 1fr 1fr auto",
            padding: "12px 20px",
            background: "#FAFAF7",
            borderBottom: "1px solid #E8E8E0",
            fontSize: 11, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: 1, color: "#AAA",
          }}>
            <span>Member</span>
            <span>Amount</span>
            <span>M-Pesa Ref</span>
            <span>Status</span>
            <span>Date</span>
            {(isAdmin || isTreasurer) && <span>Actions</span>}
          </div>

          {/* Rows */}
          {filtered.map((c, i) => {
            const statusCfg = STATUS_CONFIG[c.status];
            return (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1.2fr 1fr 1fr auto",
                  padding: "16px 20px",
                  borderBottom: i < filtered.length - 1 ? "1px solid #F3F4F6" : "none",
                  alignItems: "center",
                  background: "white",
                }}
              >
                {/* Member */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: "50%",
                    background: "#1A3A2A", color: "white",
                    display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 12,
                    fontWeight: 700, flexShrink: 0,
                  }}>
                    {c.userId.slice(0, 2).toUpperCase()}
                  </div>
                  <span style={{ fontSize: 13, color: "#444", fontFamily: "monospace" }}>
                    {c.userId.slice(0, 12)}…
                  </span>
                </div>

                {/* Amount */}
                <div style={{ fontWeight: 700, fontSize: 14, color: "#1A1A1A" }}>
                  {formatKES(c.amount)}
                </div>

                {/* M-Pesa Ref */}
                <div style={{
                  fontFamily: "monospace", fontSize: 13,
                  fontWeight: 600, color: "#1A3A2A",
                  background: "#F0F7F3", padding: "3px 8px",
                  borderRadius: 6, display: "inline-block",
                }}>
                  {c.mpesaRef}
                </div>

                {/* Status */}
                <div>
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: statusCfg.color, background: statusCfg.bg,
                    padding: "4px 10px", borderRadius: 6,
                  }}>
                     {statusCfg.label}
                  </span>
                </div>

                {/* Date */}
                <div style={{ fontSize: 12, color: "#888" }}>
                  {c.createdAt ? formatDate(c.createdAt) : "—"}
                </div>

                {/* Actions */}
                {(isAdmin || isTreasurer) && (
                  <div style={{ display: "flex", gap: 6 }}>
                    {c.status === "pending" && (
                      <>
                        <button
                          onClick={() => updateStatus(c, "verified")}
                          style={{
                            background: "#ECFDF5", border: "1px solid #BBF7D0",
                            color: "#16A34A", borderRadius: 8,
                            padding: "5px 10px", fontSize: 12,
                            fontWeight: 600, cursor: "pointer",
                          }}
                        >
                          ✓ Verify
                        </button>
                        <button
                          onClick={() => updateStatus(c, "flagged")}
                          style={{
                            background: "#F5F3FF", border: "1px solid #DDD6FE",
                            color: "#7C3AED", borderRadius: 8,
                            padding: "5px 10px", fontSize: 12,
                            fontWeight: 600, cursor: "pointer",
                          }}
                        >
                           Flag
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && canWrite && (
        <div className="modal-overlay" onClick={resetModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Record Contribution</h2>
              <button className="modal-close" onClick={resetModal}>✕</button>
            </div>

            <div className="modal-body">
              {formError && <div className="error-box">⚠ {formError}</div>}

              <div className="form-group">
                <label className="form-label">Amount (KES)</label>
                <input
                  className="form-input"
                  type="number"
                  placeholder="e.g. 1000"
                  value={form.amount}
                  onChange={(e) => updateForm("amount", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">M-Pesa Reference</label>
                <input
                  className="form-input"
                  placeholder="e.g. QHJ7YT123"
                  value={form.mpesaRef}
                  onChange={(e) => updateForm("mpesaRef", e.target.value)}
                  style={{ textTransform: "uppercase" }}
                />
              </div>

              <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
                Contribution will be recorded as <strong>pending</strong> until verified by admin or treasurer.
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={resetModal}>Cancel</button>
                <button
                  className="btn-submit"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Record Contribution"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}