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
import { pageStyles } from "../styles/pageStyles";

interface Meeting {
  id: string;
  title: string;
  date: Timestamp;
  location: string;
  notes?: string;
  groupId: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function Meetings() {
  const { currentUser, tenantId } = useAuth();
  const { canWrite } = usePermissions();

  const [data, setData] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    title: "",
    date: "",
    location: "",
    notes: "",
    groupId: "group_001",
  });

  /**
   * Tenant-scoped real-time subscription
   */
  useEffect(() => {
    if (!tenantId) return;

    const q = query(
      collection(db, `tenants/${tenantId}/meetings`),
      orderBy("date", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as Meeting)
      );
      setData(rows);
      setLoading(false);
    });

    return unsub;
  }, [tenantId]);

  /**
   * Derived state
   */
  const { upcoming, past, nextMeeting } = useMemo(() => {
    const now = new Date();

    const upcoming = data
      .filter((m) => m.date?.toDate() >= now)
      .sort((a, b) => a.date.seconds - b.date.seconds);

    const past = data.filter((m) => m.date?.toDate() < now);

    return {
      upcoming,
      past,
      nextMeeting: upcoming[0] || null,
    };
  }, [data]);

  /**
   * Create meeting (RBAC enforced)
   */
  const handleSubmit = async () => {
    if (!canWrite) {
      setError("You do not have permission to schedule meetings.");
      return;
    }

    if (!tenantId || !currentUser) return;

    if (!form.title || !form.date || !form.location) {
      setError("Title, date, and location are required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        title: form.title.trim(),
        date: Timestamp.fromDate(new Date(form.date)),
        location: form.location.trim(),
        notes: form.notes.trim() || null,
        groupId: form.groupId,
        createdBy: currentUser.uid,
        createdAt: Timestamp.now(),
      };

      await addDoc(
        collection(db, `tenants/${tenantId}/meetings`),
        payload
      );

      await addDoc(
        collection(db, `tenants/${tenantId}/auditLogs`),
        {
          actorUserId: currentUser.uid,
          action: "CREATE_MEETING",
          entityType: "meeting",
          entityId: payload.title,
          timestamp: Timestamp.now(),
        }
      );

      setForm({
        title: "",
        date: "",
        location: "",
        notes: "",
        groupId: "group_001",
      });

      setShowModal(false);
    } catch (err) {
      console.error(err);
      setError("Failed to schedule meeting");
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Presentation component
   */
  const MeetingCard = ({ m }: { m: Meeting }) => {
    const d = m.date?.toDate();
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
            <span>{m.location}</span>
            <span>
              {d?.toLocaleTimeString("en-KE", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {m.notes && (
            <div className="notes">{m.notes}</div>
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
          <p className="page-sub">
            Schedule and manage group meetings
          </p>
        </div>

        {canWrite && (
          <button
            className="btn-add"
            onClick={() => setShowModal(true)}
          >
            + Schedule Meeting
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-label">Total</div>
          <div className="stat-value">{data.length}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Upcoming</div>
          <div className="stat-value">{upcoming.length}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Past</div>
          <div className="stat-value">{past.length}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Next</div>
          <div className="stat-value">
            {nextMeeting
              ? nextMeeting.date
                  .toDate()
                  .toLocaleDateString("en-KE", {
                    day: "numeric",
                    month: "short",
                  })
              : "—"}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="loading">Loading...</div>
      ) : data.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            No meetings scheduled
          </div>
        </div>
      ) : (
        <div className="meeting-list">
          {upcoming.length > 0 && (
            <>
              <div className="section-label">Upcoming</div>
              {upcoming.map((m) => (
                <MeetingCard key={m.id} m={m} />
              ))}
            </>
          )}

          {past.length > 0 && (
            <>
              <div className="section-label">Past</div>
              {past.map((m) => (
                <MeetingCard key={m.id} m={m} />
              ))}
            </>
          )}
        </div>
      )}

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
            {error && <div className="error-box">{error}</div>}

            <input
              placeholder="Title"
              value={form.title}
              onChange={(e) =>
                setForm({ ...form, title: e.target.value })
              }
            />

            <input
              type="datetime-local"
              value={form.date}
              onChange={(e) =>
                setForm({ ...form, date: e.target.value })
              }
            />

            <input
              placeholder="Location"
              value={form.location}
              onChange={(e) =>
                setForm({
                  ...form,
                  location: e.target.value,
                })
              }
            />

            <textarea
              placeholder="Notes"
              value={form.notes}
              onChange={(e) =>
                setForm({ ...form, notes: e.target.value })
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