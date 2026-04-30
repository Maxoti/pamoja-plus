import { useEffect, useState } from "react";
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Looks up the user's tenantId from tenantMembers collection
 * and stores it in sessionStorage + localStorage for all pages to use.
 *
 * This must be called after EVERY login — email, Google, or join flow.
 */
const resolveAndStoreTenant = async (uid: string): Promise<void> => {
  try {
    const q = query(
      collection(db, "tenantMembers"),
      where("userId", "==", uid),
      limit(1)
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      const tenantId = snap.docs[0].data().tenantId as string;
      setTenantId(tenantId);
      console.log(` Tenant resolved: "${tenantId}" for user: "${uid}"`);
    } else {
      console.warn(` No tenantMember found for uid: "${uid}"`);
    }
  } catch (err) {
    console.error(" resolveAndStoreTenant error:", err);
  }
};

/**
 * Creates a user profile document in Firestore if it doesn't exist yet.
 * Safe to call multiple times — only writes on first login.
 */
const createUserProfile = async (
  user: User,
  name?: string,
  phone?: string
): Promise<void> => {
  const userRef  = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      name:      name || user.displayName || "Unknown",
      email:     user.email,
      phone:     phone || "",
      createdAt: Timestamp.now(),
    });
  }
};

// ── Component ─────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading]         = useState(true);

  // ── Auth methods ────────────────────────────────────────────────────────────

  /**
   * Email/password login.
   * Resolves and stores tenantId after successful auth.
   */
  const loginWithEmail = async (email: string, password: string): Promise<void> => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    await resolveAndStoreTenant(result.user.uid);
  };

  /**
   * New user registration.
   * tenantId is stored in Register.tsx after tenant document is created.
   * We only create the user profile here.
   */
  const registerWithEmail = async (
    email: string,
    password: string,
    name: string,
    phone: string
  ): Promise<void> => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    await createUserProfile(result.user, name, phone);
    // Note: setTenantId() is called in Register.tsx after tenant + tenantMember creation
  };

  /**
   * Google sign-in.
   * Creates profile if new user, then resolves tenant.
   */
  const loginWithGoogle = async (): Promise<void> => {
    const provider = new GoogleAuthProvider();
    const result   = await signInWithPopup(auth, provider);
    await createUserProfile(result.user);
    await resolveAndStoreTenant(result.user.uid);
  };

  /**
   * Logout — clears auth session AND tenant from storage.
   */
  const logout = async (): Promise<void> => {
    await signOut(auth);
    clearTenantId(); // ← critical: prevents stale tenant on next login
  };

  // ── Auth state listener ─────────────────────────────────────────────────────
  // Runs once on app load. If a user is already logged in (page refresh),
  // we re-resolve their tenant so the dashboard works without re-logging in.

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);

      if (user) {
        // Re-resolve tenant on page refresh if session is missing
        const stored = sessionStorage.getItem("pamoja_tenantId");
        if (!stored) {
          await resolveAndStoreTenant(user.uid);
        }
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <AuthContext.Provider value={{
      currentUser,
      loading,
      loginWithEmail,
      registerWithEmail,
      loginWithGoogle,
      logout,
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};