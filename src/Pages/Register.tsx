import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { db } from "../firebase";
import { doc, setDoc, addDoc,collection,Timestamp } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

type Step = 1 | 2 | 3;

interface FormData {
  // Step 1 - Admin (Owner)
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  password: string;
  confirmPassword: string;
  // Step 2 - Group Info
  groupName: string;
  groupLocation: string;
  groupDescription: string;
  // Step 3 - Plan
  plan: "free" | "pro" | "enterprise";
}

const initialForm: FormData = {
  adminName: "",
  adminEmail: "",
  adminPhone: "",
  password: "",
  confirmPassword: "",
  groupName: "",
  groupLocation: "",
  groupDescription: "",
  plan: "free",
};

export default function Register() {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { registerWithEmail } = useAuth();
  const navigate = useNavigate();

  const update = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const validateStep1 = () => {
    if (!form.adminName.trim()) return "Full name is required";
    if (!form.adminEmail.trim()) return "Email is required";
    if (!form.adminPhone.trim()) return "Phone number is required";
    if (form.password.length < 6) return "Password must be at least 6 characters";
    if (form.password !== form.confirmPassword) return "Passwords do not match";
    return "";
  };

  const validateStep2 = () => {
    if (!form.groupName.trim()) return "Group name is required";
    if (!form.groupLocation.trim()) return "Location is required";
    return "";
  };

  const handleNext = () => {
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
    }
    if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
    }
    setStep((prev) => (prev + 1) as Step);
  };

