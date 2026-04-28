import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// ── Config ────────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            "AIzaSyBTO3EozvPHWzOYpRP7ESuRI0bVah5S5vc",
  authDomain:        "pamoja-plus-eb0a0.firebaseapp.com",
  projectId:         "pamoja-plus-eb0a0",
  storageBucket:     "pamoja-plus-eb0a0.firebasestorage.app",
  messagingSenderId: "806015011632",
  appId:             "1:806015011632:web:cd1b9ffdf790b95e9fd6f5",
};

// ── Initialize ────────────────────────────────────────────────────────────────

const app      = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// ── Tenant Resolution ─────────────────────────────────────────────────────────

export function resolveTenantId(): string | null {
  // 1. sessionStorage — written after login
  const session = sessionStorage.getItem("pamoja_tenantId");
  if (session) return session;

  // 2. localStorage — persisted from previous session
  const cached = localStorage.getItem("pamoja_tenantId");
  if (cached) {
    sessionStorage.setItem("pamoja_tenantId", cached);
    return cached;
  }

  // 3. URL param — for invite links e.g. /join?tenant=tenant_001
  const param = new URLSearchParams(window.location.search).get("tenant");
  if (param) {
    setTenantId(param);
    return param;
  }

  return null;
}

export function setTenantId(tenantId: string): void {
  sessionStorage.setItem("pamoja_tenantId", tenantId);
  localStorage.setItem("pamoja_tenantId",   tenantId);
}

export function clearTenantId(): void {
  sessionStorage.removeItem("pamoja_tenantId");
  localStorage.removeItem("pamoja_tenantId");
}

// ── Tenant-scoped Firestore helpers ───────────────────────────────────────────

export const tenantRef        = (id: string) => doc(db, "tenants", id);
export const contributionsCol = (id: string) => collection(db, `tenants/${id}/contributions`);
export const pledgesCol       = (id: string) => collection(db, `tenants/${id}/pledges`);
export const meetingsCol      = (id: string) => collection(db, `tenants/${id}/meetings`);
export const announcementsCol = (id: string) => collection(db, `tenants/${id}/announcements`);
export const auditLogsCol     = (id: string) => collection(db, `tenants/${id}/auditLogs`);
export const cyclesCol        = (id: string) => collection(db, `tenants/${id}/cycles`);
export const membersCol       = (id: string) => collection(db, `tenants/${id}/members`);

console.log(`Firebase initialized — tenant: "${resolveTenantId() ?? "unresolved"}"`);

export default app;