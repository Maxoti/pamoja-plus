import { useEffect, useMemo, useState } from "react";
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
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { usePermissions } from "../auth/usePermissions";
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function Members() {
  const { currentUser, tenantId } = useAuth();
  const {
    canWrite,
    isAdmin,
  } = usePermissions();

  const [data, setData] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    email: "",
    role: "member" as Member["role"],
  });

  const [inviteLink, setInviteLink] = useState("");
  const [showInviteLink, setShowInviteLink] = useState(false);

  /**
   * Tenant-scoped members subscription
   */
  useEffect(() => {
    if (!tenantId) return;

    const q = query(
      collection(db, "tenantMembers"),
      where("tenantId", "==", tenantId),
      orderBy("joinedAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Member)
      );
      setData(rows);
      setLoading(false);
    });

    return unsub;
  }, [tenantId]);

  /**
   * Derived state
   */
  const filtered = useMemo(() => {
    const s = search.toLowerCase();

    return data.filter((m) =>
      (m.name ?? m.userId).toLowerCase().includes(s) ||
      (m.email ?? "").toLowerCase().includes(s) ||
      m.role.toLowerCase().includes(s)
    );
  }, [data, search]);

  const stats = useMemo(() => {
    return {
      total: data.length,
      active: data.filter((m) => m.status === "active").length,
      invited: data.filter((m) => m.status === "invited").length,
      admins: data.filter(
        (m) => m.role === "admin" || m.role === "owner"
      ).length,
    };
  }, [data]);

  /**
   * Invite member (RBAC enforced)
   */
  const handleInvite = async () => {
    if (!canWrite) {
      setError("You do not have permission to invite members.");
      return;
    }

    if (!tenantId || !currentUser) return;

    if (!form.email.trim()) {
      setError("Email is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const token = crypto.randomUUID();
      const expires = new Date();
      expires.setDate(expires.getDate() + 7);

      await setDoc(doc(db, "invites", token), {
        email: form.email.trim().toLowerCase(),
        role: form.role,
        tenantId,
        status: "pending",
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(expires),
        invitedBy: currentUser.uid,
      });

      await addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser.uid,
        action: "MEMBER_INVITED",
        entityType: "invite",
        entityId: token,
        timestamp: Timestamp.now(),
      });

      setInviteLink(`${window.location.origin}/join?token=${token}`);
      setShowInviteLink(true);
    } catch (err) {
      console.error(err);
      setError("Failed to create invite");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Role update (STRICT RBAC)
   */
  const updateRole = async (member: Member, newRole: Member["role"]) => {
    if (!tenantId || !currentUser) return;

    // Only owner/admin can change roles
    if ( ( isAdmin)) {
      setError("Not authorized to change roles.");
      return;
    }

    // Prevent owner downgrade
    if (member.role === "owner") {
      setError("Owner role cannot be changed.");
      return;
    }

    try {
      await updateDoc(doc(db, "tenantMembers", member.id), {
        role: newRole,
      });

      await addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser.uid,
        action: "ROLE_UPDATED",
        entityType: "member",
        entityId: member.id,
        metadata: { newRole },
        timestamp: Timestamp.now(),
      });
    } catch (err) {
      console.error(err);
      setError("Failed to update role");
    }
  };

  /**
   * Remove member (STRICT RBAC)
   */
  const removeMember = async (member: Member) => {
    if (!tenantId || !currentUser) return;

    if (!( isAdmin)) {
      setError("Not authorized to remove members.");
      return;
    }

    if (member.role === "owner") {
      setError("Owner cannot be removed.");
      return;
    }

    try {
      await deleteDoc(doc(db, "tenantMembers", member.id));

      await addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser.uid,
        action: "MEMBER_REMOVED",
        entityType: "member",
        entityId: member.id,
        timestamp: Timestamp.now(),
      });
    } catch (err) {
      console.error(err);
      setError("Failed to remove member");
    }
  };

  return (
    <div className="page">
      <style>{pageStyles}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Members</h1>
          <p className="page-sub">
            Manage your tenant members
          </p>
        </div>

        {canWrite && (
          <button
            className="btn-add"
            onClick={() => setShowModal(true)}
          >
            + Invite Member
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total</div>
          <div className="stat-value">{stats.total}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value">{stats.active}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Invited</div>
          <div className="stat-value">{stats.invited}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Admins</div>
          <div className="stat-value">{stats.admins}</div>
        </div>
      </div>

      {/* Search */}
      <input
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Table */}
      {loading ? (
        <div>Loading...</div>
      ) : filtered.length === 0 ? (
        <div>No members found</div>
      ) : (
        <table>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id}>
                <td>{m.name ?? m.email ?? m.userId}</td>
                <td>{m.role}</td>
                <td>{m.status}</td>

                <td>
                  {(isAdmin) && (
                    <>
                      <button
                        onClick={() =>
                          updateRole(m, "admin")
                        }
                      >
                        Promote
                      </button>

                      {m.role !== "owner" && (
                        <button
                          onClick={() => removeMember(m)}
                        >
                          Remove
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal */}
      {showModal && canWrite && (
        <div className="modal">
          {error && <div>{error}</div>}

          <input
            placeholder="Email"
            value={form.email}
            onChange={(e) =>
              setForm({ ...form, email: e.target.value })
            }
          />

          <select
            value={form.role}
            onChange={(e) =>
              setForm({
                ...form,
                role: e.target.value as Member["role"],
              })
            }
          >
            <option value="member">Member</option>
            <option value="treasurer">Treasurer</option>
            <option value="admin">Admin</option>
          </select>

          <button
            onClick={handleInvite}
            disabled={submitting}
          >
            Invite
          </button>

          {showInviteLink && (
            <div>{inviteLink}</div>
          )}
        </div>
      )}
    </div>
  );
}