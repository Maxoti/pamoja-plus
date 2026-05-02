import type { User } from "firebase/auth";

/**
 * ─────────────────────────────────────────────────────────────
 * Tenant-level RBAC roles (DO NOT include system roles here)
 * ─────────────────────────────────────────────────────────────
 */
export type Role = "admin" | "treasurer" | "secretary" | "member" | null;

/**
 * ─────────────────────────────────────────────────────────────
 * Auth Context Contract
 * ─────────────────────────────────────────────────────────────
 * Single source of truth for authentication + RBAC state.
 */
export interface AuthContextType {
  // ── Identity ───────────────────────────────────────────────
  currentUser: User | null;

  // ── Tenant scope ───────────────────────────────────────────
  tenantId: string | null;

  // ── State ──────────────────────────────────────────────────
  loading:  boolean;
  role:     Role;

  // ── Authentication methods ─────────────────────────────────
  loginWithEmail:    (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name: string, phone: string) => Promise<void>;
  loginWithGoogle:   () => Promise<void>;
  logout:            () => Promise<void>;

  // ── Post-registration hook ─────────────────────────────────
  // Ensures role + tenant mapping is hydrated immediately after signup
  applyRoleAfterRegistration: (uid: string) => Promise<void>;
}

/**
 * ─────────────────────────────────────────────────────────────
 * Permission model (derived from Role)
 * ─────────────────────────────────────────────────────────────
 * Keep this lightweight — do NOT duplicate business logic here.
 */
export interface Permissions {
  canWrite:    boolean;
  isAdmin:     boolean;
  isTreasurer: boolean;
  isSecretary: boolean;  // ← added
  isMember:    boolean;
  role:        Role;
}