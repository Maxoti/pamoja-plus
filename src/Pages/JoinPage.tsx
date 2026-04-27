import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";

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

export default function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { registerWithEmail } = useAuth();

  const token = params.get("token") ?? "";

  const [step, setStep] = useState<Step>("loading");
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [tenant, setTenant] = useState<TenantData | null>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  // ── 1. Validate token on mount ──────────────────────────────────────────────
  useEffect(() => {
    const validate = async () => {
      if (!token) { setStep("invalid"); return; }

      try {
        const inviteSnap = await getDoc(doc(db, "invites", token));

        if (!inviteSnap.exists()) { setStep("invalid"); return; }

        const data = inviteSnap.data() as InviteData;

        // Check already used
        if (data.status !== "pending") { setStep("invalid"); return; }

        // Check expiry
        if (data.expiresAt.toDate() < new Date()) { setStep("expired"); return; }

        // Load tenant info for the welcome screen
        const tenantSnap = await getDoc(doc(db, "tenants", data.tenantId));
        if (tenantSnap.exists()) {
          setTenant(tenantSnap.data() as TenantData);
        }

        setInvite(data);
        setStep("register");
      } catch (err) {
        console.error("Token validation error:", err);
        setStep("invalid");
      }
    };

    void validate();
  }, [token]);

  // ── 2. Register + join group ────────────────────────────────────────────────
  const handleJoin = async () => {
    if (!form.name.trim()) { setError("Full name is required"); return; }
    if (!form.phone.trim()) { setError("Phone number is required"); return; }
    if (form.password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (form.password !== form.confirmPassword) { setError("Passwords do not match"); return; }
    if (!invite) return;

    setError("");
    setStep("joining");

    try {
      // a. Create Firebase Auth account
      await registerWithEmail(invite.email, form.password, form.name, form.phone);

      // b. Get the newly created user UID
      //    registerWithEmail triggers onAuthStateChanged, so currentUser may
      //    not be updated yet — read directly from auth instead
      const { auth } = await import("../firebase");
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Auth failed — no user UID");

      // c. Create tenantMember record
      await setDoc(doc(db, "tenantMembers", `${invite.tenantId}_${uid}`), {
        tenantId: invite.tenantId,
        userId: uid,
        role: invite.role,
        status: "active",
        joinedAt: Timestamp.now(),
        inviteToken: token,
      });

      // d. Store tenantId on user doc (for Dashboard lookup)
      await setDoc(
        doc(db, "users", uid),
        { tenantId: invite.tenantId },
        { merge: true }
      );

      // e. Mark invite as used
      await updateDoc(doc(db, "invites", token), {
        status: "accepted",
        acceptedAt: Timestamp.now(),
        acceptedBy: uid,
      });

      setStep("done");
      setTimeout(() => navigate("/dashboard"), 2500);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message.replace("Firebase: ", "").replace(/\(auth.*\)/, "")
          : "Something went wrong. Please try again.";
      setError(msg);
      setStep("register");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", background: "#FAFAF7", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .join-card {
          width: 100%;
          max-width: 460px;
          background: white;
          border-radius: 24px;
          box-shadow: 0 4px 40px rgba(0,0,0,0.08);
          overflow: hidden;
        }
        .join-header {
          background: linear-gradient(135deg, #1A3A2A 0%, #0F2419 100%);
          padding: 32px 36px;
        }
        .join-logo {
          font-family: 'Playfair Display', serif;
          font-size: 18px;
          font-weight: 900;
          color: white;
          margin-bottom: 20px;
        }
        .join-logo span { color: #C8891A; }
        .join-eyebrow {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          color: rgba(255,255,255,0.5);
          margin-bottom: 8px;
        }
        .join-heading {
          font-family: 'Playfair Display', serif;
          font-size: 26px;
          font-weight: 700;
          color: white;
          line-height: 1.2;
          margin-bottom: 6px;
        }
        .join-sub {
          font-size: 14px;
          color: rgba(255,255,255,0.55);
          font-weight: 300;
        }
        .group-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(200,137,26,0.2);
          border: 1px solid rgba(200,137,26,0.4);
          border-radius: 100px;
          padding: 6px 14px;
          margin-top: 16px;
          font-size: 13px;
          font-weight: 600;
          color: #E8A832;
        }
        .role-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 100px;
          padding: 4px 12px;
          margin-top: 8px;
          margin-left: 8px;
          font-size: 12px;
          color: rgba(255,255,255,0.6);
        }

        .join-body { padding: 32px 36px; }

        .form-group { margin-bottom: 18px; }
        .form-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #333;
          margin-bottom: 7px;
        }
        .form-label span { color: #BBB; font-weight: 400; }
        .form-input {
          width: 100%;
          padding: 13px 15px;
          border: 1.5px solid #E8E8E0;
          border-radius: 11px;
          font-size: 15px;
          font-family: 'DM Sans', sans-serif;
          color: #1A1A1A;
          background: white;
          transition: all 0.2s;
          outline: none;
        }
        .form-input:focus {
          border-color: #1A3A2A;
          box-shadow: 0 0 0 3px rgba(26,58,42,0.08);
        }
        .form-input::placeholder { color: #CCC; }
        .form-input:disabled {
          background: #F5F4EF;
          color: #888;
          cursor: not-allowed;
        }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

        .error-box {
          background: #FEF2F2;
          border: 1px solid #FECACA;
          border-radius: 10px;
          padding: 12px 15px;
          margin-bottom: 18px;
          font-size: 14px;
          color: #DC2626;
        }
        .btn-join {
          width: 100%;
          background: #1A3A2A;
          color: white;
          padding: 15px;
          border-radius: 100px;
          font-size: 15px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.2s;
          margin-top: 6px;
        }
        .btn-join:hover:not(:disabled) {
          background: #0F2419;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(26,58,42,0.25);
        }
        .btn-join:disabled { opacity: 0.6; cursor: not-allowed; }

        .state-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 64px 36px;
          text-align: center;
          gap: 12px;
        }
        .state-icon { font-size: 48px; margin-bottom: 4px; }
        .state-title {
          font-family: 'Playfair Display', serif;
          font-size: 22px;
          font-weight: 700;
          color: #1A1A1A;
        }
        .state-sub { font-size: 14px; color: #888; line-height: 1.6; max-width: 300px; }

        .spinner {
          width: 36px; height: 36px;
          border: 3px solid #ECEAE3;
          border-top-color: #1A3A2A;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 4px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .already-have {
          text-align: center;
          margin-top: 20px;
          font-size: 13px;
          color: #AAA;
        }
        .already-have a {
          color: #1A3A2A;
          font-weight: 600;
          text-decoration: none;
        }
        .already-have a:hover { text-decoration: underline; }

        @media (max-width: 480px) {
          .join-header { padding: 24px; }
          .join-body { padding: 24px; }
          .form-row { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="join-card">

        {/* ── Loading ── */}
        {step === "loading" && (
          <div className="state-center">
            <div className="spinner" />
            <div className="state-title">Validating invite…</div>
            <div className="state-sub">Hang on while we check your invite link.</div>
          </div>
        )}

        {/* ── Invalid ── */}
        {step === "invalid" && (
          <div className="state-center">
            <div className="state-icon">🔗</div>
            <div className="state-title">Invalid invite link</div>
            <div className="state-sub">
              This invite link is invalid or has already been used. Ask your group admin for a new one.
            </div>
          </div>
        )}

        {/* ── Expired ── */}
        {step === "expired" && (
          <div className="state-center">
            <div className="state-icon">⏰</div>
            <div className="state-title">Invite link expired</div>
            <div className="state-sub">
              This invite link expired after 7 days. Ask your group admin to send a fresh invite.
            </div>
          </div>
        )}

        {/* ── Register form ── */}
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
                  🏠 {tenant?.name ?? invite.tenantId}
                </span>
                <span className="role-badge">
                  as {invite.role}
                </span>
              </div>
            </div>

            <div className="join-body">
              {error && <div className="error-box">⚠ {error}</div>}

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
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); setError(""); }}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Phone number <span>(M-Pesa)</span></label>
                <input
                  className="form-input"
                  placeholder="0712 345 678"
                  value={form.phone}
                  onChange={(e) => { setForm({ ...form, phone: e.target.value }); setError(""); }}
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
                    onChange={(e) => { setForm({ ...form, password: e.target.value }); setError(""); }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm</label>
                  <input
                    className="form-input"
                    type="password"
                    placeholder="Repeat password"
                    value={form.confirmPassword}
                    onChange={(e) => { setForm({ ...form, confirmPassword: e.target.value }); setError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                  />
                </div>
              </div>

              <button className="btn-join" onClick={handleJoin}>
                Accept invite & join group →
              </button>

              <div className="already-have">
                Already have an account? <a href="/login">Sign in</a>
              </div>
            </div>
          </>
        )}

        {/* ── Joining spinner ── */}
        {step === "joining" && (
          <div className="state-center">
            <div className="spinner" />
            <div className="state-title">Joining group…</div>
            <div className="state-sub">Setting up your account and adding you to the group.</div>
          </div>
        )}

        {/* ── Done ── */}
        {step === "done" && (
          <div className="state-center">
            <div className="state-icon">🎉</div>
            <div className="state-title">You're in!</div>
            <div className="state-sub">
              Welcome to {tenant?.name ?? "the group"}. Redirecting you to the dashboard…
            </div>
          </div>
        )}
      </div>
    </div>
  );
}