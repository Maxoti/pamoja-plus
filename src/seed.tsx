import { useState } from "react";
import { doc, setDoc, Timestamp,  } from "firebase/firestore";
import { db, auth } from "./firebase";

// ── Seed config ───────────────────────────────────────────────────────────────
// Change these before running if needed
const TENANT_NAME = "Kotuoma Welfare Group";
const GROUP_NAME  = "Kotuoma Main Group";

type LogEntry = { msg: string; ok: boolean };

async function runSeed(
  log: (msg: string, ok?: boolean) => void
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not logged in — visit /login first");

  const tenantId = user.uid; // tenant ID = owner's UID (your convention)
  const userId   = user.uid;

  log(`Seeding for UID: ${userId}`);

  // ── 1. Tenant ───────────────────────────────────────────────────────────────
  await setDoc(doc(db, "tenants", tenantId), {
    name:        TENANT_NAME,
    ownerUserId: userId,
    plan:        "free",
    active:      true,
    status:      "active",
    createdAt:   Timestamp.now(),
  });
  log("✅ Tenant created");

  // ── 2. User doc at real UID ─────────────────────────────────────────────────
  await setDoc(doc(db, "users", userId), {
    name:      user.displayName || "Group Owner",
    email:     user.email       || "",
    phone:     "",
    tenantId,
    role:      "owner",
    createdAt: Timestamp.now(),
  });
  log("✅ User doc created at real UID");

  // ── 3. TenantMember ────────────────────────────────────────────────────────
  await setDoc(doc(db, "tenantMembers", `${tenantId}_${userId}`), {
    tenantId,
    userId,
    name:     user.displayName || "Group Owner",
    email:    user.email       || "",
    role:     "owner",
    status:   "active",
    joinedAt: Timestamp.now(),
  });
  log("✅ TenantMember created");

  // ── 4. Group ───────────────────────────────────────────────────────────────
  const groupId = "group_001";
  await setDoc(doc(db, `tenants/${tenantId}/groups`, groupId), {
    name:        GROUP_NAME,
    description: "Primary welfare group",
    location:    "Kisumu-west, Kenya",
    status:      "active",
    createdAt:   Timestamp.now(),
  });
  log("✅ Group created");

  // ── 5. Cycle ───────────────────────────────────────────────────────────────
  const cycleId = "cycle_001";
  await setDoc(doc(db, `tenants/${tenantId}/cycles`, cycleId), {
    groupId,
    title:     "January 2025 Cycle",
    startDate: Timestamp.fromDate(new Date("2025-01-01")),
    endDate:   Timestamp.fromDate(new Date("2025-01-31")),
    status:    "closed",
  });
  log("✅ Cycle created");

  // ── 6. Pledge ──────────────────────────────────────────────────────────────
  await setDoc(doc(db, `tenants/${tenantId}/pledges`, "pledge_001"), {
    groupId,
    userId,
    cycleId,
    amountPlanned: 1000,
    frequency:     "monthly",
    status:        "fulfilled",
    createdAt:     Timestamp.now(),
  });
  log("✅ Pledge created");

  // ── 7. Contribution ────────────────────────────────────────────────────────
  await setDoc(doc(db, `tenants/${tenantId}/contributions`, "contribution_001"), {
    groupId,
    userId,
    pledgeId:           "pledge_001",
    cycleId,
    amount:             1000,
    mpesaRef:           "QHJ7YT123",
    status:             "verified",
    verifiedBy:         userId,
    verifiedAt:         Timestamp.now(),
    verificationMethod: "manual",
    checkoutRequestId:  null,
    createdAt:          Timestamp.now(),
  });
  log("✅ Contribution created");

  // ── 8. Approval ────────────────────────────────────────────────────────────
  await setDoc(doc(db, `tenants/${tenantId}/approvals`, "approval_001"), {
    contributionId: "contribution_001",
    action:         "approved",
    performedBy:    userId,
    reason:         "M-Pesa ref confirmed manually",
    createdAt:      Timestamp.now(),
  });
  log("✅ Approval created");

  // ── 9. Announcement ────────────────────────────────────────────────────────
  await setDoc(doc(db, `tenants/${tenantId}/announcements`, "announcement_001"), {
    groupId,
    title:    "Welcome to Pamoja Plus!",
    body:     "Our welfare group is now digital. Contributions, meetings and pledges all in one place.",
    postedBy: userId,
    createdAt: Timestamp.now(),
  });
  log("✅ Announcement created");

  // ── 10. Meeting ────────────────────────────────────────────────────────────
  await setDoc(doc(db, `tenants/${tenantId}/meetings`, "meeting_001"), {
    groupId,
    title:    "January Monthly Meeting",
    date:     Timestamp.fromDate(new Date("2025-01-15")),
    location: "Kotuoma Community Hall",
    notes:    "Discuss Q1 contributions and payouts",
  });
  log("✅ Meeting created");

  // ── 11. Audit log ──────────────────────────────────────────────────────────
  await setDoc(doc(db, `tenants/${tenantId}/auditLogs`, "log_001"), {
    actorUserId: userId,
    action:      "CONTRIBUTION_VERIFIED",
    entityType:  "contribution",
    entityId:    "contribution_001",
    timestamp:   Timestamp.now(),
  });
  log("✅ Audit log created");

  // ── 12. Write tenantId to localStorage so useTenant resolves ───────────────
  sessionStorage.setItem("pamoja_tenantId", tenantId);
  localStorage.setItem("pamoja_tenantId",   tenantId);
  log(`✅ tenantId cached: ${tenantId}`);

  log(" Database seeded successfully! Redirecting to dashboard...", true);
}

