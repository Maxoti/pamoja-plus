import { useEffect, useMemo, useState } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  Timestamp,
  orderBy,
} from "firebase/firestore";

import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { usePermissions } from "../auth/usePermissions";
import { useTenant } from "../hooks/useTenant";
import { pageStyles } from "../styles/pageStyles";

// ── Types ────────────────────────────────────────────────────────────────────

interface Pledge {
  id: string;
  userId: string;
  groupId: string;
  cycleId: string;
  amountPlanned: number;
  frequency: "weekly" | "monthly" | "one-time";
  status: "active" | "fulfilled" | "defaulted" | "cancelled";
  createdAt: Timestamp;
}

interface FormState {
  userId: string;
  amountPlanned: string;
  frequency: Pledge["frequency"];
  cycleId: string;
  groupId: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Pledges() {
  const { currentUser } = useAuth();
  const { tenantId } = useTenant();
  const { canWrite } = usePermissions();

  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<FormState>({
    userId: "",
    amountPlanned: "",
    frequency: "monthly",
    cycleId: "cycle_001",
    groupId: "group_001",
  });

  // ── Data subscription ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;

    const q = query(
      collection(db, `tenants/${tenantId}/pledges`),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Pledge)
      );
      setPledges(data);
      setLoading(false);
    });

    return unsub;
  }, [tenantId]);

  // ── Derived state (memoized mindset) ───────────────────────────────────────
  const stats = useMemo(() => {
    const totalPlanned = pledges.reduce((s, p) => s + p.amountPlanned, 0);
    const fulfilled = pledges.filter((p) => p.status === "fulfilled");
    const defaulted = pledges.filter((p) => p.status === "defaulted");
    const active = pledges.filter((p) => p.status === "active");

    const fulfillmentRate =
      pledges.length > 0
        ? Math.round((fulfilled.length / pledges.length) * 100)
        : 0;

    return { totalPlanned, fulfilled, defaulted, active, fulfillmentRate };
  }, [pledges]);

  const filtered = useMemo(() => {
    return pledges.filter(
      (p) =>
        p.userId.toLowerCase().includes(search.toLowerCase()) ||
        p.frequency.toLowerCase().includes(search.toLowerCase())
    );
  }, [pledges, search]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = (): string | null => {
    if (!form.userId.trim()) return "Member is required";
    if (!form.amountPlanned) return "Amount is required";

    const amount = Number(form.amountPlanned);
    if (isNaN(amount) || amount <= 0) return "Enter a valid amount";

    return null;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canWrite) {
      setError("You do not have permission to create pledges.");
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!tenantId) {
      setError("Tenant not loaded.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await addDoc(collection(db, `tenants/${tenantId}/pledges`), {
        userId: form.userId.trim(),
        groupId: form.groupId,
        cycleId: form.cycleId,
        amountPlanned: Number(form.amountPlanned),
        frequency: form.frequency,
        status: "active",
        createdAt: Timestamp.now(),
      });

      await addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser?.uid ?? "unknown",
        action: "CREATE_PLEDGE",
        entityType: "pledge",
        entityId: form.userId.trim(),
        timestamp: Timestamp.now(),
      });

      // Reset
      setForm({
        userId: "",
        amountPlanned: "",
        frequency: "monthly",
        cycleId: "cycle_001",
        groupId: "group_001",
      });

      setShowModal(false);
    } catch (err) {
      console.error("Create pledge error:", err);
      setError("Failed to save pledge. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── UI helpers ─────────────────────────────────────────────────────────────
  const statusBadge = (status: Pledge["status"]) => {
    const map = {
      active: "badge-active",
      fulfilled: "badge-fulfilled",
      defaulted: "badge-defaulted",
      cancelled: "badge-cancelled",
    };

    const icons = {
      active: "◉",
      fulfilled: "✓",
      defaulted: "✕",
      cancelled: "○",
    };

    return (
      <span className={`badge ${map[status]}`}>
        {icons[status]} {status}
      </span>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <style>{pageStyles}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Pledges</h1>
          <p className="page-sub">
            Member commitments before money moves
          </p>
        </div>

        {canWrite && (
          <button className="btn-add" onClick={() => setShowModal(true)}>
            + Add Pledge
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total Pledged</div>
          <div className="stat-value">
            KES {stats.totalPlanned.toLocaleString()}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Fulfilment Rate</div>
          <div
            className="stat-value"
            style={{
              color: stats.fulfillmentRate >= 70 ? "#16A34A" : "#B45309",
            }}
          >
            {stats.fulfillmentRate}%
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value">{stats.active.length}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Defaulters</div>
          <div className="stat-value" style={{ color: "#DC2626" }}>
            {stats.defaulted.length}
          </div>
        </div>
      </div>

      {/* Warning */}
      {stats.defaulted.length > 0 && (
        <div className="error-box">
          {stats.defaulted.length} defaulted pledge(s) require follow-up.
        </div>
      )}

      {/* Search */}
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search pledges..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="loading">
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No pledges yet</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Amount</th>
                  <th>Frequency</th>
                  <th>Status</th>
                  <th>Date</th>
                  {canWrite && <th>Actions</th>}
                </tr>
              </thead>

              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>{p.userId}</td>

                    <td>KES {p.amountPlanned.toLocaleString()}</td>

                    <td style={{ textTransform: "capitalize" }}>
                      {p.frequency}
                    </td>

                    <td>{statusBadge(p.status)}</td>

                    <td>
                      {p.createdAt
                        ?.toDate()
                        .toLocaleDateString("en-KE")}
                    </td>

                    {canWrite && (
                      <td>
                        {p.status === "active" && (
                          <>
                            <button className="action-btn">✓ Fulfil</button>
                            <button className="action-btn danger">
                              ✕ Default
                            </button>
                          </>
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

      {/* Modal */}
      {showModal && canWrite && (
        <div
          className="modal-overlay"
          onClick={() => setShowModal(false)}
        >
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Add Pledge</h2>
            </div>

            <div className="modal-body">
              {error && <div className="error-box">{error}</div>}

              <input
                className="form-input"
                placeholder="Member ID"
                value={form.userId}
                onChange={(e) =>
                  setForm({ ...form, userId: e.target.value })
                }
              />

              <input
                className="form-input"
                type="number"
                placeholder="Amount"
                value={form.amountPlanned}
                onChange={(e) =>
                  setForm({
                    ...form,
                    amountPlanned: e.target.value,
                  })
                }
              />

              <select
                className="form-input"
                value={form.frequency}
                onChange={(e) =>
                  setForm({
                    ...form,
                    frequency: e.target.value as Pledge["frequency"],
                  })
                }
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="one-time">One-time</option>
              </select>

              <div className="modal-actions">
                <button onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}