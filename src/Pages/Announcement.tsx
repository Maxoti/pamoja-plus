import { useEffect, useState } from "react";
import { collection, query, onSnapshot, addDoc, Timestamp, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { pageStyles } from "../styles/pageStyles";
const TENANT_ID = "tenant_001";

interface Announcement {
  id: string;
  title: string;
  body: string;
  postedBy: string;
  groupId: string;
  createdAt: Timestamp;
}

const avatarColors = ["#1A3A2A", "#C8891A", "#2D6A4F", "#7C3AED", "#2563EB"];
  const now = Date.now();

export default function Announcements() {
  const { currentUser } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: "",
    body: "",
    groupId: "group_001",
  });

  useEffect(() => {
    const q = query(
      collection(db, `tenants/${TENANT_ID}/announcements`),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const filtered = announcements.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.body.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      setError("Title and message are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await addDoc(collection(db, `tenants/${TENANT_ID}/announcements`), {
        title: form.title.trim(),
        body: form.body.trim(),
        postedBy: currentUser?.uid || "unknown",
        groupId: form.groupId,
        createdAt: Timestamp.now(),
      });

      await addDoc(collection(db, `tenants/${TENANT_ID}/auditLogs`), {
        actorUserId: currentUser?.uid || "unknown",
        action: "CREATE_ANNOUNCEMENT",
        entityType: "announcement",
        entityId: form.title.trim(),
        timestamp: Timestamp.now(),
      });

      setForm({ title: "", body: "", groupId: "group_001" });
      setShowModal(false);
    } catch {
      setError("Failed to post announcement.");
    } finally {
      setSubmitting(false);
    }
  };


const timeAgo = (ts: Timestamp) => {
  const diff = now - ts.toDate().getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return "Just now";
};

  return (
    <div className="page">
      <style>{pageStyles}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Announcements</h1>
          <p className="page-sub">Post notices that reach every member instantly</p>
        </div>
        <button className="btn-add" onClick={() => setShowModal(true)}>
          + Post Announcement
        </button>
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total Posts</div>
          <div className="stat-value">{announcements.length}</div>
          <div className="stat-sub">all time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">This Month</div>
          <div className="stat-value">
            {announcements.filter((a) => {
              const d = a.createdAt?.toDate();
              const now = new Date();
              return d?.getMonth() === now.getMonth() && d?.getFullYear() === now.getFullYear();
            }).length}
          </div>
          <div className="stat-sub">recent announcements</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Last Post</div>
          <div className="stat-value" style={{ fontSize: 16 }}>
            {announcements.length > 0 ? timeAgo(announcements[0].createdAt) : "—"}
          </div>
          <div className="stat-sub">{announcements.length > 0 ? announcements[0].title.slice(0, 20) + "..." : "No posts"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pinned</div>
          <div className="stat-value">0</div>
          <div className="stat-sub">pinned notices</div>
        </div>
      </div>

      {/* Search */}
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search announcements..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Posts */}
      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">📢</div>
            <div className="empty-title">No announcements yet</div>
            <div className="empty-sub">Post a notice to keep all members informed.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((a, i) => (
            <div key={a.id} style={{
              background: "white", border: "1px solid #E8E8E0", borderRadius: 16,
              padding: "24px 28px", transition: "box-shadow 0.2s",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", gap: 14, flex: 1 }}>
                  {/* Avatar */}
                  <div className="avatar" style={{ background: avatarColors[i % avatarColors.length], width: 40, height: 40, fontSize: 15, flexShrink: 0, marginTop: 2 }}>
                    {a.postedBy.slice(0, 2).toUpperCase()}
                  </div>

                  <div style={{ flex: 1 }}>
                    {/* Header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 15, color: "#1A1A1A" }}>{a.title}</span>
                    </div>

                    {/* Meta */}
                    <div style={{ fontSize: 12, color: "#AAA", marginBottom: 12 }}>
                      Posted by <strong style={{ color: "#888" }}>{a.postedBy}</strong> · {timeAgo(a.createdAt)} ·{" "}
                      {a.createdAt?.toDate().toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })}
                    </div>

                    {/* Body */}
                    <div style={{
                      fontSize: 14, color: "#444", lineHeight: 1.7,
                      background: "#FAFAF7", borderRadius: 10, padding: "12px 16px",
                      borderLeft: "3px solid #C8891A",
                    }}>
                      {a.body}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Post Announcement</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-box">⚠ {error}</div>}

              <div className="form-group">
                <label className="form-label">Title</label>
                <input className="form-input" placeholder="e.g. Meeting this Saturday" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea
                  className="form-input"
                  placeholder="Write your announcement here..."
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  style={{ minHeight: 120 }}
                />
              </div>

              <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
                📣 This will be visible to all group members.
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Posting..." : "Post Announcement"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}