// ── Page component ────────────────────────────────────────────────────────────
export default function Seed() {
  const [logs,    setLogs]    = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [done,    setDone]    = useState(false);

  function addLog(msg: string, ok = false) {
    setLogs(prev => [...prev, { msg, ok }]);
  }

  async function handleSeed() {
    setLogs([]);
    setRunning(true);
    setDone(false);
    try {
      await runSeed(addLog);
      setDone(true);
      setTimeout(() => { window.location.href = "/dashboard"; }, 2000);
    } catch (err: unknown) {
      if (err instanceof Error) {
        addLog(`❌ Error: ${err.message}`, false);
      } else {
        addLog("❌ Error: An unknown error occurred", false);
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8",
      fontFamily: "'IBM Plex Mono', monospace", padding: "48px 32px",
      display: "flex", flexDirection: "column", alignItems: "center"
    }}>
      <div style={{ width: "100%", maxWidth: 600 }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: "#666",
          textTransform: "uppercase", marginBottom: 8 }}>
          Pamoja Plus
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>
          Database Seed
        </h1>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 32 }}>
          Creates all demo data scoped to the currently logged-in user's UID.
          <br/>Must be logged in before running.
        </p>

        <button
          onClick={handleSeed}
          disabled={running || done}
          style={{
            padding: "12px 32px", background: running ? "#222" : "#00c896",
            color: running ? "#666" : "#000", border: "none",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
            fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
            cursor: running || done ? "not-allowed" : "pointer",
            marginBottom: 32, opacity: done ? 0.5 : 1,
          }}>
          {running ? "Seeding..." : done ? "Done ✓" : "▶ Run Seed"}
        </button>

        {/* Log output */}
        {logs.length > 0 && (
          <div style={{
            background: "#111", border: "1px solid #222",
            padding: "20px 24px", fontSize: 12, lineHeight: 2,
          }}>
            {logs.map((l, i) => (
              <div key={i} style={{ color: l.ok ? "#00c896" : "#e8e8e8" }}>
                {l.msg}
              </div>
            ))}
          </div>
        )}

        {/* Warning */}
        <div style={{
          marginTop: 32, padding: "12px 16px",
          border: "1px solid #333", fontSize: 11, color: "#666",
          lineHeight: 1.8
        }}>
          ⚠ Remove the /seed route before going to production.<br/>
          This page is intentionally unprotected for first-time setup.
        </div>
      </div>
    </div>
  );
}