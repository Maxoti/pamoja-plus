import { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection, query, onSnapshot, addDoc, setDoc,
  doc, Timestamp, orderBy, where, updateDoc, deleteDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { usePermissions } from "../auth/usePermissions";
import { pageStyles } from "../styles/pageStyles";

// ── Types ─────────────────────────────────────────────────────────────────────

type MemberRole   = "admin" | "treasurer" | "secretary" | "member";
type MemberStatus = "active" | "invited";

interface Member {
  id:       string;
  userId:   string;
  tenantId: string;
  name?:    string;
  email?:   string;
  phone?:   string;
  role:     MemberRole;
  status:   MemberStatus;
  joinedAt: Timestamp;
}

interface InviteForm {
  email: string;
  role:  MemberRole;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_FORM: InviteForm = { email: "", role: "member" };

const ROLE_STYLES: Record<MemberRole, { color: string; bg: string }> = {
  admin:     { color: "#1A3A2A", bg: "#F0F7F3" },
  treasurer: { color: "#92400E", bg: "#FEF3C7" },
  secretary: { color: "#1E40AF", bg: "#EFF6FF" },
  member:    { color: "#6B7280", bg: "#F3F4F6" },
};

const STATUS_STYLES: Record<MemberStatus, { color: string; bg: string; label: string }> = {
  active:  { color: "#16A34A", bg: "#ECFDF5", label: "Active"  },
  invited: { color: "#D97706", bg: "#FEF3C7", label: "Invited" },
};

const AVATAR_COLORS = ["#1A3A2A", "#C8891A", "#2D6A4F", "#7C3AED", "#2563EB", "#DC2626"];

// ── Helpers ───────────────────────────────────────────────────────────────────

const getInitials = (name?: string, email?: string): string => {
  if (name) return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
};

const formatDate = (ts: Timestamp): string =>
  ts?.toDate().toLocaleDateString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
  });

// ── Component ─────────────────────────────────────────────────────────────────

