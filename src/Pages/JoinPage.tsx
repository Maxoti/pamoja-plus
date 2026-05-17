/**
 * JoinPage.tsx
 *
 * Handles the invite-based member onboarding flow for PamojaPlus.
 *
 * Flow:
 *   1. Page loads → validate token from URL (read-only Firestore check)
 *   2. If valid → show registration form pre-filled with invite email
 *   3. On submit → create Firebase Auth account (or sign in if email exists)
 *   4. Write tenantMember doc, merge tenantId onto user doc, mark invite used
 *   5. Redirect to dashboard
 *
 * Key design decisions:
 *   - Tenant name fetch is isolated in its own try-catch. Unauthenticated
 *     users cannot read /tenants per Firestore rules; this must never
 *     invalidate a perfectly valid invite token.
 *   - auth.tenantId is explicitly cleared before every Firebase Auth call.
 *     A stale tenantId from a previous session scopes Auth lookups to the
 *     wrong identity space, causing 400s on both signUp and signInWithPassword.
 *   - The invite token is marked "accepted" only AFTER the tenantMember doc
 *     is written. A failure on the status update is recoverable by an admin;
 *     burning the token before the user joins is not.
 *   - Audit log write is fire-and-forget. A log failure must never block
 *     a successful join.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  Timestamp,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { db, auth, setTenantId } from "../firebase";

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = "loading" | "invalid" | "expired" | "register" | "joining" | "done";

interface InviteData {
  email:     string;
  role:      string;
  tenantId:  string;
  status:    string;
  expiresAt: Timestamp;
  invitedBy: string;
}

interface TenantData {
  name:      string;
  location?: string;
  plan:      string;
}

interface JoinForm {
  name:            string;
  phone:           string;
  password:        string;
  confirmPassword: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const INITIAL_FORM: JoinForm = {
  name: "", phone: "", password: "", confirmPassword: "",
};

// ── Pure helpers ───────────────────────────────────────────────────────────────

/**
 * Returns a user-facing error message from a Firebase Auth error code.
 * Keeps raw Firebase strings out of the UI entirely.
 */
const authErrorMessage = (code: string | undefined): string => {
  switch (code) {
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "You already have an account with this email. Enter your existing password to accept this invite.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact support.";
    default:
      return "Authentication failed. Please try again.";
  }
};

/**
 * Validates the join form. Returns an error string or empty string if valid.
 */
const validateForm = (form: JoinForm): string => {
  if (!form.name.trim())                       return "Full name is required.";
  if (!form.phone.trim())                      return "Phone number is required.";
  if (form.password.length < 6)               return "Password must be at least 6 characters.";
  if (form.password !== form.confirmPassword) return "Passwords do not match.";
  return "";
};

// ── Core join logic ────────────────────────────────────────────────────────────

/**
 * Executes the full member onboarding sequence atomically:
 * Auth → tenantMember doc → user merge → session → token mark → audit log.
 *
 * Throws on any unrecoverable failure so the caller can surface the message
 * and return the user to the form with the token still valid.
 */
