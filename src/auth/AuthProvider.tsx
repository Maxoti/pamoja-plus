import { useEffect, useState, useCallback } from "react";
import type { User } from "firebase/auth";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  limit,
  Timestamp,
} from "firebase/firestore";

import { auth, db, setTenantId, clearTenantId } from "../firebase";
import { AuthContext } from "./AuthContext";
import type { Role, AuthContextType } from "./types";

// ─────────────────────────────────────────────────────────────
// Firestore membership resolution
// ─────────────────────────────────────────────────────────────

interface TenantMembership {
  tenantId: string;
  role: Role;
}

const normalizeRole = (role: string | null): Role => {
  if (!role) return "member";
  if (role === "admin" || role === "treasurer" || role === "member") return role;

  // legacy safety (if DB still has old values)
  return "member";
};

const fetchMembership = async (uid: string): Promise<TenantMembership | null> => {
  const snap = await getDocs(
    query(
      collection(db, "tenantMembers"),
      where("userId", "==", uid),
      limit(1)
    )
  );

  if (snap.empty) return null;

  const data = snap.docs[0].data();

  return {
    tenantId: data.tenantId as string,
    role: normalizeRole(data.role as string),
  };
};

// ─────────────────────────────────────────────────────────────
// User profile helper
// ─────────────────────────────────────────────────────────────

const ensureUserProfile = async (
  user: User,
  name?: string,
  phone?: string
): Promise<void> => {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) return;

  await setDoc(ref, {
    name: name || user.displayName || "Unknown",
    email: user.email,
    phone: phone || "",
    createdAt: Timestamp.now(),
  });
};

// ─────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>(null);
  const [tenantId, setTenant] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ───────────────────────────────────────────────────────────
  // Resolve membership (tenant + role)
  // ───────────────────────────────────────────────────────────

  const applyMembership = useCallback(async (uid: string) => {
    const membership = await fetchMembership(uid);

    if (!membership) {
      console.warn(`[Auth] No tenant membership for uid: ${uid}`);
      setRole(null);
      setTenant(null);
      clearTenantId();
      return;
    }

    setTenant(membership.tenantId);
    setTenantId(membership.tenantId);

    setRole(membership.role);
  }, []);

  // ───────────────────────────────────────────────────────────
  // Auth methods
  // ───────────────────────────────────────────────────────────

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    await applyMembership(user.uid);
  }, [applyMembership]);

  const registerWithEmail = useCallback(async (
    email: string,
    password: string,
    name: string,
    phone: string
  ) => {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await ensureUserProfile(user, name, phone);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    const { user } = await signInWithPopup(auth, provider);

    await ensureUserProfile(user);
    await applyMembership(user.uid);
  }, [applyMembership]);

  const logout = useCallback(async () => {
    await signOut(auth);

    setCurrentUser(null);
    setRole(null);
    setTenant(null);
    clearTenantId();
  }, []);

  const applyRoleAfterRegistration = useCallback(async (uid: string) => {
    await applyMembership(uid);
  }, [applyMembership]);

  // ───────────────────────────────────────────────────────────
  // Auth listener
  // ───────────────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        await applyMembership(user.uid);
      } else {
        setRole(null);
        setTenant(null);
        clearTenantId();
      }

      setLoading(false);
    });

    return unsubscribe;
  }, [applyMembership]);

  // ───────────────────────────────────────────────────────────
  // Context value
  // ───────────────────────────────────────────────────────────

  const value: AuthContextType = {
    currentUser,
    tenantId,
    loading,
    role,

    loginWithEmail,
    registerWithEmail,
    loginWithGoogle,
    logout,
    applyRoleAfterRegistration,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};