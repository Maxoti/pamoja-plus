import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { loginWithEmail } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!email.trim()) { setError("Email is required"); return; }
    if (!password) { setError("Password is required"); return; }

    setLoading(true);
    setError("");
    try {
      await loginWithEmail(email, password);
      navigate("/dashboard");
    } catch (err: unknown) {
      if (err instanceof Error) {
        const msg = err.message.replace("Firebase: ", "").replace(/\(auth.*\)/, "");
        // Friendlier messages for common Firebase auth errors
        if (msg.toLowerCase().includes("invalid-credential") || msg.toLowerCase().includes("wrong-password")) {
          setError("Incorrect email or password. Please try again.");
        } else if (msg.toLowerCase().includes("too-many-requests")) {
          setError("Too many failed attempts. Please wait a moment and try again.");
        } else {
          setError(msg);
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: "100vh", background: "#FAFAF7", display: "flex" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        /* ── LEFT PANEL ── */
        .login-left {
          width: 420px;
          min-height: 100vh;
          background: #1A3A2A;
          padding: 48px 40px;
          display: flex;
          flex-direction: column;
          position: sticky;
          top: 0;
        }
        .login-logo {
          font-family: 'Playfair Display', serif;
          font-size: 22px;
          font-weight: 900;
          color: white;
          margin-bottom: 64px;
        }
        .login-logo span { color: #C8891A; }

        .login-welcome {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .welcome-eyebrow {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #C8891A;
          margin-bottom: 16px;
        }
        .welcome-heading {
          font-family: 'Playfair Display', serif;
          font-size: 40px;
          font-weight: 900;
          color: white;
          line-height: 1.1;
          letter-spacing: -1px;
          margin-bottom: 20px;
        }
        .welcome-body {
          font-size: 14px;
          color: rgba(255,255,255,0.5);
          font-weight: 300;
          line-height: 1.8;
        }

        .left-divider {
          width: 48px;
          height: 2px;
          background: #C8891A;
          margin: 32px 0;
        }

        .left-stats {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .stat-row {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .stat-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(200,137,26,0.15);
          border: 1px solid rgba(200,137,26,0.25);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          flex-shrink: 0;
        }
        .stat-label {
          font-size: 12px;
          color: rgba(255,255,255,0.4);
          margin-bottom: 2px;
        }
        .stat-value {
          font-size: 15px;
          font-weight: 600;
          color: white;
        }

        .login-testimonial {
          margin-top: auto;
          background: rgba(255,255,255,0.05);
          border-radius: 16px;
          padding: 24px;
          border: 1px solid rgba(255,255,255,0.08);
        }
        .testimonial-text {
          font-size: 14px;
          color: rgba(245,230,200,0.8);
          line-height: 1.7;
          font-weight: 300;
          margin-bottom: 16px;
          font-style: italic;
        }
        .testimonial-author { font-size: 13px; font-weight: 600; color: #C8891A; }
        .testimonial-role { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 2px; }

        /* ── RIGHT PANEL ── */
        .login-right {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px;
        }
        .login-form {
          width: 100%;
          max-width: 440px;
        }

        .form-header { margin-bottom: 40px; }
        .form-step-label {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #C8891A;
          margin-bottom: 12px;
        }
        .form-title {
          font-family: 'Playfair Display', serif;
          font-size: 36px;
          font-weight: 700;
          color: #1A1A1A;
          line-height: 1.1;
          letter-spacing: -1px;
          margin-bottom: 8px;
        }
        .form-sub {
          font-size: 15px;
          color: #888;
          font-weight: 300;
          line-height: 1.6;
        }

        .form-group { margin-bottom: 20px; }
        .form-label {
          font-size: 13px;
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
          display: block;
        }
        .form-input {
          width: 100%;
          padding: 14px 16px;
          border: 1.5px solid #E8E8E0;
          border-radius: 12px;
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
        .form-input::placeholder { color: #BBB; }

        .password-wrapper { position: relative; }
        .password-toggle {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          color: #AAA;
          padding: 4px;
          line-height: 1;
          transition: color 0.2s;
        }
        .password-toggle:hover { color: #1A3A2A; }

        .forgot-link {
          text-align: right;
          margin-top: -12px;
          margin-bottom: 20px;
        }
        .forgot-link a {
          font-size: 13px;
          color: #1A3A2A;
          font-weight: 600;
          text-decoration: none;
        }
        .forgot-link a:hover { text-decoration: underline; }

        .error-box {
          background: #FEF2F2;
          border: 1px solid #FECACA;
          border-radius: 10px;
          padding: 12px 16px;
          margin-bottom: 20px;
          font-size: 14px;
          color: #DC2626;
        }

        .btn-submit {
          width: 100%;
          background: #1A3A2A;
          color: white;
          padding: 15px 36px;
          border-radius: 100px;
          font-size: 15px;
          font-weight: 700;
          border: none;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: all 0.2s;
          margin-top: 8px;
        }
        .btn-submit:hover {
          background: #0F2419;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(26,58,42,0.25);
        }
        .btn-submit:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 24px 0;
        }
        .divider-line {
          flex: 1;
          height: 1px;
          background: #E8E8E0;
        }
        .divider-text {
          font-size: 12px;
          color: #BBB;
          font-weight: 500;
        }

        .register-link {
          text-align: center;
          font-size: 14px;
          color: #888;
        }
        .register-link a {
          color: #1A3A2A;
          font-weight: 600;
          text-decoration: none;
        }
        .register-link a:hover { text-decoration: underline; }

        .back-home {
          display: block;
          text-align: center;
          margin-top: 16px;
          font-size: 13px;
          color: #BBB;
          text-decoration: none;
          transition: color 0.2s;
        }
        .back-home:hover { color: #888; }

        @media (max-width: 768px) {
          .login-left { display: none; }
          .login-right { padding: 32px 24px; }
        }
      `}</style>

      {/* LEFT PANEL */}
      <div className="login-left">
        <div className="login-logo">Pamoja<span>Plus</span></div>

        <div className="login-welcome">
          <div className="welcome-eyebrow">Welcome back</div>
          <h2 className="welcome-heading">Your group is waiting for you.</h2>
          <p className="welcome-body">
            Sign in to manage contributions, track members, and keep your welfare group running smoothly.
          </p>

          <div className="left-divider" />

          <div className="left-stats">
            <div className="stat-row">
              <div>
                <div className="stat-label">Trusted by</div>
                <div className="stat-value">2+ welfare groups</div>
              </div>
            </div>
            <div className="stat-row">
              <div>
                <div className="stat-label">Contributions tracked</div>
                <div className="stat-value">KES 18000+ and growing</div>
              </div>
            </div>
            <div className="stat-row">
              <div>
                <div className="stat-label">Security</div>
                <div className="stat-value">End-to-end encrypted data</div>
              </div>
            </div>
          </div>
        </div>

        <div className="login-testimonial">
          <div className="testimonial-text">
            "Pamoja Plus replaced our WhatsApp group and Excel sheets. Now every member can see their contribution history and the treasurer has full accountability."
          </div>
          <div className="testimonial-author">Nyikwa Charles Agolla</div>
          <div className="testimonial-role">Kotuoma Welfare Group, Nairobi</div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="login-right">
        <div className="login-form">
          <div className="form-header">
            <div className="form-step-label">Member login</div>
            <h1 className="form-title">Sign in to your account</h1>
            <p className="form-sub">Enter your credentials to access your group dashboard.</p>
          </div>

          {error && <div className="error-box">⚠ {error}</div>}

          <div className="form-group">
            <label className="form-label">Email address</label>
            <input
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              onKeyDown={handleKeyDown}
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <PasswordInput
              value={password}
              onChange={(val) => { setPassword(val); setError(""); }}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className="forgot-link">
            <a href="/forgot-password">Forgot your password?</a>
          </div>

          <button
            className="btn-submit"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in →"}
          </button>

          <div className="divider">
            <div className="divider-line" />
            <span className="divider-text">New to Pamoja Plus?</span>
            <div className="divider-line" />
          </div>

          <div className="register-link">
            <a href="/register">Register your welfare group</a>
          </div>

          <a href="/" className="back-home">← Back to home</a>
        </div>
      </div>
    </div>
  );
}

/* ── Password input with show/hide toggle ── */
function PasswordInput({
  value,
  onChange,
  onKeyDown,
}: {
  value: string;
  onChange: (val: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-wrapper">
      <input
        className="form-input"
        type={visible ? "text" : "password"}
        placeholder="Your password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="current-password"
        style={{ paddingRight: "48px" }}
      />
      <button
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? "🙈" : "👁️"}
      </button>
    </div>
  );
}