const handleSubmit = async () => {
  setLoading(true);
  setError("");
  try {
    await registerWithEmail(form.adminEmail, form.password, form.adminName, form.adminPhone);

    const { auth } = await import("../firebase");
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("User creation failed");

    const tenantId = `tenant_${Date.now()}`;

    await setDoc(doc(db, "tenants", tenantId), {
      name: form.groupName,
      location: form.groupLocation,
      description: form.groupDescription,
      plan: form.plan,
      status: "active",
      ownerUserId: uid,
      createdAt: Timestamp.now(),
    });

    // ✅ Key order fixed: tenantId_uid
    await setDoc(doc(db, "tenantMembers", `${tenantId}_${uid}`), {
      tenantId,
      userId: uid,
      name: form.adminName,
      email: form.adminEmail,
      role: "owner",
      status: "active",
      joinedAt: Timestamp.now(),
    });

    // ✅ Write tenantId to user doc so Dashboard can find it
    await setDoc(doc(db, "users", uid), { tenantId }, { merge: true });

    await addDoc(collection(db, `tenants/${tenantId}/auditLogs`), {
      actorUserId: uid,
      action: "TENANT_CREATED",
      entityType: "tenant",
      entityId: tenantId,
      timestamp: Timestamp.now(),
    });

    navigate("/dashboard");
  } catch (err: unknown) {
    if (err instanceof Error) {
      const msg = err.message;
      if (msg.includes("email-already-in-use")) {
        setError("An account with this email already exists.");
      } else {
        setError(msg.replace("Firebase: ", "").replace(/\(auth\/.*\)\.?/, "").trim());
      }
    }
  } finally {
    setLoading(false);
  }
};

  const steps = [
    { num: 1, label: "Your account" },
    { num: 2, label: "Group details" },
    { num: 3, label: "Choose plan" },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", background: "#FAFAF7", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .reg-left { width: 420px; min-height: 100vh; background: #1A3A2A; padding: 48px 40px; display: flex; flex-direction: column; position: sticky; top: 0; }
        .reg-logo { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 900; color: white; margin-bottom: 64px; }
        .reg-logo span { color: #C8891A; }

        .reg-steps { display: flex; flex-direction: column; gap: 0; }
        .reg-step { display: flex; align-items: flex-start; gap: 16px; padding: 20px 0; position: relative; }
        .reg-step:not(:last-child)::after { content: ''; position: absolute; left: 15px; top: 48px; width: 1px; height: calc(100% - 20px); background: rgba(255,255,255,0.1); }
        .step-circle { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; transition: all 0.3s; }
        .step-circle.done { background: #C8891A; color: white; }
        .step-circle.active { background: white; color: #1A3A2A; }
        .step-circle.upcoming { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.4); }
        .step-info { padding-top: 4px; }
        .step-num-label { font-size: 11px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }
        .step-name { font-size: 15px; font-weight: 600; color: white; }
        .step-name.upcoming { color: rgba(255,255,255,0.4); }

        .reg-testimonial { margin-top: auto; background: rgba(255,255,255,0.05); border-radius: 16px; padding: 24px; border: 1px solid rgba(255,255,255,0.08); }
        .testimonial-text { font-size: 14px; color: rgba(245,230,200,0.8); line-height: 1.7; font-weight: 300; margin-bottom: 16px; font-style: italic; }
        .testimonial-author { font-size: 13px; font-weight: 600; color: #C8891A; }
        .testimonial-role { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 2px; }

        .reg-right { flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px; }
        .reg-form { width: 100%; max-width: 480px; }

        .form-header { margin-bottom: 40px; }
        .form-step-label { font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #C8891A; margin-bottom: 12px; }
        .form-title { font-family: 'Playfair Display', serif; font-size: 36px; font-weight: 700; color: #1A1A1A; line-height: 1.1; letter-spacing: -1px; margin-bottom: 8px; }
        .form-sub { font-size: 15px; color: #888; font-weight: 300; line-height: 1.6; }

        .form-group { margin-bottom: 20px; }
        .form-label { font-size: 13px; font-weight: 600; color: #333; margin-bottom: 8px; display: block; }
        .form-input { width: 100%; padding: 14px 16px; border: 1.5px solid #E8E8E0; border-radius: 12px; font-size: 15px; font-family: 'DM Sans', sans-serif; color: #1A1A1A; background: white; transition: all 0.2s; outline: none; }
        .form-input:focus { border-color: #1A3A2A; box-shadow: 0 0 0 3px rgba(26,58,42,0.08); }
        .form-input::placeholder { color: #BBB; }
        textarea.form-input { resize: vertical; min-height: 100px; }

        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        .plan-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 8px; }
        .plan-card { border: 2px solid #E8E8E0; border-radius: 16px; padding: 20px 16px; cursor: pointer; transition: all 0.2s; background: white; text-align: left; }
        .plan-card:hover { border-color: #1A3A2A; }
        .plan-card.selected { border-color: #1A3A2A; background: #F0F7F3; }
        .plan-card.selected.pro { border-color: #C8891A; background: #FDF8F0; }
        .plan-name { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 8px; }
        .plan-price { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #1A1A1A; line-height: 1; }
        .plan-period { font-size: 12px; color: #888; margin-top: 2px; margin-bottom: 12px; }
        .plan-features { list-style: none; display: flex; flex-direction: column; gap: 6px; }
        .plan-features li { font-size: 12px; color: #666; display: flex; align-items: center; gap: 6px; }
        .plan-features li::before { content: '✓'; color: #C8891A; font-weight: 700; font-size: 11px; }

        .error-box { background: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px; color: #DC2626; }

        .form-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 32px; }
        .btn-back { background: transparent; border: none; color: #888; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; padding: 0; transition: color 0.2s; }
        .btn-back:hover { color: #1A1A1A; }
        .btn-next { background: #1A3A2A; color: white; padding: 14px 36px; border-radius: 100px; font-size: 15px; font-weight: 700; border: none; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; display: flex; align-items: center; gap: 8px; }
        .btn-next:hover { background: #0F2419; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(26,58,42,0.25); }
        .btn-next:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

        .login-link { text-align: center; margin-top: 24px; font-size: 14px; color: #888; }
        .login-link a { color: #1A3A2A; font-weight: 600; text-decoration: none; }
        .login-link a:hover { text-decoration: underline; }

        @media (max-width: 768px) {
          .reg-left { display: none; }
          .reg-right { padding: 32px 24px; }
          .form-row { grid-template-columns: 1fr; }
          .plan-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* LEFT PANEL */}
      <div className="reg-left">
        <div className="reg-logo">Pamoja<span>Plus</span></div>

        <div className="reg-steps">
          {steps.map((s) => (
            <div className="reg-step" key={s.num}>
              <div className={`step-circle ${step > s.num ? "done" : step === s.num ? "active" : "upcoming"}`}>
                {step > s.num ? "✓" : s.num}
              </div>
              <div className="step-info">
                <div className="step-num-label">Step {s.num}</div>
                <div className={`step-name ${step < s.num ? "upcoming" : ""}`}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="reg-testimonial">
          <div className="testimonial-text">
            "Pamoja Plus replaced our WhatsApp group and Excel sheets. Now every member can see their contribution history and the treasurer has full accountability."
          </div>
          <div className="testimonial-author">Nyikwa Charles Agolla</div>
          <div className="testimonial-role">Kotuoma Welfare Group, Nairobi</div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="reg-right">
        <div className="reg-form">

          {/* STEP 1 — Account */}
          {step === 1 && (
            <>
              <div className="form-header">
                <div className="form-step-label">Step 1 of 3</div>
                <h1 className="form-title">Create your account</h1>
                <p className="form-sub">You'll be the admin of your welfare group.</p>
              </div>

              {error && <div className="error-box">⚠ {error}</div>}

              <div className="form-group">
                <label className="form-label">Full name</label>
                <input className="form-input" placeholder="e.g. Nyikwa Charles" value={form.adminName} onChange={(e) => update("adminName", e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Email address</label>
                <input className="form-input" type="email" placeholder="you@example.com" value={form.adminEmail} onChange={(e) => update("adminEmail", e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Phone number (M-Pesa)</label>
                <input className="form-input" placeholder="0712 345 678" value={form.adminPhone} onChange={(e) => update("adminPhone", e.target.value)} />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Password</label>
                  <input className="form-input" type="password" placeholder="Min. 6 characters" value={form.password} onChange={(e) => update("password", e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirm password</label>
                  <input className="form-input" type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={(e) => update("confirmPassword", e.target.value)} />
                </div>
              </div>
            </>
          )}

          {/* STEP 2 — Group Info */}
          {step === 2 && (
            <>
              <div className="form-header">
                <div className="form-step-label">Step 2 of 3</div>
                <h1 className="form-title">About your group</h1>
                <p className="form-sub">Tell us about the welfare group you're registering.</p>
              </div>

              {error && <div className="error-box">⚠ {error}</div>}

              <div className="form-group">
                <label className="form-label">Group name</label>
                <input className="form-input" placeholder="e.g. Kotuoma Welfare Group" value={form.groupName} onChange={(e) => update("groupName", e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Location</label>
                <input className="form-input" placeholder="e.g. Nairobi, Kenya" value={form.groupLocation} onChange={(e) => update("groupLocation", e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Description <span style={{ color: "#BBB", fontWeight: 400 }}>(optional)</span></label>
                <textarea className="form-input" placeholder="What does your group do?" value={form.groupDescription} onChange={(e) => update("groupDescription", e.target.value)} />
              </div>
            </>
          )}

          {/* STEP 3 — Plan */}
          {step === 3 && (
            <>
              <div className="form-header">
                <div className="form-step-label">Step 3 of 3</div>
                <h1 className="form-title">Choose your plan</h1>
                <p className="form-sub">Start free, upgrade when your group grows.</p>
              </div>

              {error && <div className="error-box">⚠ {error}</div>}

              <div className="plan-grid">
                {[
                  {
                    id: "free" as const,
                    name: "Starter",
                    price: "Free",
                    period: "forever",
                    features: ["Up to 20 members", "1 group", "Contributions", "Announcements"],
                  },
                  {
                    id: "pro" as const,
                    name: "Pro",
                    price: "KES 2,000",
                    period: "per month",
                    features: ["Unlimited members", "Multiple groups", "Pledges & cycles", "Audit logs"],
                  },
                  {
                    id: "enterprise" as const,
                    name: "Enterprise",
                    price: "Custom",
                    period: "contact us",
                    features: ["Custom branding", "M-Pesa automation", "API access", "Dedicated support"],
                  },
                ].map((p) => (
                  <div
                    key={p.id}
                    className={`plan-card ${form.plan === p.id ? "selected" : ""} ${p.id === "pro" ? "pro" : ""}`}
                    onClick={() => update("plan", p.id)}
                  >
                    <div className="plan-name">{p.name}</div>
                    <div className="plan-price">{p.price}</div>
                    <div className="plan-period">{p.period}</div>
                    <ul className="plan-features">
                      {p.features.map((f) => <li key={f}>{f}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ACTIONS */}
          <div className="form-actions">
            {step > 1
              ? <button className="btn-back" onClick={() => setStep((p) => (p - 1) as Step)}>← Back</button>
              : <a href="/" style={{ fontSize: 14, color: "#888", textDecoration: "none" }}>← Back to home</a>
            }

            {step < 3
              ? <button className="btn-next" onClick={handleNext}>Continue →</button>
              : (
                <button className="btn-next" onClick={handleSubmit} disabled={loading}>
                  {loading ? "Creating account..." : " Register group"}
                </button>
              )
            }
          </div>

          <div className="login-link">
            Already have an account? <a href="/login">Sign in</a>
          </div>
        </div>
      </div>
    </div>
  );
}