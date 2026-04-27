import { useEffect, useState } from "react";
import { collection, query, onSnapshot, addDoc, Timestamp, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { pageStyles } from "../styles/pageStyles";

const TENANT_ID = "tenant_001"; // Replace with dynamic tenantId from context
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
  const { currentUser } = useAuth();
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    amount: "",
    mpesaRef: "",
    groupId: "group_001",
    cycleId: "cycle_001",
    pledgeId: "",
  });

  useEffect(() => {
    const q = query(
      collection(db, `tenants/${TENANT_ID}/contributions`),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setContributions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Contribution)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const totalCollected = contributions.reduce((sum, c) => sum + c.amount, 0);
  const verified = contributions.filter((c) => c.status === "verified");
  const pending = contributions.filter((c) => c.status === "pending");
  const flagged = contributions.filter((c) => c.status === "flagged");

  const filtered = contributions.filter(
    (c) =>
      c.mpesaRef.toLowerCase().includes(search.toLowerCase()) ||
      c.userId.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!form.amount || !form.mpesaRef) { setError("Amount and M-Pesa ref are required"); return; }
    if (isNaN(Number(form.amount)) || Number(form.amount) <= 0) { setError("Enter a valid amount"); return; }

    // Check duplicate mpesaRef
    const exists = contributions.find((c) => c.mpesaRef.toUpperCase() === form.mpesaRef.toUpperCase());
    if (exists) { setError("This M-Pesa reference already exists. Duplicate rejected."); return; }

    setSubmitting(true);
    setError("");
    try {
      await addDoc(collection(db, `tenants/${TENANT_ID}/contributions`), {
        userId: currentUser?.uid || "unknown",
        groupId: form.groupId,
        cycleId: form.cycleId,
        pledgeId: form.pledgeId || null,
        amount: Number(form.amount),
        mpesaRef: form.mpesaRef.toUpperCase(),
        status: "pending",
        verifiedBy: null,
        verifiedAt: null,
        verificationMethod: "manual",
        checkoutRequestId: null,
        createdAt: Timestamp.now(),
      });

      // Audit log
      await addDoc(collection(db, `tenants/${TENANT_ID}/auditLogs`), {
        actorUserId: currentUser?.uid || "unknown",
        action: "CREATE_CONTRIBUTION",
        entityType: "contribution",
        entityId: form.mpesaRef.toUpperCase(),
        timestamp: Timestamp.now(),
      });

      setForm({ amount: "", mpesaRef: "", groupId: "group_001", cycleId: "cycle_001", pledgeId: "" });
      setShowModal(false);
    } catch {
      setError("Failed to save contribution. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      verified: "badge-verified", pending: "badge-pending",
      rejected: "badge-rejected", flagged: "badge-flagged",
    };
    const icons: Record<string, string> = {
      verified: "✓", pending: "◷", rejected: "✕", flagged: "⚑",
    };
    return <span className={`badge ${map[status] || "badge-pending"}`}>{icons[status]} {status}</span>;
  };

  return (
    <div className="page">
      <style>{pageStyles}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Contributions</h1>
          <p className="page-sub">All M-Pesa payments — verified, pending, and flagged</p>
        </div>
        <button className="btn-add" onClick={() => setShowModal(true)}>
          + Record Contribution
        </button>
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total Collected</div>
          <div className="stat-value">KES {totalCollected.toLocaleString()}</div>
          <div className="stat-sub">{contributions.length} transactions</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Verified</div>
          <div className="stat-value" style={{ color: "#16A34A" }}>{verified.length}</div>
          <div className="stat-sub">KES {verified.reduce((s, c) => s + c.amount, 0).toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Review</div>
          <div className="stat-value" style={{ color: "#B45309" }}>{pending.length}</div>
          <div className="stat-sub">Awaiting verification</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Flagged</div>
          <div className="stat-value" style={{ color: "#EA580C" }}>{flagged.length}</div>
          <div className="stat-sub">Needs attention</div>
        </div>
      </div>

      {/* Search */}
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search by M-Pesa ref or member..."
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
            <div className="empty-icon">💸</div>
            <div className="empty-title">No contributions yet</div>
            <div className="empty-sub">Record the first M-Pesa payment to get started.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Amount</th>
                  <th>M-Pesa Ref</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="avatar" style={{ background: "#1A3A2A", fontSize: 12 }}>
                          {c.userId.slice(0, 2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 500 }}>{c.userId}</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: "monospace", fontWeight: 600, color: "#1A3A2A" }}>
                      KES {c.amount.toLocaleString()}
                    </td>
                    <td><span className="mpesa-ref">{c.mpesaRef}</span></td>
                    <td>{statusBadge(c.status)}</td>
                    <td style={{ fontSize: 12, color: "#888" }}>{c.verificationMethod || "manual"}</td>
                    <td style={{ fontSize: 13, color: "#888" }}>
                      {c.createdAt?.toDate().toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {c.status === "pending" && (
                          <>
                            <button className="action-btn">✓ Verify</button>
                            <button className="action-btn danger">⚑ Flag</button>
                          </>
                        )}
                        {c.status === "flagged" && (
                          <button className="action-btn">Review</button>
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
              <h2 className="modal-title">Record Contribution</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-box">⚠ {error}</div>}

              <div style={{ background: "#FEF9EC", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: "#92400E" }}>
                ⚡ M-Pesa refs are validated for duplicates automatically.
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Amount (KES)</label>
                  <input className="form-input" type="number" placeholder="e.g. 1000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">M-Pesa Reference</label>
                  <input className="form-input" placeholder="e.g. QHJ7YT123" value={form.mpesaRef} onChange={(e) => setForm({ ...form, mpesaRef: e.target.value })} style={{ textTransform: "uppercase" }} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Pledge ID <span style={{ color: "#BBB", fontWeight: 400 }}>(optional)</span></label>
                <input className="form-input" placeholder="Links payment to a pledge" value={form.pledgeId} onChange={(e) => setForm({ ...form, pledgeId: e.target.value })} />
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Saving..." : "Record Payment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}