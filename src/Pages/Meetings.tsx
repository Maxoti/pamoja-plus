import { useEffect, useMemo, useState, useCallback } from "react";
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
import { pageStyles } from "../styles/pageStyles";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Meeting {
  id:        string;
  title:     string;
  date:      Timestamp;
  location:  string;
  notes?:    string;
  groupId:   string;
  createdBy?: string;
}

interface MeetingForm {
  title:    string;
  date:     string;
  location: string;
  notes:    string;
  groupId:  string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS: string[] = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

const INITIAL_FORM: MeetingForm = {
  title:    "",
  date:     "",
  location: "",
  notes:    "",
  groupId:  "group_001",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatShortDate = (ts: Timestamp): string =>
  ts.toDate().toLocaleDateString("en-KE", { day: "numeric", month: "short" });

const formatTime = (ts: Timestamp): string =>
  ts.toDate().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });

// ── Sub-component ─────────────────────────────────────────────────────────────

const MeetingCard = ({ m }: { m: Meeting }) => {
  const d          = m.date?.toDate();
  const isUpcoming = d >= new Date();

  return (
    <div className="meeting-card">
      <div className={`date-block ${isUpcoming ? "upcoming" : ""}`}>
        <div className="month">{MONTHS[d?.getMonth()]}</div>
        <div className="day">{d?.getDate()}</div>
      </div>

      <div className="meeting-info">
        <div className="meeting-header">
          <span className="title">{m.title}</span>
          {isUpcoming && (
            <span className="badge badge-active">Upcoming</span>
          )}
        </div>

        <div className="meta">
          <span> {m.location}</span>
          <span> {formatTime(m.date)}</span>
        </div>

        {m.notes && <div className="notes">{m.notes}</div>}
      </div>
    </div>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Meetings() {
  const { currentUser, tenantId } = useAuth();
  const { canWrite }              = usePermissions();

  // ── State ──────────────────────────────────────────────────────────────────
  const [meetings,    setMeetings]   = useState<Meeting[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [fetchError,  setFetchError] = useState<string | null>(null);
  const [showModal,   setShowModal]  = useState(false);
  const [form,        setForm]       = useState<MeetingForm>(INITIAL_FORM);
  const [formError,   setFormError]  = useState("");
  const [submitting,  setSubmitting] = useState(false);

  // ── Firestore realtime listener ────────────────────────────────────────────
  useEffect(() => {
    if (!tenantId) return;

    const q = query(
      collection(db, `tenants/${tenantId}/meetings`),
      orderBy("date", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setMeetings(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Meeting)));
        setLoading(false);
        setFetchError(null);
      },
      (err) => {
        console.error("[Meetings] listener error:", err);
        setFetchError("Could not load meetings. Check your connection.");
        setLoading(false);
      }
    );

    return unsub;
  }, [tenantId]);

  // ── Derived state (memoized) ───────────────────────────────────────────────
  const { upcoming, past, nextMeeting } = useMemo(() => {
    const now      = new Date();
    const upcoming = meetings
      .filter((m) => m.date?.toDate() >= now)
      .sort((a, b) => a.date.seconds - b.date.seconds);
    const past = meetings.filter((m) => m.date?.toDate() < now);

    return { upcoming, past, nextMeeting: upcoming[0] ?? null };
  }, [meetings]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const updateForm = (field: keyof MeetingForm, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const resetModal = useCallback(() => {
    setShowModal(false);
    setForm(INITIAL_FORM);
    setFormError("");
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!tenantId || !currentUser) return;

    if (!form.title.trim())    { setFormError("Title is required");    return; }
    if (!form.date)            { setFormError("Date is required");     return; }
    if (!form.location.trim()) { setFormError("Location is required"); return; }

    setSubmitting(true);
    setFormError("");

    try {
      const ref = await addDoc(
        collection(db, `tenants/${tenantId}/meetings`),
        {
          title:     form.title.trim(),
          date:      Timestamp.fromDate(new Date(form.date)),
          location:  form.location.trim(),
          notes:     form.notes.trim() || null,
          groupId:   form.groupId,
          createdBy: currentUser.uid,
          createdAt: Timestamp.now(),
        }
      );

      // Fire-and-forget audit log — non-critical
      addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
        actorUserId: currentUser.uid,
        action:      "CREATE_MEETING",
        entityType:  "meeting",
        entityId:    ref.id,
        timestamp:   Timestamp.now(),
      }).catch((err) => console.warn("[Meetings] audit log failed:", err));

      resetModal();
    } catch (err) {
      console.error("[Meetings] create error:", err);
      setFormError("Failed to schedule meeting. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [form, tenantId, currentUser, resetModal]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="page">
      <style>{pageStyles}</style>

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Meetings</h1>
          <p className="page-sub">Schedule, track, and record meeting minutes</p>
        </div>

        {/* RBAC: members never see this */}
        {canWrite && (
          <button className="btn-add" onClick={() => setShowModal(true)}>
            + Schedule Meeting
          </button>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="stat-row">
        {[
          { label: "Total Meetings", value: meetings.length,  sub: "all time" },
          { label: "Upcoming",       value: upcoming.length,  sub: "scheduled ahead" },
          { label: "Past Meetings",  value: past.length,      sub: "completed" },
          {
            label: "Next Meeting",
            value: nextMeeting ? formatShortDate(nextMeeting.date) : "—",
            sub:   nextMeeting ? nextMeeting.title.slice(0, 20) : "None scheduled",
            small: true,
          },
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

      {/* ── Body ── */}
      {fetchError ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-title" style={{ color: "#DC2626" }}>{fetchError}</div>
          </div>
        </div>
      ) : loading ? (
        <div className="loading"><div className="spinner" /></div>
      ) : meetings.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon"></div>
            <div className="empty-title">No meetings scheduled</div>
            <div className="empty-sub">
              {canWrite
                ? "Schedule your first meeting to get started."
                : "No meetings have been scheduled yet."}
            </div>
          </div>
        </div>
      ) : (
        <div className="meeting-list">
          {upcoming.length > 0 && (
            <>
              <div className="section-label">Upcoming</div>
              {upcoming.map((m) => <MeetingCard key={m.id} m={m} />)}
            </>
          )}
          {past.length > 0 && (
            <>
              <div className="section-label">Past</div>
              {past.map((m) => <MeetingCard key={m.id} m={m} />)}
            </>
          )}
        </div>
      )}

      {/* ── Modal (canWrite guard — defence in depth) ── */}
      {showModal && canWrite && (
        <div className="modal-overlay" onClick={resetModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Schedule Meeting</h2>
              <button className="modal-close" onClick={resetModal}>✕</button>
            </div>

            <div className="modal-body">
              {formError && <div className="error-box">⚠ {formError}</div>}

              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  className="form-input"
                  placeholder="e.g. January Monthly Meeting"
                  value={form.title}
                  onChange={(e) => updateForm("title", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Date & Time</label>
                <input
                  className="form-input"
                  type="datetime-local"
                  value={form.date}
                  onChange={(e) => updateForm("date", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Location</label>
                <input
                  className="form-input"
                  placeholder="e.g. Kotuoma Community Hall"
                  value={form.location}
                  onChange={(e) => updateForm("location", e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Notes <span style={{ color: "#BBB", fontWeight: 400 }}>(optional)</span>
                </label>
                <textarea
                  className="form-input"
                  placeholder="Agenda or any notes for this meeting..."
                  value={form.notes}
                  onChange={(e) => updateForm("notes", e.target.value)}
                  style={{ minHeight: 100 }}
                />
              </div>

              <div className="modal-actions">
                <button className="btn-cancel" onClick={resetModal}>Cancel</button>
                <button
                  className="btn-submit"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? "Scheduling..." : "Schedule Meeting"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}