import { useEffect, useState } from "react";
import { collection, query, onSnapshot, addDoc, Timestamp, orderBy } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import { pageStyles } from "../styles/pageStyles";
const TENANT_ID = "tenant_001";

interface Meeting {
  id: string;
  title: string;
  date: Timestamp;
  location: string;
  notes: string;
  groupId: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function Meetings() {
  const { currentUser } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: "",
    date: "",
    location: "",
    notes: "",
    groupId: "group_001",
  });

  useEffect(() => {
    const q = query(
      collection(db, `tenants/${TENANT_ID}/meetings`),
      orderBy("date", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setMeetings(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Meeting)));
      setLoading(false);
    });
    return unsub;
  }, []);

  const now = new Date();
  const upcoming = meetings.filter((m) => m.date?.toDate() >= now);
  const past = meetings.filter((m) => m.date?.toDate() < now);

  const handleSubmit = async () => {
    if (!form.title || !form.date || !form.location) {
      setError("Title, date and location are required");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await addDoc(collection(db, `tenants/${TENANT_ID}/meetings`), {
        title: form.title.trim(),
        date: Timestamp.fromDate(new Date(form.date)),
        location: form.location.trim(),
        notes: form.notes.trim(),
        groupId: form.groupId,
        createdBy: currentUser?.uid || "unknown",
        createdAt: Timestamp.now(),
      });

      await addDoc(collection(db, `tenants/${TENANT_ID}/auditLogs`), {
        actorUserId: currentUser?.uid || "unknown",
        action: "CREATE_MEETING",
        entityType: "meeting",
        entityId: form.title.trim(),
        timestamp: Timestamp.now(),
      });

      setForm({ title: "", date: "", location: "", notes: "", groupId: "group_001" });
      setShowModal(false);
    } catch {
      setError("Failed to save meeting.");
    } finally {
      setSubmitting(false);
    }
  };

  const MeetingCard = ({ m }: { m: Meeting }) => {
    const d = m.date?.toDate();
    const isUpcoming = d >= now;
    return (
      <div style={{
        background: "white", border: `1px solid ${isUpcoming ? "#BBDDC9" : "#E8E8E0"}`,
        borderRadius: 16, padding: "20px 24px", display: "flex", gap: 20, alignItems: "flex-start",
        transition: "box-shadow 0.2s", cursor: "default",
      }}>
        {/* Date block */}
        <div style={{
          width: 56, flexShrink: 0, background: isUpcoming ? "#1A3A2A" : "#F5F5F0",
          borderRadius: 12, padding: "8px 0", textAlign: "center",
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: isUpcoming ? "#C8891A" : "#888", textTransform: "uppercase", letterSpacing: 1 }}>
            {MONTHS[d?.getMonth()]}
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: isUpcoming ? "white" : "#1A1A1A", fontFamily: "'Playfair Display', serif", lineHeight: 1.1 }}>
            {d?.getDate()}
          </div>
        </div>

        {/* Info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 16, color: "#1A1A1A" }}>{m.title}</span>
            {isUpcoming && <span className="badge badge-active">Upcoming</span>}
          </div>
          <div style={{ fontSize: 13, color: "#888", display: "flex", gap: 16, marginBottom: m.notes ? 10 : 0 }}>
            <span> {m.location}</span>
            <span> {d?.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {m.notes && (
            <div style={{ fontSize: 13, color: "#555", background: "#F5F5F0", borderRadius: 8, padding: "8px 12px", marginTop: 8, lineHeight: 1.5 }}>
              {m.notes}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <style>{pageStyles}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Meetings</h1>
          <p className="page-sub">Schedule, track, and record meeting minutes</p>
        </div>
        <button className="btn-add" onClick={() => setShowModal(true)}>
          + Schedule Meeting
        </button>
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total Meetings</div>
          <div className="stat-value">{meetings.length}</div>
          <div className="stat-sub">all time</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Upcoming</div>
          <div className="stat-value" style={{ color: "#2563EB" }}>{upcoming.length}</div>
          <div className="stat-sub">scheduled ahead</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Past Meetings</div>
          <div className="stat-value">{past.length}</div>
          <div className="stat-sub">completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Next Meeting</div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            {upcoming.length > 0
              ? upcoming[0].date?.toDate().toLocaleDateString("en-KE", { day: "numeric", month: "short" })
              : "—"}
          </div>
          <div className="stat-sub">{upcoming.length > 0 ? upcoming[0].title : "None scheduled"}</div>
        </div>
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : meetings.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"></div>
            <div className="empty-title">No meetings scheduled</div>
            <div className="empty-sub">Schedule your first group meeting to keep everyone aligned.</div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {upcoming.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#AAA", marginBottom: 4 }}>
                Upcoming
              </div>
              {upcoming.map((m) => <MeetingCard key={m.id} m={m} />)}
            </>
          )}
          {past.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", color: "#AAA", margin: "16px 0 4px" }}>
                Past
              </div>
              {past.map((m) => <MeetingCard key={m.id} m={m} />)}
            </>
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Schedule Meeting</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-box">⚠ {error}</div>}

              <div className="form-group">
                <label className="form-label">Meeting Title</label>
                <input className="form-input" placeholder="e.g. January Monthly Meeting" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date & Time</label>
                  <input className="form-input" type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input className="form-input" placeholder="e.g. Kotuoma Hall" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Agenda / Notes <span style={{ color: "#BBB", fontWeight: 400 }}>(optional)</span></label>
                <textarea className="form-input" placeholder="What will be discussed?" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Saving..." : "Schedule Meeting"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}