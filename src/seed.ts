import { db } from "./firebase";
import { doc, setDoc, Timestamp } from "firebase/firestore";

const seedDatabase = async () => {

  // 1. Create a demo tenant (welfare group)
  const tenantId = "tenant_001";
  await setDoc(doc(db, "tenants", tenantId), {
    name: "Kotuoma Welfare Group",
    ownerUserId: "user_001",
    plan: "free",
    status: "active",
    createdAt: Timestamp.now()
  });
  console.log("✅ Tenant created");

  // 2. Create a demo user
  const userId = "user_001";
  await setDoc(doc(db, "users", userId), {
    name: "Nyikwa Charles",
    email: "nyikwa@example.com",
    phone: "0713927537",
    tenantId: tenantId,
    createdAt: Timestamp.now()
  });
  console.log("✅ User created");

  // 3. Create tenant membership — now includes name + email for display
  await setDoc(doc(db, "tenantMembers", "membership_001"), {
    tenantId: tenantId,
    userId: userId,
    name: "Nyikwa Charles",        // ← for Members table display
    email: "nyikwa@example.com",   // ← for Members table display
    role: "owner",
    status: "active",
    joinedAt: Timestamp.now()
  });
  console.log("✅ Tenant membership created");

  // 4. Create a group inside tenant
  const groupId = "group_001";
  await setDoc(doc(db, `tenants/${tenantId}/groups`, groupId), {
    name: "Kotuoma Main Group",
    description: "Primary welfare group",
    location: "Kisumu-west, Kenya",
    status: "active",
    createdAt: Timestamp.now()
  });
  console.log("✅ Group created");

  // 5. Create a cycle
  const cycleId = "cycle_001";
  await setDoc(doc(db, `tenants/${tenantId}/cycles`, cycleId), {
    groupId: groupId,
    title: "January 2025 Cycle",
    startDate: Timestamp.fromDate(new Date("2025-01-01")),
    endDate: Timestamp.fromDate(new Date("2025-01-31")),
    status: "closed"
  });
  console.log("✅ Cycle created");

  // 6. Create a pledge
  await setDoc(doc(db, `tenants/${tenantId}/pledges`, "pledge_001"), {
    groupId: groupId,
    userId: userId,
    cycleId: cycleId,
    amountPlanned: 1000,
    frequency: "monthly",
    status: "fulfilled",
    createdAt: Timestamp.now()
  });
  console.log("✅ Pledge created");

  // 7. Create a contribution
  await setDoc(doc(db, `tenants/${tenantId}/contributions`, "contribution_001"), {
    groupId: groupId,
    userId: userId,
    pledgeId: "pledge_001",
    cycleId: cycleId,
    amount: 1000,
    mpesaRef: "QHJ7YT123",
    status: "verified",
    verifiedBy: userId,
    verifiedAt: Timestamp.now(),
    verificationMethod: "manual",
    checkoutRequestId: null,
    createdAt: Timestamp.now()
  });
  console.log("✅ Contribution created");

  // Approval record
  await setDoc(doc(db, `tenants/${tenantId}/approvals`, "approval_001"), {
    contributionId: "contribution_001",
    action: "approved",
    performedBy: userId,
    reason: "M-Pesa ref confirmed manually",
    createdAt: Timestamp.now()
  });
  console.log("✅ Approval created");

  // 8. Create an announcement
  await setDoc(doc(db, `tenants/${tenantId}/announcements`, "announcement_001"), {
    groupId: groupId,
    title: "Welcome to Pamoja Plus!",
    body: "Our welfare group is now digital. Contributions, meetings and pledges all in one place.",
    postedBy: userId,
    createdAt: Timestamp.now()
  });
  console.log("✅ Announcement created");

  // 9. Create a meeting
  await setDoc(doc(db, `tenants/${tenantId}/meetings`, "meeting_001"), {
    groupId: groupId,
    title: "January Monthly Meeting",
    date: Timestamp.fromDate(new Date("2025-01-15")),
    location: "Kotuoma Community Hall",
    notes: "Discuss Q1 contributions and payouts",
  });
  console.log("✅ Meeting created");

  // 10. Create audit log
  await setDoc(doc(db, `tenants/${tenantId}/auditLogs`, "log_001"), {
    actorUserId: userId,
    action: "CONTRIBUTION_VERIFIED",
    entityType: "contribution",
    entityId: "contribution_001",
    timestamp: Timestamp.now()
  });
  console.log("✅ Audit log created");

  console.log("✅ Database seeded successfully!");
};

export { seedDatabase };