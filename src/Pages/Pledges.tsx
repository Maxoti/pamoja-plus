import { useEffect, useState } from "react";
import { collection, query, onSnapshot, addDoc, Timestamp, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { pageStyles } from "../styles/pageStyles";
const TENANT_ID = "tenant_001";

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

export default function Pledges() {
  const { currentUser } = useAuth();
  const [pledges, setPledges] = useState<Pledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    userId: "",
    amountPlanned: "",
    frequency: "monthly" as Pledge["frequency"],
    cycleId: "cycle_001",
    groupId: "group_001",
  });

  useEffect(() => {
    const q = query(
      collection(db, `tenants/${TENANT_ID}/pledges`),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setPledges(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Pledge)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const totalPlanned = pledges.reduce((s, p) => s + p.amountPlanned, 0);
  const fulfilled = pledges.filter((p) => p.status === "fulfilled");
  const defaulted = pledges.filter((p) => p.status === "defaulted");
  const active = pledges.filter((p) => p.status === "active");

  const filtered = pledges.filter((p) =>
    p.userId.toLowerCase().includes(search.toLowerCase()) ||
    p.frequency.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!form.userId || !form.amountPlanned) { setError("Member and amount are required"); return; }
    if (isNaN(Number(form.amountPlanned)) || Number(form.amountPlanned) <= 0) { setError("Enter a valid amount"); return; }

    setSubmitting(true);
    setError("");
    try {
      await addDoc(collection(db, `tenants/${TENANT_ID}/pledges`), {
        userId: form.userId.trim(),
        groupId: form.groupId,
        cycleId: form.cycleId,
        amountPlanned: Number(form.amountPlanned),
        frequency: form.frequency,
        status: "active",
        createdAt: Timestamp.now(),
      });

      await addDoc(collection(db, `tenants/${TENANT_ID}/auditLogs`), {
        actorUserId: currentUser?.uid || "unknown",
        action: "CREATE_PLEDGE",
        entityType: "pledge",
        entityId: form.userId.trim(),
        timestamp: Timestamp.now(),
      });

      setForm({ userId: "", amountPlanned: "", frequency: "monthly", cycleId: "cycle_001", groupId: "group_001" });
      setShowModal(false);
    } catch {
      setError("Failed to save pledge. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      active: "badge-active", fulfilled: "badge-fulfilled",
      defaulted: "badge-defaulted", cancelled: "badge-cancelled",
    };
    const icons: Record<string, string> = {
      active: "◉", fulfilled: "✓", defaulted: "✕", cancelled: "○",
    };
    return <span className={`badge ${map[status]}`}>{icons[status]} {status}</span>;
  };

  const fulfillmentRate = pledges.length > 0 ? Math.round((fulfilled.length / pledges.length) * 100) : 0;

  return (
    <div className="page">
      <style>{pageStyles}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Pledges</h1>
          <p className="page-sub">Member commitments before money moves — track accountability</p>
        </div>
        <button className="btn-add" onClick={() => setShowModal(true)}>
          + Add Pledge
        </button>
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total Pledged</div>
          <div className="stat-value">KES {totalPlanned.toLocaleString()}</div>
          <div className="stat-sub">{pledges.length} commitments</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Fulfilment Rate</div>
          <div className="stat-value" style={{ color: fulfillmentRate >= 70 ? "#16A34A" : "#B45309" }}>
            {fulfillmentRate}%
          </div>
          <div className="stat-sub">{fulfilled.length} fulfilled</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Pledges</div>
          <div className="stat-value" style={{ color: "#2563EB" }}>{active.length}</div>
          <div className="stat-sub">ongoing commitments</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Defaulters</div>
          <div className="stat-value" style={{ color: "#DC2626" }}>{defaulted.length}</div>
          <div className="stat-sub">need follow-up</div>
        </div>
      </div>

      {/* Defaulter warning */}
      {defaulted.length > 0 && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: "#DC2626" }}>
          <span style={{ fontSize: 20 }}></span>
          <div>
            <strong>{defaulted.length} defaulted pledge{defaulted.length > 1 ? "s" : ""}</strong> — members have not fulfilled their commitments. Consider sending a reminder.
          </div>
        </div>
      )}

      {/* Search */}
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search by member or frequency..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="card">
        {loading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"></div>
            <div className="empty-title">No pledges yet</div>
            <div className="empty-sub">Pledges track member intentions before payments are made.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Amount Planned</th>
                  <th>Frequency</th>
                  <th>Cycle</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="avatar" style={{ background: "#1A3A2A", fontSize: 12 }}>
                          {p.userId.slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{p.userId}</span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 600, color: "#1A3A2A", fontFamily: "monospace" }}>
                      KES {p.amountPlanned.toLocaleString()}
                    </td>
                    <td>
                      <span style={{ fontSize: 13, color: "#555", textTransform: "capitalize" }}>
                        {p.frequency === "monthly" ? "" : p.frequency === "weekly" ? "🗓" : "1️⃣"} {p.frequency}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "#888" }}>{p.cycleId}</td>
                    <td>{statusBadge(p.status)}</td>
                    <td style={{ fontSize: 13, color: "#888" }}>
                      {p.createdAt?.toDate().toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {p.status === "active" && (
                          <>
                            <button className="action-btn">✓ Fulfil</button>
                            <button className="action-btn danger">✕ Default</button>
                          </>
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

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Add Pledge</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-box">⚠ {error}</div>}

              <div className="form-group">
                <label className="form-label">Member ID</label>
                <input className="form-input" placeholder="e.g. user_001" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount Planned (KES)</label>
                  <input className="form-input" type="number" placeholder="e.g. 1000" value={form.amountPlanned} onChange={(e) => setForm({ ...form, amountPlanned: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Frequency</label>
                  <select className="form-input" value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as Pledge["frequency"] })}>
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="one-time">One-time</option>
                  </select>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Saving..." : "Add Pledge"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}