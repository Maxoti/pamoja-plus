import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  Timestamp,
  orderBy,
  doc,
  updateDoc,
} from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { usePermissions } from "../auth/usePermissions";
import { pageStyles } from "../styles/pageStyles";

interface Contribution {
  id: string;
  userId: string;
  groupId: string;
  amount: number;
  mpesaRef: string;
  status: "pending" | "verified" | "rejected" | "flagged";
  verificationMethod: string;
  createdAt: Timestamp;
}

export default function Contributions() {
  const { currentUser, tenantId } = useAuth();
  const { canWrite, isAdmin,  isTreasurer } = usePermissions();

  const [data, setData] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    amount: "",
    mpesaRef: "",
    groupId: "group_001",
    cycleId: "cycle_001",
    pledgeId: "",
  });

  /**
   * Real-time subscription (tenant-scoped)
   */
  useEffect(() => {
    if (!tenantId) return;

    const q = query(
      collection(db, `tenants/${tenantId}/contributions`),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Contribution)
      );
      setData(rows);
      setLoading(false);
    });

    return unsub;
  }, [tenantId]);

  /**
   * Derived state (memoized)
   */
  const stats = useMemo(() => {
    const total = data.reduce((s, c) => s + c.amount, 0);
    const verified = data.filter((c) => c.status === "verified");
    const pending = data.filter((c) => c.status === "pending");
    const flagged = data.filter((c) => c.status === "flagged");

    return {
      total,
      count: data.length,
      verified,
      pending,
      flagged,
    };
  }, [data]);

  const filtered = useMemo(() => {
    if (!search) return data;

    const s = search.toLowerCase();

    return data.filter(
      (c) =>
        c.mpesaRef.toLowerCase().includes(s) ||
        c.userId.toLowerCase().includes(s) ||
        String(c.amount).includes(s)
    );
  }, [data, search]);

  /**
   * Create contribution (RBAC enforced)
   */
  const handleSubmit = async () => {
    if (!canWrite) {
      setError("You do not have permission to perform this action.");
      return;
    }

    if (!tenantId || !currentUser) return;

    if (!form.amount || !form.mpesaRef) {
      setError("Amount and M-Pesa ref are required");
      return;
    }

    const amount = Number(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setError("Enter a valid amount");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const mpesaRef = form.mpesaRef.toUpperCase();

      await addDoc(collection(db, `tenants/${tenantId}/contributions`), {
        userId: currentUser.uid,
        groupId: form.groupId,
        cycleId: form.cycleId,
        pledgeId: form.pledgeId || null,
        amount,
        mpesaRef,
        status: "pending", // never trust client to set anything else
        verificationMethod: "manual",
        verifiedBy: null,
        verifiedAt: null,
        createdAt: Timestamp.now(),
      });

      await addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser.uid,
        action: "CREATE_CONTRIBUTION",
        entityType: "contribution",
        entityId: mpesaRef,
        timestamp: Timestamp.now(),
      });

      setForm({
        amount: "",
        mpesaRef: "",
        groupId: "group_001",
        cycleId: "cycle_001",
        pledgeId: "",
      });

      setShowModal(false);
    } catch (err) {
      console.error(err);
      setError("Failed to save contribution");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Status updates (strict RBAC)
   */
  const updateStatus = async (
    id: string,
    status: Contribution["status"]
  ) => {
    if (!tenantId || !currentUser) return;

    // Only privileged roles
    if (!( isAdmin || isTreasurer)) {
      setError("You are not allowed to verify or flag contributions.");
      return;
    }

    try {
      await updateDoc(
        doc(db, `tenants/${tenantId}/contributions/${id}`),
        {
          status,
          verifiedBy: currentUser.uid,
          verifiedAt: Timestamp.now(),
        }
      );
    } catch (err) {
      console.error(err);
      setError("Failed to update status");
    }
  };

  const statusBadge = (status: Contribution["status"]) => {
    const map = {
      verified: "badge-verified",
      pending: "badge-pending",
      rejected: "badge-rejected",
      flagged: "badge-flagged",
    };

    return (
      <span className={`badge ${map[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="page">
      <style>{pageStyles}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Contributions</h1>
          <p className="page-sub">
            M-Pesa payments across the tenant
          </p>
        </div>

        {canWrite && (
          <button
            className="btn-add"
            onClick={() => setShowModal(true)}
          >
            + Record Contribution
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total</div>
          <div className="stat-value">
            KES {stats.total.toLocaleString()}
          </div>
          <div className="stat-sub">
            {stats.count} transactions
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Verified</div>
          <div className="stat-value">
            {stats.verified.length}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value">
            {stats.pending.length}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Flagged</div>
          <div className="stat-value">
            {stats.flagged.length}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="loading">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            No contributions found
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Amount</th>
                <th>Ref</th>
                <th>Status</th>
                <th>Date</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>{c.userId}</td>
                  <td>KES {c.amount.toLocaleString()}</td>
                  <td>{c.mpesaRef}</td>
                  <td>{statusBadge(c.status)}</td>
                  <td>
                    {c.createdAt
                      ?.toDate()
                      .toLocaleDateString()}
                  </td>
                  <td>
                    {c.status === "pending" &&
                      (isAdmin ||  isTreasurer) && (
                        <>
                          <button
                            onClick={() =>
                              updateStatus(c.id, "verified")
                            }
                          >
                            Verify
                          </button>
                          <button
                            onClick={() =>
                              updateStatus(c.id, "flagged")
                            }
                          >
                            Flag
                          </button>
                        </>
                      )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && canWrite && (
        <div className="modal-overlay">
          <div className="modal">
            {error && <div>{error}</div>}

            <input
              placeholder="Amount"
              value={form.amount}
              onChange={(e) =>
                setForm({ ...form, amount: e.target.value })
              }
            />

            <input
              placeholder="M-Pesa Ref"
              value={form.mpesaRef}
              onChange={(e) =>
                setForm({
                  ...form,
                  mpesaRef: e.target.value,
                })
              }
            />

            <button
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}