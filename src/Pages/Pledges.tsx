import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  collection, query, onSnapshot, addDoc, getDocs,
  Timestamp, orderBy,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { usePermissions } from "../auth/usePermissions";
import { useTenant } from "../hooks/useTenant";
import { pageStyles } from "../styles/pageStyles";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Pledge {
  id:            string;
  userId:        string;
  groupId:       string;
  cycleId:       string;
  amountPlanned: number;
  frequency:     "weekly" | "monthly" | "one-time";
  status:        "active" | "fulfilled" | "defaulted" | "cancelled";
  createdAt:     Timestamp;
}

interface Member {
  id:     string;
  userId: string;
  name:   string;
  email:  string;
}

interface FormState {
  userId:        string;
  memberName:    string;
  amountPlanned: string;
  frequency:     Pledge["frequency"];
  cycleId:       string;
  groupId:       string;
}

const INITIAL_FORM: FormState = {
  userId:        "",
  memberName:    "",
  amountPlanned: "",
  frequency:     "monthly",
  cycleId:       "cycle_001",
  groupId:       "group_001",
};

// ── MemberComboBox ────────────────────────────────────────────────────────────
// Local draft state only — no useEffect to sync props → state.
// Parent resets the component by changing the `key` prop.

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
        setDraft(value); // revert unconfirmed text
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
          <button
            type="button"
            onClick={() => { setDraft(""); onSelect("", ""); setOpen(false); }}
            style={{
              position: "absolute", right: 12, top: "50%",
              transform: "translateY(-50%)",
              background: "none", border: "none",
              color: "#AAA", cursor: "pointer", fontSize: 16, lineHeight: 1,
            }}
          >×</button>
        )}
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
          background: "white", border: "1.5px solid #E8E8E0",
          borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
          zIndex: 200, maxHeight: 220, overflowY: "auto",
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: 13, color: "#AAA", textAlign: "center" }}>
              No members found
            </div>
          ) : filtered.map((m) => (
            <div
              key={m.userId}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(m.userId, m.name); setDraft(m.name); setOpen(false); }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 16px", cursor: "pointer",
                borderBottom: "1px solid #F5F4EF", transition: "background 0.12s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F5F4EF")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
            >
              <div style={{
                width: 32, height: 32, borderRadius: "50%",
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

// ── Pledges ───────────────────────────────────────────────────────────────────

export default function Pledges() {
  const { currentUser }  = useAuth();
  const { tenantId }     = useTenant();
  const { canWrite }     = usePermissions();

  const [pledges,    setPledges]    = useState<Pledge[]>([]);
  const [members,    setMembers]    = useState<Member[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [showModal,  setShowModal]  = useState(false);
  const [modalKey,   setModalKey]   = useState(0);
  const [error,      setError]      = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form,       setForm]       = useState<FormState>(INITIAL_FORM);

  // ── Real-time pledges ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    return onSnapshot(
      query(collection(db, `tenants/${tenantId}/pledges`), orderBy("createdAt", "desc")),
      (snap) => {
        setPledges(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pledge)));
        setLoading(false);
      },
      (err) => { console.error("[Pledges] listener:", err); setLoading(false); }
    );
  }, [tenantId]);

  // ── Members (one-time) ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;
    getDocs(query(collection(db, "tenantMembers"), orderBy("joinedAt", "desc")))
      .then((snap) =>
        setMembers(
          snap.docs
            .map((d) => {
              const data = d.data();
              return {
                id:     d.id,
                userId: data.userId ?? "",
                name:   data.name   ?? data.userId ?? "Unknown",
                email:  data.email  ?? "",
              } as Member;
            })
            .filter((m) => m.userId)
        )
      )
      .catch((err) => console.error("[Pledges] members load:", err));
  }, [tenantId]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const memberMap = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((m) => { map[m.userId] = m.name; });
    return map;
  }, [members]);

  const stats = useMemo(() => {
    const fulfilled      = pledges.filter((p) => p.status === "fulfilled");
    const defaulted      = pledges.filter((p) => p.status === "defaulted");
    const active         = pledges.filter((p) => p.status === "active");
    const fulfillmentRate = pledges.length > 0
      ? Math.round((fulfilled.length / pledges.length) * 100) : 0;
    return {
      totalPlanned: pledges.reduce((s, p) => s + p.amountPlanned, 0),
      fulfilled, defaulted, active, fulfillmentRate,
    };
  }, [pledges]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return pledges.filter((p) => {
      const name = (memberMap[p.userId] ?? p.userId).toLowerCase();
      return (
        name.includes(term) ||
        p.frequency.toLowerCase().includes(term) ||
        p.status.toLowerCase().includes(term)
      );
    });
  }, [pledges, memberMap, search]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const closeModal = useCallback(() => {
    setShowModal(false);
    setForm(INITIAL_FORM);
    setError("");
    setModalKey((k) => k + 1);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!canWrite)  { setError("You do not have permission to create pledges."); return; }
    if (!tenantId)  { setError("Tenant not loaded."); return; }
    if (!form.userId)        { setError("Please select a member"); return; }
    if (!form.amountPlanned) { setError("Amount is required");     return; }
    const amount = Number(form.amountPlanned);
    if (isNaN(amount) || amount <= 0) { setError("Enter a valid amount"); return; }

    setSubmitting(true);
    setError("");

    try {
      const ref = await addDoc(collection(db, `tenants/${tenantId}/pledges`), {
        userId:        form.userId,
        groupId:       form.groupId,
        cycleId:       form.cycleId,
        amountPlanned: amount,
        frequency:     form.frequency,
        status:        "active",
        createdAt:     Timestamp.now(),
      });

      addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser?.uid ?? "unknown",
        action:      "CREATE_PLEDGE",
        entityType:  "pledge",
        entityId:    ref.id,
        metadata:    { recordedFor: form.userId },
        timestamp:   Timestamp.now(),
      }).catch((err) => console.warn("[Pledges] audit log:", err));

      closeModal();
    } catch (err) {
      console.error("[Pledges] create:", err);
      setError("Failed to save pledge. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [canWrite, tenantId, form, currentUser, closeModal]);

  // ── Status badge ───────────────────────────────────────────────────────────
  const statusBadge = (status: Pledge["status"]) => {
    const cfg: Record<Pledge["status"], { cls: string; icon: string }> = {
      active:    { cls: "badge-active",    icon: "◉" },
      fulfilled: { cls: "badge-fulfilled", icon: "✓" },
      defaulted: { cls: "badge-defaulted", icon: "✕" },
      cancelled: { cls: "badge-cancelled", icon: "○" },
    };
    const { cls, icon } = cfg[status];
    return <span className={`badge ${cls}`}>{icon} {status}</span>;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <style>{pageStyles}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Pledges</h1>
          <p className="page-sub">Member commitments before money moves</p>
        </div>
        {canWrite && (
          <button className="btn-add" onClick={() => setShowModal(true)}>+ Add Pledge</button>
        )}
      </div>

      <div className="stat-row">
        {[
          { label: "Total Pledged",     value: `KES ${stats.totalPlanned.toLocaleString()}`, sub: `${pledges.length} pledges` },
          { label: "Fulfilment Rate",   value: `${stats.fulfillmentRate}%`,                  sub: `${stats.fulfilled.length} fulfilled` },
          { label: "Active",            value: stats.active.length,                          sub: "ongoing commitments" },
          { label: "Defaulters",        value: stats.defaulted.length,                       sub: "needs follow-up" },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {stats.defaulted.length > 0 && (
        <div className="error-box">
          ⚠ {stats.defaulted.length} defaulted pledge(s) require follow-up.
        </div>
      )}

      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search by name, frequency or status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">◇</div>
            <div className="empty-title">No pledges yet</div>
            <div className="empty-sub">Add the first pledge to get started.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th><th>Amount</th><th>Frequency</th>
                  <th>Status</th><th>Date</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="avatar" style={{ background: "#1A3A2A", fontSize: 12 }}>
                          {(memberMap[p.userId] ?? p.userId).slice(0, 2).toUpperCase()}
                        </div>
                        <div style={{ fontWeight: 500, fontSize: 14 }}>
                          {memberMap[p.userId] ?? p.userId}
                        </div>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: "#1A3A2A" }}>
                      KES {p.amountPlanned.toLocaleString()}
                    </td>
                    <td style={{ textTransform: "capitalize", fontSize: 13 }}>{p.frequency}</td>
                    <td>{statusBadge(p.status)}</td>
                    <td style={{ fontSize: 13, color: "#888" }}>
                      {p.createdAt?.toDate().toLocaleDateString("en-KE", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </td>
                    {canWrite && (
                      <td>
                        {p.status === "active" && (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button className="action-btn">✓ Fulfil</button>
                            <button className="action-btn danger">✕ Default</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && canWrite && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Pledge</h2>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-box">⚠ {error}</div>}

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
                    className="form-input"
                    type="number"
                    placeholder="e.g. 1000"
                    value={form.amountPlanned}
                    onChange={(e) => { setForm((p) => ({ ...p, amountPlanned: e.target.value })); setError(""); }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Frequency</label>
                  <select
                    className="form-input"
                    value={form.frequency}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, frequency: e.target.value as Pledge["frequency"] }))
                    }
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="one-time">One-time</option>
                  </select>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={closeModal}>Cancel</button>
                <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Saving…" : "Save Pledge"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}