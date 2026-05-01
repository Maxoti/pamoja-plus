import { useEffect, useState, useMemo } from "react";
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  Timestamp,
  orderBy,
  type QuerySnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db, resolveTenantId } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { usePermissions } from "../auth/usePermissions";
import { pageStyles } from "../styles/pageStyles";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Announcement {
  id:        string;
  title:     string;
  body:      string;
  postedBy:  string;
  groupId:   string;
  createdAt: Timestamp;
}

interface AnnouncementForm {
  title:   string;
  body:    string;
  groupId: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AVATAR_COLORS  = ["#1A3A2A", "#C8891A", "#2D6A4F", "#7C3AED", "#2563EB"];
const INITIAL_FORM: AnnouncementForm = { title: "", body: "", groupId: "group_001" };

// ── Helpers ───────────────────────────────────────────────────────────────────

const timeAgo = (ts: Timestamp, baseTime: number): string => {
  if (!ts) return "—";
  const diff  = baseTime - ts.toDate().getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0)  return `${mins}m ago`;
  return "Just now";
};

const formatDate = (ts: Timestamp): string =>
  ts?.toDate().toLocaleDateString("en-KE", {
    day: "numeric", month: "long", year: "numeric",
  });

// ── Component ─────────────────────────────────────────────────────────────────

export default function Announcements() {
  const { currentUser }    = useAuth();
  const { canWrite }       = usePermissions();
  const tenantId           = resolveTenantId() ?? "tenant_001";
  const [renderTime]       = useState(() => Date.now());

  // ── State ──────────────────────────────────────────────────────────────────
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [fetchError,    setFetchError]    = useState<string | null>(null);
  const [search,        setSearch]        = useState("");
  const [showModal,     setShowModal]     = useState(false);
  const [form,          setForm]          = useState<AnnouncementForm>(INITIAL_FORM);
  const [formError,     setFormError]     = useState("");
  const [submitting,    setSubmitting]    = useState(false);

  // ── Firestore realtime listener ────────────────────────────────────────────
  useEffect(() => {
    const q = query(
      collection(db, `tenants/${tenantId}/announcements`),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<DocumentData>) => {
        setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement)));
        setLoading(false);
        setFetchError(null);
      },
      (err) => {
        console.error("[Announcements] listener error:", err);
        setFetchError("Could not load announcements. Check your connection.");
        setLoading(false);
      }
    );

    return unsub;
  }, [tenantId]);

  // ── Derived state (memoized) ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return announcements.filter(
      (a) =>
        a.title.toLowerCase().includes(term) ||
        a.body.toLowerCase().includes(term)
    );
  }, [announcements, search]);

  const thisMonthCount = useMemo(() => {
    const now = new Date();
    return announcements.filter((a) => {
      if (!a.createdAt) return false;
      const d = a.createdAt.toDate();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [announcements]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const resetModal = () => {
    setShowModal(false);
    setForm(INITIAL_FORM);
    setFormError("");
  };

  const updateForm = (field: keyof AnnouncementForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.title.trim()) { setFormError("Title is required");   return; }
    if (!form.body.trim())  { setFormError("Message is required"); return; }

    setSubmitting(true);
    setFormError("");

    try {
      const ref = await addDoc(
        collection(db, `tenants/${tenantId}/announcements`),
        {
          title:     form.title.trim(),
          body:      form.body.trim(),
          postedBy:  currentUser?.uid ?? "unknown",
          groupId:   form.groupId,
          createdAt: Timestamp.now(),
        }
      );

      // Fire-and-forget audit log — non-critical
      addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser?.uid ?? "unknown",
        action:      "CREATE_ANNOUNCEMENT",
        entityType:  "announcement",
        entityId:    ref.id,
        timestamp:   Timestamp.now(),
      }).catch((err) => console.warn("[Announcements] audit log failed:", err));

      resetModal();
    } catch (err) {
      console.error("[Announcements] post error:", err);
      setFormError("Failed to post announcement. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <style>{pageStyles}</style>

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Announcements</h1>
          <p className="page-sub">Post notices that reach every member instantly</p>
        </div>

        {/* RBAC: only owner, admin, treasurer see this */}
        {canWrite && (
          <button className="btn-add" onClick={() => setShowModal(true)}>
            + Post Announcement
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="stat-row">
        {[
          { label: "Total Posts",  value: announcements.length, sub: "all time" },
          { label: "This Month",   value: thisMonthCount,        sub: "recent announcements" },
          {
            label: "Last Post",
            value: announcements[0]
              ? timeAgo(announcements[0].createdAt, renderTime)
              : "—",
            sub: announcements[0]?.title?.slice(0, 24) ?? "No posts yet",
            small: true,
          },
          { label: "Pinned", value: 0, sub: "pinned notices" },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={s.small ? { fontSize: 16 } : {}}>
              {s.value}
            </div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Search announcements..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Body ── */}
      {fetchError ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-title" style={{ color: "#DC2626" }}>
              {fetchError}
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"></div>
            <div className="empty-title">No announcements yet</div>
            <div className="empty-sub">
              {canWrite
                ? "Post a notice to keep all members informed."
                : "No announcements have been posted yet."}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((a, i) => (
            <div
              key={a.id}
              style={{
                background: "white", border: "1px solid #E8E8E0",
                borderRadius: 16, padding: "24px 28px",
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div
                  className="avatar"
                  style={{
                    background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                    width: 40, height: 40, fontSize: 15,
                    flexShrink: 0, marginTop: 2,
                  }}
                >
                  {a.postedBy.slice(0, 2).toUpperCase()}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: "#1A1A1A", marginBottom: 6 }}>
                    {a.title}
                  </div>

                  <div style={{ fontSize: 12, color: "#AAA", marginBottom: 12 }}>
                    Posted by <strong style={{ color: "#888" }}>{a.postedBy}</strong>
                    {" · "}{timeAgo(a.createdAt, renderTime)}
                    {" · "}{formatDate(a.createdAt)}
                  </div>

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
          ))}
        </div>
      )}

      {/* ── Modal (canWrite guard — defence in depth) ── */}
      {showModal && canWrite && (
        <div className="modal-overlay" onClick={resetModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Post Announcement</h2>
              <button className="modal-close" onClick={resetModal}>✕</button>
            </div>

            <div className="modal-body">
              {formError && <div className="error-box">⚠ {formError}</div>}

              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  className="form-input"
                  placeholder="e.g. Meeting this Saturday"
                  value={form.title}
                  onChange={(e) => updateForm("title", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea
                  className="form-input"
                  placeholder="Write your announcement here..."
                  value={form.body}
                  onChange={(e) => updateForm("body", e.target.value)}
                  style={{ minHeight: 120 }}
                />
              </div>

              <div style={{ fontSize: 13, color: "#888", marginBottom: 8 }}>
                This will be visible to all group members.
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={resetModal}>Cancel</button>
                <button
                  className="btn-submit"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
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