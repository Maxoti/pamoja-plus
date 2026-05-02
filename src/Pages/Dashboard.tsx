import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { db } from "../firebase";
import {
  collection, doc, getDoc, getDocs,
  query, orderBy, limit, where, setDoc, Timestamp,
} from "firebase/firestore";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tenant       { name: string; plan: string; status: string; }
interface Contribution { id: string; userId: string; amount: number; mpesaRef: string; status: "verified" | "pending" | "rejected"; createdAt: Timestamp; }
interface Announcement { id: string; title: string; body: string; createdAt: Timestamp; }
interface Meeting      { id: string; title: string; date: Timestamp; location: string; }
interface Pledge       { amountPlanned: number; }
interface MemberRecord { userId: string; name: string; email: string; }

interface DashboardData {
  tenant:               Tenant | null;
  totalContributions:   number;
  verifiedContributions:number;
  pendingContributions: number;
  recentContributions:  Contribution[];
  announcements:        Announcement[];
  upcomingMeetings:     Meeting[];
  totalPledged:         number;
  cycleTitle:           string;
  cycleStatus:          string;
  cycleMeta:            string;
}

type LoadState = "loading" | "error" | "ready";

// ── Constants ─────────────────────────────────────────────────────────────────

const NAV = [
  { icon: "▣", label: "Overview",      path: "/dashboard"     },
  { icon: "◈", label: "Contributions", path: "/contributions" },
  { icon: "◎", label: "Members",       path: "/members"       },
  { icon: "◇", label: "Pledges",       path: "/pledges"       },
  { icon: "◻", label: "Meetings",      path: "/meetings"      },
  { icon: "▲", label: "Announcements", path: "/announcements" },
  { icon: "◑", label: "Audit Log",     path: "/audit-log"     },
];

const EMPTY_DATA: DashboardData = {
  tenant: null, totalContributions: 0, verifiedContributions: 0,
  pendingContributions: 0, recentContributions: [], announcements: [],
  upcomingMeetings: [], totalPledged: 0,
  cycleTitle: "No active cycle", cycleStatus: "none", cycleMeta: "—",
};

const STATUS_PILL: Record<string, { bg: string; fg: string }> = {
  verified:  { bg: "#ECFDF5", fg: "#059669" },
  pending:   { bg: "#FFFBEB", fg: "#D97706" },
  rejected:  { bg: "#FEF2F2", fg: "#DC2626" },
  none:      { bg: "#F3F4F6", fg: "#6B7280" },
};

const AVATAR_COLORS = ["#1A3A2A","#C8891A","#2D6A4F","#7C3AED","#2563EB","#DC2626"];

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt = {
  kes:     (n: number) => "KES " + n.toLocaleString("en-KE", { minimumFractionDigits: 0 }),
  date:    (ts?: Timestamp) => ts?.toDate().toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) ?? "—",
  initial: (s: string) => s.trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?",
};

// ── Sub-components ────────────────────────────────────────────────────────────

const StatusPill = ({ status }: { status: string }) => {
  const p = STATUS_PILL[status] ?? STATUS_PILL.none;
  return (
    <span style={{
      background: p.bg, color: p.fg, padding: "3px 12px",
      borderRadius: 100, fontSize: 11, fontWeight: 700,
      textTransform: "capitalize", letterSpacing: "0.3px",
    }}>
      {status}
    </span>
  );
};

const Empty = ({ icon, text }: { icon: string; text: string }) => (
  <div className="empty-state">
    <div className="empty-icon">{icon}</div>
    <div>{text}</div>
  </div>
);

