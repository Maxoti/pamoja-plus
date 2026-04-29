import { useEffect, useState } from "react";
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

// ── Types ─────────────────────────────────────────────────────────────────────

type Step = "loading" | "invalid" | "expired" | "register" | "joining" | "done";

interface InviteData {
  email: string;
  role: string;
  tenantId: string;
  status: string;
  expiresAt: Timestamp;
  invitedBy: string;
}

interface TenantData {
  name: string;
  location?: string;
  plan: string;
}

interface JoinForm {
  name: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INITIAL_FORM: JoinForm = {
  name: "", phone: "", password: "", confirmPassword: "",
};

// ── Validators ────────────────────────────────────────────────────────────────

const validateForm = (form: JoinForm): string => {
  if (!form.name.trim())              return "Full name is required";
  if (!form.phone.trim())             return "Phone number is required";
  if (form.password.length < 6)       return "Password must be at least 6 characters";
  if (form.password !== form.confirmPassword) return "Passwords do not match";
  return "";
};

// ── Join logic (pure async — not a hook) ──────────────────────────────────────

const executeJoin = async (
  invite: InviteData,
  form: JoinForm,
  token: string
): Promise<void> => {
  let uid: string;

  // 1. Try to create account — if email exists, sign in instead
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      invite.email,
      form.password
    );
    uid = credential.user.uid;

    // Set display name
    await updateProfile(credential.user, { displayName: form.name.trim() });

    // Create user profile document
    await setDoc(doc(db, "users", uid), {
      name:      form.name.trim(),
      email:     invite.email.toLowerCase(),
      phone:     form.phone.trim(),
      createdAt: Timestamp.now(),
    });

  } catch (authErr: unknown) {
    const code = (authErr as { code?: string }).code;

    if (code === "auth/email-already-in-use") {
      // Existing user — sign them in
      const credential = await signInWithEmailAndPassword(
        auth,
        invite.email,
        form.password
      );
      uid = credential.user.uid;
    } else {
      throw authErr; // rethrow unexpected errors
    }
  }

  // 2. Create tenantMember document — uid_tenantId (consistent with Register.tsx)
  const membershipId = `${invite.tenantId}_${uid}`;
  await setDoc(doc(db, "tenantMembers", membershipId), {
    userId:      uid,
    tenantId:    invite.tenantId,
     name:        form.name.trim(),
  email:       invite.email.toLowerCase(),
    role:        invite.role,

    status:      "active",
    joinedAt:    Timestamp.now(),
    inviteToken: token,
  });

  // 3. Merge tenantId onto user doc for dashboard lookup
  await setDoc(
    doc(db, "users", uid),
    { tenantId: invite.tenantId },
    { merge: true }
  );

  // 4. Store tenantId in session for immediate dashboard access
  setTenantId(invite.tenantId);

  // 5. Mark invite as used — prevent reuse
  await updateDoc(doc(db, "invites", token), {
    status:     "accepted",
    acceptedAt: Timestamp.now(),
    acceptedBy: uid,
  });

  // 6. Audit log
  await addDoc(collection(db, `tenants/${invite.tenantId}/auditLogs`), {
    actorUserId: uid,
    action:      "MEMBER_JOINED",
    entityType:  "tenantMember",
    entityId:    uid,
    timestamp:   Timestamp.now(),
  });
};

// ── Sub-components ────────────────────────────────────────────────────────────

const StateView = ({
  icon, title, sub, spinner = false,
}: {
  icon?: string;
  title: string;
  sub: string;
  spinner?: boolean;
}) => (
  <div className="state-center">
    {spinner
      ? <div className="spinner" />
      : <div className="state-icon">{icon}</div>
    }
    <div className="state-title">{title}</div>
    <div className="state-sub">{sub}</div>
  </div>
);

// ── Component ─────────────────────────────────────────────────────────────────