export default function Members() {
  const { currentUser, tenantId } = useAuth();
  const { canWrite, isAdmin }     = usePermissions();

  // ── State ──────────────────────────────────────────────────────────────────
  const [members,      setMembers]      = useState<Member[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [fetchError,   setFetchError]   = useState<string | null>(null);
  const [search,       setSearch]       = useState("");
  const [showModal,    setShowModal]    = useState(false);
  const [form,         setForm]         = useState<InviteForm>(INITIAL_FORM);
  const [formError,    setFormError]    = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [inviteLink,   setInviteLink]   = useState("");
  const [copied,       setCopied]       = useState(false);
  const [actionError,  setActionError]  = useState("");

  // ── Realtime listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;

    const q = query(
      collection(db, "tenantMembers"),
      where("tenantId", "==", tenantId),
      orderBy("joinedAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Member)));
        setLoading(false);
        setFetchError(null);
      },
      (err) => {
        console.error("[Members] listener error:", err);
        setFetchError("Could not load members. Check your connection.");
        setLoading(false);
      }
    );

    return unsub;
  }, [tenantId]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return members.filter((m) =>
      (m.name ?? m.userId).toLowerCase().includes(term) ||
      (m.email ?? "").toLowerCase().includes(term)      ||
      m.role.toLowerCase().includes(term)
    );
  }, [members, search]);

  const stats = useMemo(() => ({
    total:   members.length,
    active:  members.filter((m) => m.status === "active").length,
    invited: members.filter((m) => m.status === "invited").length,
    admins:  members.filter((m) => m.role === "admin").length,
  }), [members]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const resetModal = useCallback(() => {
    setShowModal(false);
    setForm(INITIAL_FORM);
    setFormError("");
    setInviteLink("");
    setCopied(false);
  }, []);

  const handleInvite = useCallback(async () => {
    if (!tenantId || !currentUser) return;
    if (!form.email.trim()) { setFormError("Email is required"); return; }

    setSubmitting(true);
    setFormError("");

    try {
      const token   = crypto.randomUUID();
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);

      await setDoc(doc(db, "invites", token), {
        email:     form.email.trim().toLowerCase(),
        role:      form.role,
        tenantId,
        status:    "pending",
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(expires),
        invitedBy: currentUser.uid,
      });

      addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser.uid,
        action:      "INVITE_MEMBER",
        entityType:  "invite",
        entityId:    token,
        timestamp:   Timestamp.now(),
      }).catch((err) => console.warn("[Members] audit log failed:", err));

      setInviteLink(`${window.location.origin}/join?token=${token}`);
    } catch (err) {
      console.error("[Members] invite error:", err);
      setFormError("Failed to create invite. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [form, tenantId, currentUser]);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [inviteLink]);

  const updateRole = useCallback(async (member: Member, newRole: MemberRole) => {
    if (!isAdmin) { setActionError("Only admins can change roles."); return; }
    if (!tenantId || !currentUser) return;

    try {
      await updateDoc(doc(db, "tenantMembers", member.id), { role: newRole });

      addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser.uid,
        action:      "ROLE_UPDATED",
        entityType:  "member",
        entityId:    member.id,
        timestamp:   Timestamp.now(),
      }).catch((err) => console.warn("[Members] audit log failed:", err));

      setActionError("");
    } catch (err) {
      console.error("[Members] role update error:", err);
      setActionError("Failed to update role.");
    }
  }, [isAdmin, tenantId, currentUser]);

  const removeMember = useCallback(async (member: Member) => {
    if (!isAdmin) { setActionError("Only admins can remove members."); return; }
    if (!tenantId || !currentUser) return;
    if (!window.confirm(`Remove ${member.name ?? member.email} from the group?`)) return;

    try {
      await deleteDoc(doc(db, "tenantMembers", member.id));

      addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser.uid,
        action:      "MEMBER_REMOVED",
        entityType:  "member",
        entityId:    member.id,
        timestamp:   Timestamp.now(),
      }).catch((err) => console.warn("[Members] audit log failed:", err));

      setActionError("");
    } catch (err) {
      console.error("[Members] remove error:", err);
      setActionError("Failed to remove member.");
    }
  }, [isAdmin, tenantId, currentUser]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <style>{pageStyles}</style>

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Members</h1>
          <p className="page-sub">Manage and invite members to your welfare group</p>
        </div>
        {canWrite && (
          <button className="btn-add" onClick={() => setShowModal(true)}>
            + Invite Member
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="stat-row">
        {[
          { label: "Total Members", value: stats.total,   sub: "in your group"   },
          { label: "Active",        value: stats.active,  sub: "currently active" },
          { label: "Invited",       value: stats.invited, sub: "pending invite"   },
          { label: "Admins",        value: stats.admins,  sub: "with admin access" },
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

      {/* ── Search ── */}
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search by name, email or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

    {/* ── Member list ── */}
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
      <div className="empty-icon">👥</div>
      <div className="empty-title">No members found</div>
      <div className="empty-sub">
        {canWrite ? "Invite your first member to get started." : "No members have been added yet."}
      </div>
    </div>
  </div>
) : (
  <div className="card" style={{ padding: 0, overflow: "hidden" }}>

    {/* ── Grid header — hidden on mobile via CSS ── */}
    <div className="member-grid-header">
      <span>Member</span>
      <span>Role</span>
      <span>Status</span>
      <span>Joined</span>
      {canWrite && <span>Actions</span>}
    </div>

    {/* ── Rows — grid on desktop, cards on mobile ── */}
    {filtered.map((m, i) => {
      const roleStyle     = ROLE_STYLES[m.role]     ?? ROLE_STYLES.member;
      const statusStyle   = STATUS_STYLES[m.status] ?? STATUS_STYLES.active;
      const isCurrentUser = m.userId === currentUser?.uid;

      return (
        <div
          key={m.id}
          className="member-grid-row"
          style={{
            borderBottom: i < filtered.length - 1 ? "1px solid #F3F4F6" : "none",
            background:   isCurrentUser ? "#FAFFF8" : "white",
          }}
        >
          {/* Member info */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: AVATAR_COLORS[i % AVATAR_COLORS.length],
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: "white", flexShrink: 0,
            }}>
              {getInitials(m.name, m.email)}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "#1A1A1A" }}>
                {m.name ?? "Unknown"}
                {isCurrentUser && (
                  <span style={{
                    marginLeft: 6, fontSize: 10, fontWeight: 600,
                    color: "#1A3A2A", background: "#F0F7F3",
                    padding: "1px 6px", borderRadius: 4,
                  }}>You</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: "#888" }}>{m.email ?? "—"}</div>
            </div>
          </div>

          {/* Role */}
          <div>
            {isAdmin && !isCurrentUser ? (
              <select
                value={m.role}
                onChange={(e) => updateRole(m, e.target.value as MemberRole)}
                style={{
                  fontSize: 12, fontWeight: 600,
                  color: roleStyle.color, background: roleStyle.bg,
                  border: "none", borderRadius: 6,
                  padding: "4px 8px", cursor: "pointer",
                  textTransform: "capitalize", outline: "none",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                <option value="member">Member</option>
                <option value="secretary">Secretary</option>
                <option value="treasurer">Treasurer</option>
                <option value="admin">Admin</option>
              </select>
            ) : (
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: roleStyle.color, background: roleStyle.bg,
                padding: "4px 10px", borderRadius: 6,
                textTransform: "capitalize", display: "inline-block",
              }}>
                {m.role}
              </span>
            )}
          </div>

          {/* Status */}
          <div>
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: statusStyle.color, background: statusStyle.bg,
              padding: "4px 10px", borderRadius: 6, display: "inline-block",
            }}>
              {statusStyle.label}
            </span>
          </div>

          {/* Joined */}
          <div style={{ fontSize: 12, color: "#888" }}>
            {m.joinedAt ? formatDate(m.joinedAt) : "—"}
          </div>

          {/* Actions */}
          {canWrite && (
            <div>
              {isAdmin && !isCurrentUser && (
                <button
                  onClick={() => removeMember(m)}
                  style={{
                    background: "none", border: "1px solid #FECACA",
                    color: "#DC2626", borderRadius: 8,
                    padding: "5px 12px", fontSize: 12,
                    fontWeight: 600, cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#FEF2F2")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      );
    })}
  </div>
)}
      {/* ── Invite modal ── */}
      {showModal && canWrite && (
        <div className="modal-overlay" onClick={resetModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Invite Member</h2>
              <button className="modal-close" onClick={resetModal}>✕</button>
            </div>

            <div className="modal-body">
              {formError && <div className="error-box">⚠ {formError}</div>}

              {!inviteLink ? (
                <>
                  <div className="form-group">
                    <label className="form-label">Email address</label>
                    <input
                      className="form-input"
                      type="email"
                      placeholder="member@example.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select
                      className="form-input"
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value as MemberRole })}
                    >
                      <option value="member">Member</option>
                      <option value="secretary">Secretary</option>
                      <option value="treasurer">Treasurer</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
                    An invite link will be generated. Share it with the member to join.
                  </div>

                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={resetModal}>Cancel</button>
                    <button
                      className="btn-submit"
                      onClick={handleInvite}
                      disabled={submitting}
                    >
                      {submitting ? "Generating..." : "Generate Invite Link"}
                    </button>
                  </div>
                </>
              ) : (
                /* Invite link generated */
                <div>
                  <div style={{
                    background: "#F0F7F3", borderRadius: 12,
                    padding: "16px", marginBottom: 16,
                    border: "1px solid #C8E6C9",
                  }}>
                    <div style={{ fontSize: 12, color: "#1A3A2A", fontWeight: 600, marginBottom: 8 }}>
                      ✅ Invite link generated — expires in 7 days
                    </div>
                    <div style={{
                      fontSize: 12, color: "#444", wordBreak: "break-all",
                      background: "white", borderRadius: 8,
                      padding: "10px 12px", border: "1px solid #E8E8E0",
                    }}>
                      {inviteLink}
                    </div>
                  </div>

                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={resetModal}>Done</button>
                    <button className="btn-submit" onClick={copyLink}>
                      {copied ? "✅ Copied!" : "Copy Link"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}