const Sidebar = ({
  currentPath, displayName, memberRole, open, onClose, onNavigate, onLogout,
}: {
  currentPath: string; displayName: string; memberRole: string;
  open: boolean; onClose: () => void;
  onNavigate: (p: string) => void; onLogout: () => void;
}) => (
  <>
    {open && (
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        zIndex: 99, backdropFilter: "blur(2px)",
      }} />
    )}
    <nav className={`sidebar ${open ? "open" : ""}`}>
      <div className="sidebar-logo">Pamoja<span>Plus</span></div>
      <p className="nav-section-label">Main Menu</p>
      {NAV.map((item) => (
        <button
          key={item.path}
          className={`nav-item ${currentPath === item.path ? "active" : ""}`}
          onClick={() => { onNavigate(item.path); onClose(); }}
        >
          <span className="nav-icon">{item.icon}</span>
          {item.label}
        </button>
      ))}
      <div className="sidebar-bottom">
        <div className="user-card">
          <div className="user-avatar">{fmt.initial(displayName)}</div>
          <div>
            <div className="user-name">{displayName || "Admin"}</div>
            <div className="user-role">{memberRole}</div>
          </div>
        </div>
        <button className="btn-logout" onClick={onLogout}>Sign out</button>
      </div>
    </nav>
  </>
);

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { currentUser, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [loadState,   setLoadState]   = useState<LoadState>("loading");
  const [data,        setData]        = useState<DashboardData>(EMPTY_DATA);
  const [memberRole,  setMemberRole]  = useState("member");
  const [membersMap,  setMembersMap]  = useState<Record<string, MemberRecord>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  const fetchDashboard = useCallback(async (uid: string) => {

    // ── 1. Resolve tenantId ────────────────────────────────────────────────
    const userSnap = await getDoc(doc(db, "users", uid));
    const userData = userSnap.exists() ? userSnap.data() : {};
    let tid: string = userData.tenantId ?? "";

    // ── 2. Fallback — query tenantMembers by userId ────────────────────────
    if (!tid) {
      const byUser = await getDocs(
        query(collection(db, "tenantMembers"), where("userId", "==", uid), limit(1))
      );
      if (!byUser.empty) {
        const m = byUser.docs[0].data();
        tid = m.tenantId as string;
        setMemberRole(m.role ?? "member");
        await setDoc(doc(db, "users", uid), { tenantId: tid }, { merge: true });
      }
    }

    // ── 3. Last resort — auto-link to first tenant ─────────────────────────
    if (!tid) {
      const tenants = await getDocs(query(collection(db, "tenants"), limit(1)));
      if (tenants.empty) throw new Error("No tenants found");
      tid = tenants.docs[0].id;
      await setDoc(doc(db, "tenantMembers", `${tid}_${uid}`), {
        tenantId: tid, userId: uid,
        name:     userData.name  ?? "Admin",
        email:    userData.email ?? "",
        role:     "admin", status: "active",
        joinedAt: Timestamp.now(),
      });
      await setDoc(doc(db, "users", uid), { tenantId: tid }, { merge: true });
      setMemberRole("admin");
    } else {
      const mSnap = await getDoc(doc(db, "tenantMembers", `${tid}_${uid}`));
      if (mSnap.exists()) setMemberRole(mSnap.data().role ?? "member");
    }

    // ── 4. Parallel fetch all dashboard data ───────────────────────────────
    const [
      tenantSnap, contribSnap, annSnap,
      meetSnap, pledgeSnap, cycleSnap, membersSnap,
    ] = await Promise.all([
      getDoc(doc(db, "tenants", tid)),
      getDocs(query(collection(db, `tenants/${tid}/contributions`), orderBy("createdAt", "desc"), limit(10))),
      getDocs(query(collection(db, `tenants/${tid}/announcements`), orderBy("createdAt", "desc"), limit(5))),
      getDocs(query(collection(db, `tenants/${tid}/meetings`), limit(5))),
      getDocs(collection(db, `tenants/${tid}/pledges`)),
      getDocs(query(collection(db, `tenants/${tid}/cycles`), orderBy("startDate", "desc"), limit(1))),
      getDocs(query(collection(db, "tenantMembers"), where("tenantId", "==", tid))),
    ]);

    // ── 5. Build members lookup map ────────────────────────────────────────
    const map: Record<string, MemberRecord> = {};
    membersSnap.forEach((d) => {
      const m = d.data();
      map[m.userId] = { userId: m.userId, name: m.name ?? "Unknown", email: m.email ?? "" };
    });
    setMembersMap(map);

    // ── 6. Shape dashboard data ────────────────────────────────────────────
    const contributions = contribSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Contribution));
    const pledges       = pledgeSnap.docs.map((d) => d.data() as Pledge);
    const cycle         = cycleSnap.docs[0]?.data();

    setData({
      tenant:               tenantSnap.exists() ? tenantSnap.data() as Tenant : null,
      totalContributions:   contributions.reduce((s, c) => s + c.amount, 0),
      verifiedContributions:contributions.filter((c) => c.status === "verified").reduce((s, c) => s + c.amount, 0),
      pendingContributions: contributions.filter((c) => c.status === "pending").length,
      recentContributions:  contributions,
      announcements:        annSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement)),
      upcomingMeetings:     meetSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Meeting)),
      totalPledged:         pledges.reduce((s, p) => s + p.amountPlanned, 0),
      cycleTitle:           cycle?.title  ?? "No active cycle",
      cycleStatus:          cycle?.status ?? "none",
      cycleMeta:            cycle
        ? `${fmt.date(cycle.startDate)} — ${fmt.date(cycle.endDate)}`
        : "—",
    });
  }, []);

  useEffect(() => {
    if (!currentUser) { navigate("/login"); return; }
    (async () => {
      try {
        await fetchDashboard(currentUser.uid);
        setLoadState("ready");
      } catch (err) {
        console.error("[Dashboard] load error:", err);
        setLoadState("error");
      }
    })();
  }, [currentUser, fetchDashboard, navigate]);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate("/login");
  }, [logout, navigate]);

  const displayName = useMemo(
    () => membersMap[currentUser?.uid ?? ""]?.name || currentUser?.displayName || "Admin",
    [membersMap, currentUser]
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loadState === "loading") return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100vh", background: "#F5F4EF",
      gap: 16, fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 900, color: "#1A3A2A" }}>
        Pamoja<span style={{ color: "#C8891A" }}>Plus</span>
      </div>
      <div style={{ width: 30, height: 30, border: "3px solid #E8E8E0", borderTopColor: "#1A3A2A", borderRadius: "50%", animation: "spin 0.75s linear infinite" }} />
      <div style={{ fontSize: 13, color: "#AAA" }}>Loading your dashboard…</div>
    </div>
  );

  // ── Error ──────────────────────────────────────────────────────────────────
  if (loadState === "error") return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100vh", background: "#F5F4EF",
      gap: 12, fontFamily: "'DM Sans', sans-serif", padding: 24, textAlign: "center",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;600&display=swap');`}</style>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, fontWeight: 700, color: "#1A1A1A" }}>
        Could not load dashboard
      </div>
      <div style={{ fontSize: 14, color: "#888", maxWidth: 300 }}>
        Your account may not be linked to a welfare group, or there was a network issue.
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 8, padding: "10px 28px", background: "#1A3A2A",
          color: "white", border: "none", borderRadius: 100,
          fontSize: 14, fontWeight: 700, cursor: "pointer",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Retry
      </button>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", background: "#F5F4EF", display: "flex" }}>
      <style>{DASHBOARD_CSS}</style>

      <Sidebar
        currentPath={location.pathname}
        displayName={displayName}
        memberRole={memberRole}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigate={navigate}
        onLogout={handleLogout}
      />

      <div className="main-content">

        {/* ── Mobile topbar ── */}
        <div className="mobile-bar">
          <div className="mobile-logo">Pamoja<span>Plus</span></div>
          <button className="hamburger" onClick={() => setSidebarOpen(true)}>☰</button>
        </div>

        {/* ── Desktop topbar ── */}
        <header className="topbar">
          <div className="topbar-title">{data.tenant?.name ?? "Dashboard"}</div>
          <div className="topbar-right">
            <span className="topbar-date">
              {new Date().toLocaleDateString("en-KE", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              })}
            </span>
            <span className="plan-badge">{data.tenant?.plan ?? "free"} plan</span>
          </div>
        </header>

        <main className="page-body">

          {/* ── Cycle banner ── */}
          <div className="cycle-banner">
            <div>
              <div className="cycle-label">Current Cycle</div>
              <div className="cycle-name">{data.cycleTitle}</div>
              <div className="cycle-meta">{data.cycleMeta}</div>
            </div>
            <div className="cycle-badge">{data.cycleStatus}</div>
          </div>

          {/* ── Stats ── */}
          <div className="stats-grid">
            {[
              { label: "Total Collected",  value: fmt.kes(data.totalContributions),    sub: "across all contributions", cls: ""     },
              { label: "Verified Funds",   value: fmt.kes(data.verifiedContributions), sub: "confirmed via M-Pesa",     cls: "gold" },
              { label: "Total Pledged",    value: fmt.kes(data.totalPledged),          sub: "member commitments",       cls: "blue" },
              { label: "Pending Review",   value: String(data.pendingContributions),   sub: "awaiting verification",    cls: "red"  },
            ].map((s) => (
              <div key={s.label} className={`stat-card ${s.cls}`}>
                <div className="stat-eyebrow">{s.label}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-sub">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* ── Content grid ── */}
          <div className="content-grid">

            {/* Recent contributions */}
            <div className="panel">
              <div className="panel-header">
                <div className="panel-title">Recent Contributions</div>
                <button className="panel-action" onClick={() => navigate("/contributions")}>View all →</button>
              </div>

              {data.recentContributions.length === 0 ? (
                <Empty icon="◈" text="No contributions recorded yet" />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="contrib-table">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Amount</th>
                        <th>M-Pesa Ref</th>
                        <th>Date</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recentContributions.map((c, i) => {
                        const member = membersMap[c.userId];
                        const name   = member?.name ?? "Unknown";
                        const initials = fmt.initial(name);
                        return (
                          <tr key={c.id}>
                            {/* ✅ Shows real name, not UID */}
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{
                                  width: 32, height: 32, borderRadius: "50%",
                                  background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                                  display: "flex", alignItems: "center",
                                  justifyContent: "center", fontSize: 12,
                                  fontWeight: 700, color: "white", flexShrink: 0,
                                }}>
                                  {initials}
                                </div>
                                <div>
                                  <span className="member-name">{name}</span>
                                  <span className="member-id">{member?.email ?? ""}</span>
                                </div>
                              </div>
                            </td>
                            <td style={{ fontWeight: 700, color: "#1A3A2A" }}>{fmt.kes(c.amount)}</td>
                            <td><span className="mpesa-ref">{c.mpesaRef}</span></td>
                            <td style={{ color: "#AAA", fontSize: 12.5 }}>{fmt.date(c.createdAt)}</td>
                            <td><StatusPill status={c.status} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Announcements */}
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">Announcements</div>
                  <button className="panel-action" onClick={() => navigate("/announcements")}>New +</button>
                </div>
                {data.announcements.length === 0
                  ? <Empty icon="◻" text="No announcements yet" />
                  : data.announcements.map((a) => (
                    <div className="ann-item" key={a.id}>
                      <div className="ann-title">{a.title}</div>
                      <div className="ann-body">{a.body}</div>
                      <div className="ann-date">{fmt.date(a.createdAt)}</div>
                    </div>
                  ))
                }
              </div>

              {/* Meetings */}
              <div className="panel">
                <div className="panel-header">
                  <div className="panel-title">Meetings</div>
                  <button className="panel-action" onClick={() => navigate("/meetings")}>View all →</button>
                </div>
                {data.upcomingMeetings.length === 0
                  ? <Empty icon="◎" text="No meetings scheduled" />
                  : data.upcomingMeetings.map((m) => {
                    const d = m.date?.toDate();
                    return (
                      <div className="meeting-item" key={m.id}>
                        <div className="meeting-date-box">
                          <div className="meeting-month">{d?.toLocaleString("en-KE", { month: "short" })}</div>
                          <div className="meeting-day">{d?.getDate()}</div>
                        </div>
                        <div>
                          <div className="meeting-title">{m.title}</div>
                          <div className="meeting-loc">📍 {m.location}</div>
                        </div>
                      </div>
                    );
                  })
                }
              </div>

            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const DASHBOARD_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .sidebar { width: 240px; min-height: 100vh; background: #1A3A2A; display: flex; flex-direction: column; position: fixed; top: 0; left: 0; z-index: 100; transition: transform 0.28s cubic-bezier(0.4,0,0.2,1); }
  .sidebar-logo { padding: 26px 24px 18px; font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 900; color: white; border-bottom: 1px solid rgba(255,255,255,0.07); margin-bottom: 8px; letter-spacing: -0.5px; }
  .sidebar-logo span { color: #C8891A; }
  .nav-section-label { padding: 14px 24px 6px; font-size: 9px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: rgba(255,255,255,0.22); }
  .nav-item { display: flex; align-items: center; gap: 11px; padding: 10px 20px; margin: 1px 8px; border-radius: 9px; cursor: pointer; font-size: 13.5px; font-weight: 500; color: rgba(255,255,255,0.5); border: none; background: none; width: calc(100% - 16px); text-align: left; font-family: 'DM Sans', sans-serif; transition: background 0.15s, color 0.15s; }
  .nav-item:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.88); }
  .nav-item.active { background: rgba(200,137,26,0.2); color: #E8A832; font-weight: 600; }
  .nav-icon { font-size: 15px; width: 18px; text-align: center; }
  .sidebar-bottom { margin-top: auto; padding: 14px 8px; border-top: 1px solid rgba(255,255,255,0.07); }
  .user-card { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.05); margin-bottom: 8px; }
  .user-avatar { width: 34px; height: 34px; border-radius: 50%; background: #C8891A; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: white; flex-shrink: 0; }
  .user-name { font-size: 12.5px; font-weight: 600; color: white; }
  .user-role { font-size: 11px; color: rgba(255,255,255,0.38); text-transform: capitalize; margin-top: 1px; }
  .btn-logout { width: 100%; padding: 9px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 9px; color: rgba(255,255,255,0.38); font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; }
  .btn-logout:hover { background: rgba(220,38,38,0.14); color: #FC8181; border-color: rgba(220,38,38,0.28); }

  .main-content { margin-left: 240px; flex: 1; min-height: 100vh; display: flex; flex-direction: column; }
  .topbar { background: white; border-bottom: 1px solid #ECEAE3; padding: 0 32px; height: 62px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }
  .topbar-title { font-family: 'Playfair Display', serif; font-size: 19px; font-weight: 700; color: #1A1A1A; }
  .topbar-right { display: flex; align-items: center; gap: 12px; }
  .plan-badge { background: #FDF8F0; border: 1px solid #E8C87A; color: #C8891A; font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; padding: 4px 12px; border-radius: 100px; }
  .topbar-date { font-size: 12.5px; color: #AAA; }
  .page-body { padding: 28px 32px; flex: 1; }

  .cycle-banner { background: linear-gradient(135deg, #1A3A2A 0%, #122B1E 100%); border-radius: 14px; padding: 22px 28px; margin-bottom: 24px; display: flex; align-items: center; justify-content: space-between; position: relative; overflow: hidden; }
  .cycle-banner::after { content: ''; position: absolute; right: -40px; top: -40px; width: 180px; height: 180px; background: rgba(200,137,26,0.07); border-radius: 50%; }
  .cycle-label { font-size: 10px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: rgba(255,255,255,0.4); margin-bottom: 6px; }
  .cycle-name { font-family: 'Playfair Display', serif; font-size: 21px; font-weight: 700; color: white; margin-bottom: 3px; }
  .cycle-meta { font-size: 12.5px; color: rgba(255,255,255,0.42); }
  .cycle-badge { background: rgba(200,137,26,0.18); border: 1px solid rgba(200,137,26,0.38); color: #E8A832; font-size: 11px; font-weight: 700; padding: 6px 16px; border-radius: 100px; text-transform: capitalize; position: relative; z-index: 1; }

  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
  .stat-card { background: white; border-radius: 14px; padding: 22px 20px; border: 1px solid #ECEAE3; position: relative; overflow: hidden; }
  .stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; background: #1A3A2A; }
  .stat-card.gold::before { background: linear-gradient(90deg, #C8891A, #E8A832); }
  .stat-card.blue::before { background: #3B82F6; }
  .stat-card.red::before  { background: #EF4444; }
  .stat-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #BBB; margin-bottom: 10px; }
  .stat-value { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 700; color: #1A1A1A; line-height: 1; margin-bottom: 5px; }
  .stat-sub { font-size: 11.5px; color: #BBB; }

  .content-grid { display: grid; grid-template-columns: 3fr 2fr; gap: 18px; }
  .panel { background: white; border-radius: 14px; border: 1px solid #ECEAE3; overflow: hidden; }
  .panel-header { padding: 18px 22px; border-bottom: 1px solid #F0EDE6; display: flex; align-items: center; justify-content: space-between; }
  .panel-title { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 700; color: #1A1A1A; }
  .panel-action { font-size: 12px; font-weight: 600; color: #C8891A; cursor: pointer; background: none; border: none; font-family: 'DM Sans', sans-serif; padding: 0; transition: opacity 0.15s; }
  .panel-action:hover { opacity: 0.7; }

  .contrib-table { width: 100%; border-collapse: collapse; min-width: 520px; }
  .contrib-table th { padding: 9px 16px; text-align: left; font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #C0BAB0; background: #FAFAF7; border-bottom: 1px solid #F0EDE6; }
  .contrib-table td { padding: 13px 16px; font-size: 13.5px; color: #333; border-bottom: 1px solid #F7F5F0; vertical-align: middle; }
  .contrib-table tr:last-child td { border-bottom: none; }
  .contrib-table tbody tr:hover td { background: #FAFAF7; }
  .mpesa-ref { font-family: 'Courier New', monospace; font-size: 11.5px; color: #1A3A2A; background: #F0F7F3; padding: 3px 8px; border-radius: 5px; font-weight: 600; letter-spacing: 1px; }
  .member-name { font-weight: 600; font-size: 13px; color: #1A1A1A; display: block; }
  .member-id { font-size: 11px; color: #BBB; display: block; margin-top: 1px; }

  .ann-item { padding: 15px 22px; border-bottom: 1px solid #F0EDE6; cursor: default; transition: background 0.12s; }
  .ann-item:last-child { border-bottom: none; }
  .ann-item:hover { background: #FAFAF7; }
  .ann-title { font-size: 13.5px; font-weight: 600; color: #1A1A1A; margin-bottom: 3px; }
  .ann-body { font-size: 12.5px; color: #888; line-height: 1.55; margin-bottom: 5px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .ann-date { font-size: 10.5px; color: #C0BAB0; }

  .meeting-item { display: flex; gap: 14px; padding: 14px 22px; border-bottom: 1px solid #F0EDE6; align-items: flex-start; transition: background 0.12s; }
  .meeting-item:last-child { border-bottom: none; }
  .meeting-item:hover { background: #FAFAF7; }
  .meeting-date-box { width: 42px; flex-shrink: 0; background: #F0F7F3; border: 1px solid #C8DFD2; border-radius: 9px; text-align: center; padding: 5px 4px; }
  .meeting-month { font-size: 9px; font-weight: 700; color: #1A3A2A; text-transform: uppercase; letter-spacing: 1px; }
  .meeting-day { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 700; color: #1A3A2A; line-height: 1; }
  .meeting-title { font-size: 13px; font-weight: 600; color: #1A1A1A; margin-bottom: 3px; }
  .meeting-loc { font-size: 12px; color: #AAA; }

  .empty-state { padding: 36px 24px; text-align: center; color: #C0BAB0; font-size: 13px; }
  .empty-icon { font-size: 24px; margin-bottom: 8px; opacity: 0.5; }

  .mobile-bar { display: none; background: #1A3A2A; padding: 14px 20px; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 200; }
  .mobile-logo { font-family: 'Playfair Display', serif; font-size: 18px; font-weight: 900; color: white; }
  .mobile-logo span { color: #C8891A; }
  .hamburger { background: none; border: none; color: rgba(255,255,255,0.7); font-size: 20px; cursor: pointer; }

  @keyframes spin { to { transform: rotate(360deg); } }

  @media (max-width: 1024px) {
    .stats-grid { grid-template-columns: 1fr 1fr; }
    .content-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 768px) {
    .sidebar { transform: translateX(-100%); }
    .sidebar.open { transform: translateX(0); }
    .main-content { margin-left: 0; }
    .mobile-bar { display: flex; }
    .topbar { display: none; }
    .page-body { padding: 16px; }
    .stats-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
    .stat-value { font-size: 20px; }
    .cycle-banner { flex-direction: column; gap: 14px; align-items: flex-start; }
    .stat-eyebrow { font-size: 9px; }
  }
  @media (max-width: 480px) {
    .stats-grid { grid-template-columns: 1fr 1fr; }
  }
`;