export default function JoinPage() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const token      = params.get("token") ?? "";

  // ── State ───────────────────────────────────────────────────────────────────
  const [step,   setStep]   = useState<Step>("loading");
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [error,  setError]  = useState("");
  const [form,   setForm]   = useState<JoinForm>(INITIAL_FORM);

  // ── Token validation ────────────────────────────────────────────────────────
  useEffect(() => {
    const validate = async () => {
      if (!token) { setStep("invalid"); return; }

      try {
        const inviteSnap = await getDoc(doc(db, "invites", token));
        if (!inviteSnap.exists())          { setStep("invalid"); return; }

        const data = inviteSnap.data() as InviteData;
        if (data.status !== "pending")     { setStep("invalid"); return; }
        if (data.expiresAt.toDate() < new Date()) { setStep("expired"); return; }

        // Pre-fill email from invite
        setForm((prev) => ({ ...prev }));

        // Load tenant name for welcome screen
        const tenantSnap = await getDoc(doc(db, "tenants", data.tenantId));
        if (tenantSnap.exists()) setTenant(tenantSnap.data() as TenantData);

        setInvite(data);
        setStep("register");

      } catch (err) {
        console.error("Token validation error:", err);
        setStep("invalid");
      }
    };

    void validate();
  }, [token]);

  // ── Join handler ────────────────────────────────────────────────────────────
  const handleJoin = async () => {
    const validationError = validateForm(form);
    if (validationError) { setError(validationError); return; }
    if (!invite) return;

    setError("");
    setStep("joining");

    try {
      await executeJoin(invite, form, token);
      setStep("done");
      setTimeout(() => navigate("/dashboard"), 2500);

    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
            .replace("Firebase: ", "")
            .replace(/\(auth\/.*\)/, "")
            .trim()
        : "Something went wrong. Please try again.";
      setError(msg);
      setStep("register");
    }
  };

  const updateForm = (field: keyof JoinForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{
      fontFamily: "'DM Sans', sans-serif",
      minHeight: "100vh",
      background: "#FAFAF7",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .join-card { width: 100%; max-width: 460px; background: white; border-radius: 24px; box-shadow: 0 4px 40px rgba(0,0,0,0.08); overflow: hidden; }

        .join-header { background: linear-gradient(135deg, #1A3A2A 0%, #0F2419 100%); padding: 32px 36px; }
        .join-logo { font-family: 'Playfair Display', serif; font-size: 18px; font-weight: 900; color: white; margin-bottom: 20px; }
        .join-logo span { color: #C8891A; }
        .join-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 8px; }
        .join-heading { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 700; color: white; line-height: 1.2; margin-bottom: 6px; }
        .join-sub { font-size: 14px; color: rgba(255,255,255,0.55); font-weight: 300; }
        .group-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(200,137,26,0.2); border: 1px solid rgba(200,137,26,0.4); border-radius: 100px; padding: 6px 14px; margin-top: 16px; font-size: 13px; font-weight: 600; color: #E8A832; }
        .role-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 100px; padding: 4px 12px; margin-top: 8px; margin-left: 8px; font-size: 12px; color: rgba(255,255,255,0.6); }

        .join-body { padding: 32px 36px; }

        .form-group { margin-bottom: 18px; }
        .form-label { display: block; font-size: 13px; font-weight: 600; color: #333; margin-bottom: 7px; }
        .form-label span { color: #BBB; font-weight: 400; }
        .form-input { width: 100%; padding: 13px 15px; border: 1.5px solid #E8E8E0; border-radius: 11px; font-size: 15px; font-family: 'DM Sans', sans-serif; color: #1A1A1A; background: white; transition: all 0.2s; outline: none; }
        .form-input:focus { border-color: #1A3A2A; box-shadow: 0 0 0 3px rgba(26,58,42,0.08); }
        .form-input::placeholder { color: #CCC; }
        .form-input:disabled { background: #F5F4EF; color: #888; cursor: not-allowed; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

        .error-box { background: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px; padding: 12px 15px; margin-bottom: 18px; font-size: 14px; color: #DC2626; }

        .btn-join { width: 100%; background: #1A3A2A; color: white; padding: 15px; border-radius: 100px; font-size: 15px; font-weight: 700; border: none; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; margin-top: 6px; }
        .btn-join:hover:not(:disabled) { background: #0F2419; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(26,58,42,0.25); }
        .btn-join:disabled { opacity: 0.6; cursor: not-allowed; }

        .state-center { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 36px; text-align: center; gap: 12px; }
        .state-icon { font-size: 48px; margin-bottom: 4px; }
        .state-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 700; color: #1A1A1A; }
        .state-sub { font-size: 14px; color: #888; line-height: 1.6; max-width: 300px; }

        .spinner { width: 36px; height: 36px; border: 3px solid #ECEAE3; border-top-color: #1A3A2A; border-radius: 50%; animation: spin 0.8s linear infinite; margin-bottom: 4px; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .already-have { text-align: center; margin-top: 20px; font-size: 13px; color: #AAA; }
        .already-have a { color: #1A3A2A; font-weight: 600; text-decoration: none; }
        .already-have a:hover { text-decoration: underline; }

        @media (max-width: 480px) {
          .join-header, .join-body { padding: 24px; }
          .form-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="join-card">

        {/* Loading */}
        {step === "loading" && (
          <StateView
            spinner
            title="Validating invite…"
            sub="Hang on while we check your invite link."
          />
        )}

        {/* Invalid */}
        {step === "invalid" && (
          <StateView
            icon="🔗"
            title="Invalid invite link"
            sub="This invite link is invalid or has already been used. Ask your group admin for a new one."
          />
        )}

        {/* Expired */}
        {step === "expired" && (
          <StateView
            icon=""
            title="Invite link expired"
            sub="This invite link expired after 7 days. Ask your group admin to send a fresh invite."
          />
        )}

        {/* Register form */}
        {step === "register" && invite && (
          <>
            <div className="join-header">
              <div className="join-logo">Pamoja<span>Plus</span></div>
              <div className="join-eyebrow">You've been invited</div>
              <div className="join-heading">
                Join {tenant?.name ?? "a welfare group"}
              </div>
              <div className="join-sub">
                Create your account to accept this invitation.
              </div>
              <div>
                <span className="group-badge">
                   {tenant?.name ?? invite.tenantId}
                </span>
                <span className="role-badge">
                  as {invite.role}
                </span>
              </div>
            </div>

            <div className="join-body">
              {error && <div className="error-box"> {error}</div>}

              {/* Email — readonly from invite */}
              <div className="form-group">
                <label className="form-label">Email address</label>
                <input
                  className="form-input"
                  type="email"
                  value={invite.email}
                  disabled
                />
              </div>

              <div className="form-group">
                <label className="form-label">Full name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Jane Achieng"
                  value={form.name}
                  onChange={(e) => updateForm("name", e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Phone number <span>(M-Pesa)</span>
                </label>
                <input
                  className="form-input"
                  placeholder="0712 345 678"
                  value={form.phone}
                  onChange={(e) => updateForm("phone", e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="Min. 6 characters"
                    value={form.password}
                    onChange={(e) => updateForm("password", e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm</label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="Repeat password"
                    value={form.confirmPassword}
                    onChange={(e) => updateForm("confirmPassword", e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  />
                </div>
              </div>

              <button
                className="btn-join"
                onClick={handleJoin}
              >
                Accept invite & join group →
              </button>

              <div className="already-have">
                Already have an account?{" "}
                <a href="/login">Sign in</a>
              </div>
            </div>
          </>
        )}

        {/* Joining spinner */}
        {step === "joining" && (
          <StateView
            spinner
            title="Joining group…"
            sub="Setting up your account and adding you to the group."
          />
        )}

        {/* Done */}
        {step === "done" && (
          <StateView
            title="You're in!"
            sub={`Welcome to ${tenant?.name ?? "the group"}. Redirecting you to the dashboard…`}
          />
        )}

      </div>
    </div>
  );
}