const executeJoin = async (
  invite: InviteData,
  form:   JoinForm,
  token:  string,
): Promise<void> => {
  // ── Step 1: Firebase Auth ───────────────────────────────────────────────────
  //
  // Clear any stale tenantId BEFORE every Auth call. If auth.tenantId is set
  // from a previous session, Firebase scopes the request to that tenant's
  // identity space. The user exists in the main project, not the tenant, so
  // both signUp (EMAIL_EXISTS) and the fallback signIn return 400.

  auth.tenantId = null;

  let uid: string;

  try {
    const { user } = await createUserWithEmailAndPassword(
      auth,
      invite.email,
      form.password,
    );
    uid = user.uid;

    // Best-effort display name — non-blocking if it fails
    await updateProfile(user, { displayName: form.name.trim() }).catch(
      (err) => console.warn("[JoinPage] updateProfile failed:", err),
    );

    await setDoc(doc(db, "users", uid), {
      name:      form.name.trim(),
      email:     invite.email.toLowerCase(),
      phone:     form.phone.trim(),
      createdAt: Timestamp.now(),
    });

  } catch (signUpErr: unknown) {
    const code = (signUpErr as { code?: string }).code;

    if (code !== "auth/email-already-in-use") {
      // Unexpected error — surface it
      throw new Error(authErrorMessage(code), { cause: signUpErr });
    }

    // Email exists → sign in with the password they provided
    auth.tenantId = null; // clear again — defensive reset before second call

    try {
      const { user } = await signInWithEmailAndPassword(
        auth,
        invite.email,
        form.password,
      );
      uid = user.uid;
    } catch (signInErr: unknown) {
      const signInCode = (signInErr as { code?: string }).code;
      throw new Error(authErrorMessage(signInCode), { cause: signInErr });
    }
  }

  // ── Step 2: Write tenantMember document ────────────────────────────────────

  const membershipId = `${invite.tenantId}_${uid}`;
  await setDoc(doc(db, "tenantMembers", membershipId), {
    userId:      uid,
    tenantId:    invite.tenantId,
    name:        form.name.trim(),
    email:       invite.email.toLowerCase(),
    phone:       form.phone.trim(),
    role:        invite.role,
    status:      "active",
    joinedAt:    Timestamp.now(),
    inviteToken: token,
  });

  // ── Step 3: Merge tenantId onto user document ──────────────────────────────

  await setDoc(
    doc(db, "users", uid),
    { tenantId: invite.tenantId },
    { merge: true },
  );

  // ── Step 4: Persist tenantId in session ────────────────────────────────────

  setTenantId(invite.tenantId);

  // ── Step 5: Mark invite as accepted ───────────────────────────────────────
  //
  // This is intentionally LAST among the critical writes. If it fails,
  // the membership already exists and an admin can manually clean up.
  // Burning the token before the membership write would lock the user out
  // permanently with no self-service recovery path.

  await updateDoc(doc(db, "invites", token), {
    status:     "accepted",
    acceptedAt: Timestamp.now(),
    acceptedBy: uid,
  });

  // ── Step 6: Audit log (fire-and-forget) ────────────────────────────────────

  addDoc(collection(db, `tenants/${invite.tenantId}/auditLogs`), {
    actorUserId: uid,
    action:      "MEMBER_JOINED",
    entityType:  "tenantMember",
    entityId:    uid,
    timestamp:   Timestamp.now(),
  }).catch((err) => console.warn("[JoinPage] audit log failed:", err));
};

// ── Sub-components ─────────────────────────────────────────────────────────────

interface StateViewProps {
  icon?:    string;
  title:    string;
  sub:      string;
  spinner?: boolean;
}

const StateView = ({ icon, title, sub, spinner = false }: StateViewProps) => (
  <div className="pj-state">
    {spinner
      ? <div className="pj-spinner" aria-label="Loading" />
      : icon
        ? <div className="pj-state-icon" aria-hidden="true">{icon}</div>
        : null
    }
    <div className="pj-state-title">{title}</div>
    <div className="pj-state-sub">{sub}</div>
  </div>
);

// ── Component ──────────────────────────────────────────────────────────────────

