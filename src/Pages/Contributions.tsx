import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  collection, query, onSnapshot, addDoc, getDocs,
  Timestamp, orderBy, doc, updateDoc, where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { usePermissions } from "../auth/usePermissions";
import { useTenant } from "../hooks/useTenant";
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

interface Member {
  id:     string;
  userId: string;
  name:   string;
  email:  string;
}

interface ContributionForm {
  userId:     string;
  memberName: string;
  amount:     string;
  mpesaRef:   string;
  groupId:    string;
  cycleId:    string;
  pledgeId:   string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_FORM: ContributionForm = {
  userId: "", memberName: "", amount: "",
  mpesaRef: "", groupId: "group_001",
  cycleId: "cycle_001", pledgeId: "",
};

const STATUS_CONFIG: Record<ContributionStatus, { label: string; color: string; bg: string }> = {
  verified: { label: "Verified", color: "#16A34A", bg: "#ECFDF5" },
  pending:  { label: "Pending",  color: "#D97706", bg: "#FEF3C7" },
  rejected: { label: "Rejected", color: "#DC2626", bg: "#FEF2F2" },
  flagged:  { label: "Flagged",  color: "#7C3AED", bg: "#F5F3FF" },
};

const formatDate = (ts: Timestamp): string =>
  ts?.toDate().toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

const formatKES = (amount: number): string =>
  `KES ${amount.toLocaleString("en-KE")}`;

// ── MemberComboBox ────────────────────────────────────────────────────────────

interface MemberComboBoxProps {
  members:  Member[];
  value:    string;
  onSelect: (uid: string, name: string) => void;
}

function MemberComboBox({ members, value, onSelect }: MemberComboBoxProps) {
  const [draft, setDraft] = useState(value);
  const [open,  setOpen]  = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setDraft(value);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value]);

  const filtered = useMemo(
    () => members.filter(
      (m) =>
        m.name.toLowerCase().includes(draft.toLowerCase()) ||
        m.email.toLowerCase().includes(draft.toLowerCase())
    ),
    [members, draft]
  );

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <input
          className="form-input"
          placeholder="Search member by name or email…"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        {draft && (
          <button type="button"
            onClick={() => { setDraft(""); onSelect("", ""); setOpen(false); }}
            style={{
              position: "absolute", right: 12, top: "50%",
              transform: "translateY(-50%)", background: "none",
              border: "none", color: "#AAA", cursor: "pointer",
              fontSize: 18, lineHeight: 1,
            }}
          >×</button>
        )}
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "white", border: "1.5px solid #E8E8E0",
          borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
          zIndex: 300, maxHeight: 220, overflowY: "auto",
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: 13, color: "#AAA", textAlign: "center" }}>
              No members found
            </div>
          ) : filtered.map((m) => (
            <div key={m.userId}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(m.userId, m.name); setDraft(m.name); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 16px", cursor: "pointer",
                borderBottom: "1px solid #F5F4EF",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F5F4EF")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
            >
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "#1A3A2A", color: "white",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 700, flexShrink: 0,
              }}>
                {m.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#1A1A1A" }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "#AAA" }}>{m.email}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Contributions ─────────────────────────────────────────────────────────────

export default function Contributions() {
  const { currentUser }                    = useAuth();
  const { tenantId }                       = useTenant();
  const { canWrite, isAdmin, isTreasurer } = usePermissions();

  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [members,       setMembers]       = useState<Member[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [fetchError,    setFetchError]    = useState<string | null>(null);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState<ContributionStatus | "all">("all");
  const [showModal,     setShowModal]     = useState(false);
  const [modalKey,      setModalKey]      = useState(0);
  const [form,          setForm]          = useState<ContributionForm>(INITIAL_FORM);
  const [formError,     setFormError]     = useState("");
  const [submitting,    setSubmitting]    = useState(false);
  const [actionError,   setActionError]   = useState("");

  // ── Real-time contributions ────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    return onSnapshot(
      query(
        collection(db, `tenants/${tenantId}/contributions`),
        orderBy("createdAt", "desc")
      ),
      (snap) => {
        setContributions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contribution)));
        setLoading(false);
        setFetchError(null);
      },
      (err) => {
        console.error("[Contributions] listener:", err);
        setFetchError("Could not load contributions. Check your connection.");
        setLoading(false);
      }
    );
  }, [tenantId]);

  // ── Members — filtered by tenantId so names resolve correctly ─────────────
  useEffect(() => {
    if (!tenantId) return;
    getDocs(
      query(
        collection(db, "tenantMembers"),
        where("tenantId", "==", tenantId)   // ← key fix: scope to this tenant
      )
    )
      .then((snap) =>
        setMembers(
          snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id:     d.id,
                userId: data.userId ?? "",
                name:   data.name   ?? "Unknown",
                email:  data.email  ?? "",
              } as Member;
            })
            .filter((m) => m.userId)
        )
      )
      .catch((err) => console.error("[Contributions] members load:", err));
  }, [tenantId]);

  // ── memberMap: userId → Member ─────────────────────────────────────────────
  const memberMap = useMemo(() => {
    const map: Record<string, Member> = {};
    members.forEach((m) => { map[m.userId] = m; });
    return map;
  }, [members]);

  // ── Stats ──────────────────────────────────────────────────────────────────
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

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return contributions.filter((c) => {
      const member = memberMap[c.userId];
      const name   = (member?.name ?? "").toLowerCase();
      const email  = (member?.email ?? "").toLowerCase();
      const matchesSearch =
        c.mpesaRef.toLowerCase().includes(term) ||
        name.includes(term) ||
        email.includes(term) ||
        String(c.amount).includes(term);
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [contributions, memberMap, search, statusFilter]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const resetModal = useCallback(() => {
    setShowModal(false);
    setForm(INITIAL_FORM);
    setFormError("");
    setModalKey((k) => k + 1);
  }, []);

  const updateForm = useCallback(<K extends keyof ContributionForm>(
    field: K, val: ContributionForm[K]
  ) => setForm((prev) => ({ ...prev, [field]: val })), []);

  const handleSubmit = useCallback(async () => {
    if (!tenantId || !currentUser) return;
    if (!form.userId)   { setFormError("Please select a member");       return; }
    if (!form.amount)   { setFormError("Amount is required");           return; }
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
          userId:             form.userId,
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
        metadata:    { recordedFor: form.userId, mpesaRef },
        timestamp:   Timestamp.now(),
      }).catch((err) => console.warn("[Contributions] audit log:", err));
      resetModal();
    } catch (err) {
      console.error("[Contributions] create:", err);
      setFormError("Failed to save contribution. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [form, tenantId, currentUser, resetModal]);

  const updateStatus = useCallback(async (
    contribution: Contribution, status: ContributionStatus
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
        action:      status === "verified" ? "CONTRIBUTION_VERIFIED" : "CONTRIBUTION_FLAGGED",
        entityType:  "contribution",
        entityId:    contribution.id,
        timestamp:   Timestamp.now(),
      }).catch((err) => console.warn("[Contributions] audit log:", err));
      setActionError("");
    } catch (err) {
      console.error("[Contributions] status update:", err);
      setActionError("Failed to update status. Please try again.");
    }
  }, [isAdmin, isTreasurer, tenantId, currentUser]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <style>{pageStyles}</style>

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

      <div className="stat-row">
        {[
          { label: "Total Collected", value: formatKES(stats.totalCollected), sub: `${stats.count} transactions` },
          { label: "Verified",        value: stats.verified,                  sub: formatKES(stats.verifiedAmount) },
          { label: "Pending Review",  value: stats.pending,                   sub: "awaiting verification" },
          { label: "Flagged",         value: stats.flagged,                   sub: "needs attention" },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {actionError && (
        <div className="error-box" style={{ marginBottom: 16 }}>⚠ {actionError}</div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        <input
          className="search-input"
          placeholder="Search by name, M-Pesa ref or amount..."
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
            fontSize: 14, cursor: "pointer", outline: "none",
          }}
        >
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_CONFIG) as ContributionStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
          ))}
        </select>
      </div>

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
            <div className="empty-icon">💸</div>
            <div className="empty-title">No contributions yet</div>
            <div className="empty-sub">
              {canWrite
                ? "Record the first M-Pesa payment to get started."
                : "No contributions have been recorded yet."}
            </div>
          </div>
        </div>
      ) : (
  <div className="card" style={{ padding: 0, overflow: "hidden" }}>

    {/* Desktop grid header — hidden on mobile */}
    <div className="contrib-grid-header">
      <span>Member</span>
      <span>Amount</span>
      <span>M-Pesa Ref</span>
      <span>Status</span>
      <span>Date</span>
      {(isAdmin || isTreasurer) && <span>Actions</span>}
    </div>

    {filtered.map((c, i) => {
      const member      = memberMap[c.userId];
      const statusCfg   = STATUS_CONFIG[c.status];
      const displayName = member?.name  ?? `User …${c.userId.slice(-6)}`;
      const initials    = (member?.name ?? c.userId).slice(0, 2).toUpperCase();

      return (
        <div key={c.id} className="contrib-grid-row"
          style={{ borderBottom: i < filtered.length - 1 ? "1px solid #F3F4F6" : "none" }}
        >
          {/* Member */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "#1A3A2A", color: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#1A1A1A" }}>
                {displayName}
              </div>
              {member?.email && (
                <div style={{ fontSize: 11, color: "#AAA" }}>{member.email}</div>
              )}
            </div>
          </div>

          {/* Amount */}
          <div style={{ fontWeight: 700, fontSize: 14, color: "#1A1A1A" }}>
            {formatKES(c.amount)}
          </div>

          {/* M-Pesa Ref */}
          <div style={{
            fontFamily: "monospace", fontSize: 12, fontWeight: 600,
            color: "#1A3A2A", background: "#F0F7F3",
            padding: "3px 8px", borderRadius: 6, display: "inline-block",
          }}>
            {c.mpesaRef}
          </div>

          {/* Status */}
          <span style={{
            fontSize: 12, fontWeight: 600,
            color: statusCfg.color, background: statusCfg.bg,
            padding: "4px 10px", borderRadius: 6, display: "inline-block",
          }}>
            {statusCfg.label}
          </span>

          {/* Date */}
          <div style={{ fontSize: 12, color: "#888" }}>
            {c.createdAt ? formatDate(c.createdAt) : "—"}
          </div>

          {/* Actions */}
          {(isAdmin || isTreasurer) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {c.status === "pending" && (
                <>
                  <button onClick={() => updateStatus(c, "verified")} style={{
                    background: "#ECFDF5", border: "1px solid #BBF7D0",
                    color: "#16A34A", borderRadius: 8,
                    padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>✓ Verify</button>
                  <button onClick={() => updateStatus(c, "flagged")} style={{
                    background: "#F5F3FF", border: "1px solid #DDD6FE",
                    color: "#7C3AED", borderRadius: 8,
                    padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}> Flag</button>
                </>
              )}
            </div>
          )}
        </div>
      );
    })}
  </div>
)
}

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
                <label className="form-label">Member</label>
                <MemberComboBox
                  key={modalKey}
                  members={members}
                  value={form.memberName}
                  onSelect={(uid, name) =>
                    setForm((prev) => ({ ...prev, userId: uid, memberName: name }))
                  }
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount (KES)</label>
                  <input
                    className="form-input" type="number" placeholder="e.g. 1000"
                    value={form.amount}
                    onChange={(e) => { updateForm("amount", e.target.value); setFormError(""); }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">M-Pesa Reference</label>
                  <input
                    className="form-input" placeholder="e.g. QHJ7YT123"
                    value={form.mpesaRef}
                    onChange={(e) => { updateForm("mpesaRef", e.target.value); setFormError(""); }}
                    style={{ textTransform: "uppercase" }}
                  />
                </div>
              </div>
              <div style={{
                background: "#F0F7F3", border: "1px solid #BBDDC9",
                borderRadius: 10, padding: "10px 14px",
                fontSize: 13, color: "#1A5C35", marginBottom: 8,
              }}>
                ℹ Contribution will be recorded as <strong>pending</strong> until verified.
              </div>
              <div className="modal-actions">
                <button className="btn-cancel" onClick={resetModal}>Cancel</button>
                <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Saving…" : "Record Contribution"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}