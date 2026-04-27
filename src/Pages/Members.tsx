import { useEffect, useState } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  setDoc,
  doc,
  Timestamp,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { useTenant } from "../hooks/useTenant";
import { pageStyles } from "../styles/pageStyles";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Member {
  id: string;
  userId: string;
  tenantId: string;
  name?: string;
  email?: string;
  role: "owner" | "admin" | "treasurer" | "member";
  status: "active" | "invited";
  joinedAt: Timestamp;
}

interface InviteForm {
  email: string;
  role: Member["role"];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  owner:     "#C8891A",
  admin:     "#7C3AED",
  treasurer: "#2563EB",
  member:    "#374151",
};

const AVATAR_COLORS = [
  "#1A3A2A", "#C8891A", "#2D6A4F",
  "#7C3AED", "#2563EB", "#B45309",
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Members() {
  const { currentUser } = useAuth();
  const { tenantId, loading: tenantLoading } = useTenant();

  // ── State ──────────────────────────────────────────────────────────────────
  const [members, setMembers]               = useState<Member[]>([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState("");
  const [showModal, setShowModal]           = useState(false);
  const [form, setForm]                     = useState<InviteForm>({ email: "", role: "member" });
  const [submitting, setSubmitting]         = useState(false);
  const [error, setError]                   = useState("");
  const [inviteLink, setInviteLink]         = useState("");
  const [showInviteLink, setShowInviteLink] = useState(false);
  const [copied, setCopied]                 = useState(false);

  // ── Real-time members listener (scoped to this tenant only) ────────────────
  useEffect(() => {
    if (!tenantId) return;

    const q = query(
      collection(db, "tenantMembers"),
      where("tenantId", "==", tenantId),  // ← security: only this tenant's members
      orderBy("joinedAt", "desc"),
    );

    const unsub = onSnapshot(q, (snap) => {
      setMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Member)));
      setLoading(false);
    });

    return unsub;
  }, [tenantId]);

  // ── Derived state ──────────────────────────────────────────────────────────
  const filtered = members.filter((m) =>
    (m.name ?? m.userId).toLowerCase().includes(search.toLowerCase()) ||
    (m.email ?? "").toLowerCase().includes(search.toLowerCase()) ||
    m.role.toLowerCase().includes(search.toLowerCase())
  );

  const active  = members.filter((m) => m.status === "active");
  const invited = members.filter((m) => m.status === "invited");
  const admins  = members.filter((m) => m.role === "admin" || m.role === "owner");

  // ── Invite handler ─────────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!form.email.trim()) { setError("Email address is required"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError("Please enter a valid email address"); return;
    }
    if (!tenantId) { setError("Tenant not loaded yet. Please wait."); return; }

    setSubmitting(true);
    setError("");

    try {
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await setDoc(doc(db, "invites", token), {
        email:     form.email.trim().toLowerCase(),
        role:      form.role,
        tenantId,                           // ← always the real tenantId, never hardcoded
        status:    "pending",
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(expiresAt),
        invitedBy: currentUser?.uid ?? "unknown",
      });

      await addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser?.uid ?? "unknown",
        action:      "MEMBER_INVITED",
        entityType:  "invite",
        entityId:    token,
        metadata:    { email: form.email.trim(), role: form.role },
        timestamp:   Timestamp.now(),
      });

      setInviteLink(`${window.location.origin}/join?token=${token}`);
      setShowInviteLink(true);
    } catch (err) {
      console.error("Invite error:", err);
      setError("Failed to create invite. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Copy handler ───────────────────────────────────────────────────────────
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      const el = document.createElement("textarea");
      el.value = inviteLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // ── Close modal ────────────────────────────────────────────────────────────
  const closeModal = () => {
    setShowModal(false);
    setShowInviteLink(false);
    setInviteLink("");
    setForm({ email: "", role: "member" });
    setError("");
    setCopied(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const isLoading = tenantLoading || loading;

  return (
    <div className="page">
      <style>{`
        ${pageStyles}

        .invite-success {
          background: #F0F9F4; border: 1.5px solid #86EFAC;
          border-radius: 14px; padding: 20px; margin-bottom: 4px;
        }
        .invite-success-label {
          font-size: 11px; font-weight: 700; letter-spacing: 2px;
          text-transform: uppercase; color: #16A34A; margin-bottom: 8px;
        }
        .invite-success-title { font-size: 15px; font-weight: 600; color: #14532D; margin-bottom: 4px; }
        .invite-success-sub   { font-size: 13px; color: #16A34A; margin-bottom: 16px; }
        .link-box {
          display: flex; align-items: center; gap: 8px;
          background: white; border: 1.5px solid #BBF7D0;
          border-radius: 10px; padding: 10px 14px;
        }
        .link-text {
          flex: 1; font-family: 'Courier New', monospace;
          font-size: 12px; color: #1A3A2A; word-break: break-all; line-height: 1.4;
        }
        .copy-btn {
          flex-shrink: 0; background: #1A3A2A; color: white; border: none;
          border-radius: 8px; padding: 7px 14px; font-size: 12px; font-weight: 700;
          cursor: pointer; font-family: 'DM Sans', sans-serif;
          transition: all 0.2s; white-space: nowrap;
        }
        .copy-btn.copied              { background: #16A34A; }
        .copy-btn:hover:not(.copied)  { background: #0F2419; }
        .whatsapp-hint {
          display: flex; align-items: center; gap: 8px;
          margin-top: 12px; font-size: 12px; color: #16A34A; font-weight: 500;
        }
        .expiry-note   { font-size: 11px; color: #888; margin-top: 8px; text-align: center; }
        .invite-another {
          width: 100%; margin-top: 12px; padding: 10px; background: transparent;
          border: 1.5px solid #E8E8E0; border-radius: 10px; font-size: 13px;
          font-weight: 600; color: #555; cursor: pointer;
          font-family: 'DM Sans', sans-serif; transition: all 0.2s;
        }
        .invite-another:hover { border-color: #1A3A2A; color: #1A3A2A; }
      `}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Members</h1>
          <p className="page-sub">Manage who belongs to your welfare group</p>
        </div>
        <button className="btn-add" onClick={() => setShowModal(true)}>
          + Invite Member
        </button>
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total Members</div>
          <div className="stat-value">{members.length}</div>
          <div className="stat-sub">across all roles</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value" style={{ color: "#16A34A" }}>{active.length}</div>
          <div className="stat-sub">confirmed members</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Invites</div>
          <div className="stat-value" style={{ color: "#B45309" }}>{invited.length}</div>
          <div className="stat-sub">awaiting acceptance</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Admins</div>
          <div className="stat-value">{admins.length}</div>
          <div className="stat-sub">with elevated access</div>
        </div>
      </div>

      {/* Search */}
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search by name, email or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">👥</div>
            <div className="empty-title">No members yet</div>
            <div className="empty-sub">Invite your first member to get started.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => (
                  <tr key={m.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div
                          className="avatar"
                          style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}
                        >
                          {(m.name ?? m.email ?? m.userId).slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: 14 }}>
                            {m.name ?? m.userId}
                          </div>
                          <div style={{ fontSize: 12, color: "#888" }}>
                            {m.email ?? m.userId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge badge-${m.role}`}
                        style={{ color: ROLE_COLORS[m.role] }}
                      >
                        {m.role}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${m.status === "active" ? "badge-active" : "badge-pending"}`}>
                        {m.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "#888" }}>
                      {m.joinedAt?.toDate().toLocaleDateString("en-KE", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="action-btn">Change role</button>
                        {m.role !== "owner" && (
                          <button className="action-btn danger">Remove</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {showInviteLink ? "Invite Ready 🎉" : "Invite Member"}
              </h2>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>

            <div className="modal-body">

              {/* Step 1: Form */}
              {!showInviteLink && (
                <>
                  {error && <div className="error-box">⚠ {error}</div>}

                  <div className="form-group">
                    <label className="form-label">Email address</label>
                    <input
                      className="form-input"
                      type="email"
                      placeholder="e.g. jane@example.com"
                      value={form.email}
                      onChange={(e) => { setForm({ ...form, email: e.target.value }); setError(""); }}
                      onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                      autoFocus
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select
                      className="form-input"
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value as Member["role"] })}
                    >
                      <option value="member">Member</option>
                      <option value="treasurer">Treasurer</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>

                  <div style={{
                    background: "#F0F7F3", border: "1px solid #BBDDC9",
                    borderRadius: 10, padding: "10px 14px",
                    fontSize: 13, color: "#1A5C35", marginBottom: 16,
                  }}>
                    ℹ Role permissions: Owner › Admin › Treasurer › Member
                  </div>

                  <div className="modal-actions">
                    <button className="btn-cancel" onClick={closeModal}>Cancel</button>
                    <button className="btn-submit" onClick={handleInvite} disabled={submitting}>
                      {submitting ? "Generating link…" : "Generate Invite Link →"}
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Invite link */}
              {showInviteLink && (
                <>
                  <div className="invite-success">
                    <div className="invite-success-label">Invite link generated</div>
                    <div className="invite-success-title">Send this link to {form.email}</div>
                    <div className="invite-success-sub">
                      They'll be added as <strong>{form.role}</strong> when they sign up.
                    </div>
                    <div className="link-box">
                      <span className="link-text">{inviteLink}</span>
                      <button
                        className={`copy-btn ${copied ? "copied" : ""}`}
                        onClick={handleCopy}
                      >
                        {copied ? "✓ Copied!" : "Copy"}
                      </button>
                    </div>
                    <div className="whatsapp-hint">
                      <span>📱</span>
                      <span>Paste this link in WhatsApp, SMS, or email</span>
                    </div>
                  </div>

                  <div className="expiry-note">⏱ This link expires in 7 days</div>

                  <button
                    className="invite-another"
                    onClick={() => {
                      setShowInviteLink(false);
                      setForm({ email: "", role: "member" });
                      setInviteLink("");
                      setCopied(false);
                    }}
                  >
                    + Invite another member
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}