export default function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token    = params.get("token") ?? "";

  // Prevent double-submission if the user clicks the button rapidly
  const submitting = useRef(false);

  const [step,   setStep]   = useState<Step>("loading");
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [error,  setError]  = useState("");
  const [form,   setForm]   = useState<JoinForm>(INITIAL_FORM);

  // ── Token validation ─────────────────────────────────────────────────────────
  //
  // READ ONLY — this effect never writes to Firestore or Firebase Auth.
  // Runs once on mount (token is stable from URL params).

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setStep("invalid");
        return;
      }

      try {
        const inviteSnap = await getDoc(doc(db, "invites", token));

        if (!inviteSnap.exists()) {
          setStep("invalid");
          return;
        }

        const data = inviteSnap.data() as InviteData;

        if (data.status !== "pending") {
          setStep("invalid");
          return;
        }

        if (data.expiresAt.toDate() < new Date()) {
          setStep("expired");
          return;
        }

        // Tenant name fetch — best-effort, isolated from token validation.
        //
        // Unauthenticated users (all fresh invitees) cannot read /tenants per
        // Firestore rules (requires isLoggedIn && isMemberOf). A permission-
        // denied error here must NOT invalidate a valid token — it just means
        // the welcome card shows the tenantId as fallback instead of the name.
        try {
          const tenantSnap = await getDoc(doc(db, "tenants", data.tenantId));
          if (tenantSnap.exists()) {
            setTenant(tenantSnap.data() as TenantData);
          }
        } catch {
          // Intentionally swallowed — UI handles tenant?.name ?? invite.tenantId
        }

        setInvite(data);
        setStep("register");

      } catch (err) {
        console.error("[JoinPage] token validation error:", err);
        setStep("invalid");
      }
    };

    void validate();
  }, [token]);

  // ── Join handler ──────────────────────────────────────────────────────────────

  const handleJoin = useCallback(async () => {
    if (submitting.current || !invite) return;

    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    submitting.current = true;
    setError("");
    setStep("joining");

    try {
      await executeJoin(invite, form, token);
      setStep("done");
      setTimeout(() => navigate("/dashboard"), 2500);

    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : "Something went wrong. Please try again.";
      setError(msg);
      setStep("register");
    } finally {
      submitting.current = false;
    }
  }, [invite, form, token, navigate]);

  const updateForm = useCallback((field: keyof JoinForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError(""); // clear error on next keystroke
  }, [error]);

  // ── Render ────────────────────────────────────────────────────────────────────

  const groupName = tenant?.name ?? invite?.tenantId ?? "a welfare group";

  return (
    <div className="pj-root">
      <style>{CSS}</style>

      <div className="pj-card" role="main">

        {step === "loading" && (
          <StateView
            spinner
            title="Validating invite…"
            sub="Hang on while we check your invite link."
          />
        )}

        {step === "invalid" && (
          <StateView
            icon="🔗"
            title="Invalid invite link"
            sub="This invite link is invalid or has already been used. Ask your group admin for a new one."
          />
        )}

        {step === "expired" && (
          <StateView
            icon="⏰"
            title="Invite link expired"
            sub="This invite link expired after 7 days. Ask your group admin to send a fresh invite."
          />
        )}

        {step === "register" && invite && (
          <>
            {/* Header */}
            <div className="pj-header" aria-label="Invitation details">
              <div className="pj-logo">Pamoja<span>Plus</span></div>
              <div className="pj-eyebrow">You've been invited</div>
              <h1 className="pj-heading">Join {groupName}</h1>
              <p className="pj-sub">Create your account to accept this invitation.</p>
              <div className="pj-badges">
                <span className="pj-badge-group">{groupName}</span>
                <span className="pj-badge-role">as {invite.role}</span>
              </div>
            </div>

            {/* Form */}
            <div className="pj-body">
              {error && (
                <div className="pj-error" role="alert" aria-live="assertive">
                  ⚠ {error}
                </div>
              )}

              {/* Email — read-only, set by invite */}
              <div className="pj-field">
                <label className="pj-label" htmlFor="join-email">
                  Email address <span>(from your invite)</span>
                </label>
                <input
                  id="join-email"
                  className="pj-input"
                  type="email"
                  value={invite.email}
                  disabled
                  aria-readonly="true"
                />
              </div>

              <div className="pj-field">
                <label className="pj-label" htmlFor="join-name">Full name</label>
                <input
                  id="join-name"
                  className="pj-input"
                  type="text"
                  placeholder="e.g. Jane Achieng"
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  autoFocus
                  autoComplete="name"
                />
              </div>

              <div className="pj-field">
                <label className="pj-label" htmlFor="join-phone">
                  Phone number <span>(M-Pesa)</span>
                </label>
                <input
                  id="join-phone"
                  className="pj-input"
                  type="tel"
                  placeholder="0712 345 678"
                  value={form.phone}
                  onChange={(e) => updateForm("phone", e.target.value)}
                  autoComplete="tel"
                />
              </div>

              <div className="pj-row">
                <div className="pj-field">
                  <label className="pj-label" htmlFor="join-password">Password</label>
                  <input
                    id="join-password"
                    className="pj-input"
                    type="password"
                    placeholder="Min. 6 characters"
                    value={form.password}
                    onChange={(e) => updateForm("password", e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="pj-field">
                  <label className="pj-label" htmlFor="join-confirm">Confirm</label>
                  <input
                    id="join-confirm"
                    className="pj-input"
                    type="password"
                    placeholder="Repeat password"
                    value={form.confirmPassword}
                    onChange={(e) => updateForm("confirmPassword", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button
                className="pj-btn-join"
                onClick={handleJoin}
                aria-label="Accept invite and join group"
              >
                Accept invite &amp; join group →
              </button>

              <p className="pj-signin-link">
                Already have an account?{" "}
                <a href="/login">Sign in</a>
              </p>
            </div>
          </>
        )}

        {step === "joining" && (
          <StateView
            spinner
            title="Joining group…"
            sub="Setting up your account and adding you to the group."
          />
        )}

        {step === "done" && (
          <StateView
            icon="✅"
            title="You're in!"
            sub={`Welcome to ${groupName}. Redirecting you to the dashboard…`}
          />
        )}

      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
//
// Scoped with .pj- prefix to avoid collisions with global CSS.

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600;700&display=swap');

  .pj-root {
    font-family: 'DM Sans', sans-serif;
    min-height: 100vh;
    background: #FAFAF7;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .pj-card {
    width: 100%;
    max-width: 460px;
    background: #fff;
    border-radius: 24px;
    box-shadow: 0 4px 40px rgba(0,0,0,0.08);
    overflow: hidden;
  }

  /* ── Header ── */
  .pj-header {
    background: linear-gradient(135deg, #1A3A2A 0%, #0F2419 100%);
    padding: 32px 36px;
  }
  .pj-logo {
    font-family: 'Playfair Display', serif;
    font-size: 18px;
    font-weight: 900;
    color: #fff;
    margin-bottom: 20px;
  }
  .pj-logo span { color: #C8891A; }
  .pj-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    color: rgba(255,255,255,0.5);
    margin-bottom: 8px;
  }
  .pj-heading {
    font-family: 'Playfair Display', serif;
    font-size: 26px;
    font-weight: 700;
    color: #fff;
    line-height: 1.2;
    margin-bottom: 6px;
  }
  .pj-sub {
    font-size: 14px;
    color: rgba(255,255,255,0.55);
    font-weight: 300;
    margin-bottom: 0;
  }
  .pj-badges { margin-top: 16px; }
  .pj-badge-group {
    display: inline-flex;
    align-items: center;
    background: rgba(200,137,26,0.2);
    border: 1px solid rgba(200,137,26,0.4);
    border-radius: 100px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 600;
    color: #E8A832;
  }
  .pj-badge-role {
    display: inline-flex;
    align-items: center;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 100px;
    padding: 4px 12px;
    margin-left: 8px;
    font-size: 12px;
    color: rgba(255,255,255,0.6);
  }

  /* ── Form body ── */
  .pj-body { padding: 32px 36px; }

  .pj-field { margin-bottom: 18px; }
  .pj-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: #333;
    margin-bottom: 7px;
  }
  .pj-label span { color: #BBB; font-weight: 400; }
  .pj-input {
    width: 100%;
    padding: 13px 15px;
    border: 1.5px solid #E8E8E0;
    border-radius: 11px;
    font-size: 15px;
    font-family: 'DM Sans', sans-serif;
    color: #1A1A1A;
    background: #fff;
    transition: border-color 0.2s, box-shadow 0.2s;
    outline: none;
  }
  .pj-input:focus {
    border-color: #1A3A2A;
    box-shadow: 0 0 0 3px rgba(26,58,42,0.08);
  }
  .pj-input::placeholder { color: #CCC; }
  .pj-input:disabled {
    background: #F5F4EF;
    color: #888;
    cursor: not-allowed;
  }
  .pj-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }

  /* ── Error ── */
  .pj-error {
    background: #FEF2F2;
    border: 1px solid #FECACA;
    border-radius: 10px;
    padding: 12px 15px;
    margin-bottom: 18px;
    font-size: 14px;
    color: #DC2626;
    line-height: 1.5;
  }

  /* ── Submit button ── */
  .pj-btn-join {
    width: 100%;
    background: #1A3A2A;
    color: #fff;
    padding: 15px;
    border-radius: 100px;
    font-size: 15px;
    font-weight: 700;
    border: none;
    cursor: pointer;
    font-family: 'DM Sans', sans-serif;
    transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
    margin-top: 6px;
  }
  .pj-btn-join:hover {
    background: #0F2419;
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(26,58,42,0.25);
  }
  .pj-btn-join:active { transform: translateY(0); }

  /* ── Sign in link ── */
  .pj-signin-link {
    text-align: center;
    margin-top: 20px;
    font-size: 13px;
    color: #AAA;
  }
  .pj-signin-link a {
    color: #1A3A2A;
    font-weight: 600;
    text-decoration: none;
  }
  .pj-signin-link a:hover { text-decoration: underline; }

  /* ── State screens (loading / invalid / done) ── */
  .pj-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 64px 36px;
    text-align: center;
    gap: 12px;
  }
  .pj-state-icon { font-size: 48px; margin-bottom: 4px; }
  .pj-state-title {
    font-family: 'Playfair Display', serif;
    font-size: 22px;
    font-weight: 700;
    color: #1A1A1A;
  }
  .pj-state-sub {
    font-size: 14px;
    color: #888;
    line-height: 1.6;
    max-width: 300px;
  }

  /* ── Spinner ── */
  .pj-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid #ECEAE3;
    border-top-color: #1A3A2A;
    border-radius: 50%;
    animation: pj-spin 0.8s linear infinite;
    margin-bottom: 4px;
  }
  @keyframes pj-spin { to { transform: rotate(360deg); } }

  /* ── Responsive ── */
  @media (max-width: 480px) {
    .pj-header, .pj-body { padding: 24px; }
    .pj-row { grid-template-columns: 1fr; }
    .pj-heading { font-size: 22px; }
  }
`;