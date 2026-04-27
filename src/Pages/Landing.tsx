import { useEffect, useRef, useState } from "react";

const features = [
  {
    title: "Contribution Tracking",
    desc: "Record every M-Pesa payment with mpesaRef validation. No duplicates, no disputes.",
  },
  {
    title: "Pledge Management",
    desc: "Members commit before they pay. Track defaulters, reward consistent contributors.",
  },
  {
    title: "Cycles & Meetings",
    desc: "Monthly or quarterly contribution cycles. Schedule meetings, record minutes.",
  },
  {
    title: "Announcements",
    desc: "Keep members informed instantly. Post notices that reach everyone at once.",
  },
  {
    title: "Audit Logs",
    desc: "Every action recorded. Who approved what, and when. Full accountability.",
  },
  {
    title: "Multi-Group Support",
    desc: "One organization, many subgroups. Youth, Women, Elders — all in one place.",
  },
];

const steps = [
  { num: "01", title: "Register your group", desc: "Sign up your welfare organization in minutes." },
  { num: "02", title: "Invite members", desc: "Add members by phone or email. Roles auto-assigned." },
  { num: "03", title: "Start a cycle", desc: "Open a contribution cycle and track pledges." },
  { num: "04", title: "Verify payments", desc: "Treasurer confirms M-Pesa refs. Disputes end here." },
];

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible((prev) => new Set([...prev, e.target.id]));
          }
        });
      },
      { threshold: 0.15 }
    );
    document.querySelectorAll("[data-animate]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const isVisible = (id: string) => visible.has(id);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: "#FAFAF7", color: "#1A1A1A", overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .nav { position: fixed; top: 0; left: 0; right: 0; z-index: 100; padding: 20px 48px; display: flex; align-items: center; justify-content: space-between; transition: all 0.3s ease; }
        .nav.scrolled { background: rgba(250,250,247,0.95); backdrop-filter: blur(12px); box-shadow: 0 1px 0 rgba(0,0,0,0.08); padding: 14px 48px; }

        .logo { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 900; color: #1A1A1A; letter-spacing: -0.5px; }
        .logo span { color: #C8891A; }

        .nav-links { display: flex; gap: 32px; align-items: center; }
        .nav-links a { text-decoration: none; color: #444; font-size: 14px; font-weight: 500; transition: color 0.2s; }
        .nav-links a:hover { color: #1A1A1A; }

       .btn-primary { background: #1A3A2A; color: #FFFFFF; padding: 12px 28px; border-radius: 100px; font-size: 14px; font-weight: 700; text-decoration: none; border: none; cursor: pointer; transition: all 0.2s; display: inline-block; letter-spacing: 0.3px; }
.btn-primary:hover { background: #0F2419; transform: translateY(-1px); box-shadow: 0 8px 24px rgba(26,58,42,0.25); }

.btn-outline { background: transparent; color: #1A3A2A; padding: 12px 28px; border-radius: 100px; font-size: 14px; font-weight: 700; text-decoration: none; border: 2px solid #1A3A2A; cursor: pointer; transition: all 0.2s; display: inline-block; letter-spacing: 0.3px; }
.btn-outline:hover { background: #1A3A2A; color: #FFFFFF; }

        /* HERO */
        .hero { min-height: 100vh; display: flex; align-items: center; position: relative; padding: 120px 48px 80px; overflow: hidden; }

        .hero-bg { position: absolute; inset: 0; background: radial-gradient(ellipse 80% 60% at 60% 40%, rgba(200,137,26,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 80% at 20% 80%, rgba(26,58,42,0.06) 0%, transparent 50%); }

        .hero-pattern { position: absolute; right: -100px; top: 50%; transform: translateY(-50%); width: 600px; height: 600px; opacity: 0.04; background-image: repeating-linear-gradient(45deg, #1A3A2A 0, #1A3A2A 1px, transparent 0, transparent 50%); background-size: 20px 20px; border-radius: 50%; }

        .hero-content { position: relative; max-width: 680px; }

        .hero-badge { display: inline-flex; align-items: center; gap: 8px; background: #F5E6C8; color: #7A4F0A; padding: 8px 16px; border-radius: 100px; font-size: 13px; font-weight: 600; margin-bottom: 32px; }
        .hero-badge-dot { width: 8px; height: 8px; background: #C8891A; border-radius: 50%; animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

        .hero h1 { font-family: 'Playfair Display', serif; font-size: clamp(48px, 6vw, 80px); font-weight: 900; line-height: 1.05; letter-spacing: -2px; margin-bottom: 24px; }
        .hero h1 em { font-style: normal; color: #C8891A; position: relative; }
        .hero h1 em::after { content: ''; position: absolute; bottom: 4px; left: 0; right: 0; height: 3px; background: #C8891A; opacity: 0.3; border-radius: 2px; }

        .hero-sub { font-size: 18px; line-height: 1.7; color: #555; max-width: 520px; margin-bottom: 40px; font-weight: 300; }

        .hero-actions { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }

        .hero-stat { display: flex; gap: 40px; margin-top: 64px; padding-top: 40px; border-top: 1px solid rgba(0,0,0,0.08); }
        .stat-item { }
        .stat-num { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 700; color: #1A3A2A; }
        .stat-label { font-size: 13px; color: #888; margin-top: 2px; }

        /* FLOATING CARD */
        .hero-card { position: absolute; right: 80px; top: 50%; transform: translateY(-45%); width: 320px; background: white; border-radius: 20px; padding: 28px; box-shadow: 0 24px 80px rgba(0,0,0,0.12); border: 1px solid rgba(0,0,0,0.05); }
        .card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
        .card-title { font-size: 13px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 1px; }
        .card-badge { background: #EDFAF2; color: #16A34A; padding: 4px 10px; border-radius: 100px; font-size: 12px; font-weight: 600; }
        .card-amount { font-family: 'Playfair Display', serif; font-size: 40px; font-weight: 700; color: #1A3A2A; margin-bottom: 4px; }
        .card-sub { font-size: 13px; color: #888; margin-bottom: 24px; }
        .card-members { display: flex; flex-direction: column; gap: 12px; }
        .member-row { display: flex; align-items: center; justify-content: space-between; }
        .member-info { display: flex; align-items: center; gap: 10px; }
        .member-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: white; }
        .member-name { font-size: 14px; font-weight: 500; }
        .member-status { font-size: 12px; padding: 3px 10px; border-radius: 100px; font-weight: 600; }
        .status-verified { background: #EDFAF2; color: #16A34A; }
        .status-pending { background: #FEF9EC; color: #B45309; }

        /* SECTIONS */
        .section { padding: 100px 48px; max-width: 1200px; margin: 0 auto; }

        .section-label { font-size: 12px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; color: #C8891A; margin-bottom: 16px; }
        .section-title { font-family: 'Playfair Display', serif; font-size: clamp(32px, 4vw, 52px); font-weight: 700; line-height: 1.1; letter-spacing: -1px; margin-bottom: 20px; }
        .section-sub { font-size: 17px; color: #666; line-height: 1.7; max-width: 560px; font-weight: 300; }

        /* FEATURES */
        .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; margin-top: 64px; background: #E8E8E0; border-radius: 20px; overflow: hidden; }
        .feature-card { background: #FAFAF7; padding: 40px 36px; transition: background 0.3s; }
        .feature-card:hover { background: white; }
        .feature-icon { font-size: 32px; margin-bottom: 20px; }
        .feature-title { font-size: 17px; font-weight: 600; margin-bottom: 10px; color: #1A1A1A; }
        .feature-desc { font-size: 14px; color: #666; line-height: 1.7; font-weight: 300; }

        /* HOW IT WORKS */
        .how-bg { background: #1A3A2A; padding: 100px 48px; }
        .how-inner { max-width: 1200px; margin: 0 auto; }
        .how-bg .section-label { color: #C8891A; }
        .how-bg .section-title { color: #F5E6C8; }
        .how-bg .section-sub { color: rgba(245,230,200,0.6); }

        .steps-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 48px; margin-top: 64px; }
        .step { }
        .step-num { font-family: 'Playfair Display', serif; font-size: 56px; font-weight: 900; color: rgba(200,137,26,0.25); line-height: 1; margin-bottom: 20px; }
        .step-title { font-size: 17px; font-weight: 600; color: #F5E6C8; margin-bottom: 10px; }
        .step-desc { font-size: 14px; color: rgba(245,230,200,0.55); line-height: 1.7; font-weight: 300; }

        /* PRICING */
        .pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 64px; }
        .pricing-card { background: white; border: 1px solid #E8E8E0; border-radius: 20px; padding: 40px 36px; transition: all 0.3s; }
        .pricing-card:hover { box-shadow: 0 16px 48px rgba(0,0,0,0.08); transform: translateY(-4px); }
        .pricing-card.featured { background: #1A3A2A; border-color: #1A3A2A; }
        .pricing-plan { font-size: 13px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #888; margin-bottom: 16px; }
        .pricing-card.featured .pricing-plan { color: rgba(200,137,26,0.8); }
        .pricing-price { font-family: 'Playfair Display', serif; font-size: 48px; font-weight: 700; color: #1A1A1A; line-height: 1; margin-bottom: 4px; }
        .pricing-card.featured .pricing-price { color: #F5E6C8; }
        .pricing-period { font-size: 14px; color: #888; margin-bottom: 32px; }
        .pricing-card.featured .pricing-period { color: rgba(245,230,200,0.5); }
        .pricing-features { list-style: none; display: flex; flex-direction: column; gap: 14px; margin-bottom: 36px; }
        .pricing-features li { font-size: 14px; color: #555; display: flex; align-items: center; gap: 10px; }
        .pricing-card.featured .pricing-features li { color: rgba(245,230,200,0.7); }
        .pricing-features li::before { content: '✓'; color: #C8891A; font-weight: 700; flex-shrink: 0; }

        /* CTA */
        .cta-section { background: #F5E6C8; padding: 100px 48px; text-align: center; }
        .cta-inner { max-width: 640px; margin: 0 auto; }
        .cta-inner .section-title { color: #1A1A1A; }
        .cta-inner p { font-size: 17px; color: #7A5C1A; margin: 20px 0 40px; font-weight: 300; line-height: 1.7; }

        /* FOOTER */
        .footer { background: #111; padding: 48px; display: flex; align-items: center; justify-content: space-between; }
        .footer-logo { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 900; color: white; }
        .footer-logo span { color: #C8891A; }
        .footer-copy { font-size: 13px; color: #555; }
        .footer-links { display: flex; gap: 24px; }
        .footer-links a { color: #555; text-decoration: none; font-size: 13px; transition: color 0.2s; }
        .footer-links a:hover { color: white; }

        /* ANIMATIONS */
        [data-animate] { opacity: 0; transform: translateY(32px); transition: opacity 0.7s ease, transform 0.7s ease; }
        [data-animate].visible { opacity: 1; transform: translateY(0); }
        [data-animate][data-delay="1"] { transition-delay: 0.1s; }
        [data-animate][data-delay="2"] { transition-delay: 0.2s; }
        [data-animate][data-delay="3"] { transition-delay: 0.3s; }
        [data-animate][data-delay="4"] { transition-delay: 0.4s; }
        [data-animate][data-delay="5"] { transition-delay: 0.5s; }
        [data-animate][data-delay="6"] { transition-delay: 0.6s; }

        @media (max-width: 1024px) {
          .hero-card { display: none; }
          .features-grid { grid-template-columns: repeat(2, 1fr); }
          .steps-grid { grid-template-columns: repeat(2, 1fr); }
          .pricing-grid { grid-template-columns: 1fr; max-width: 420px; }
        }

        @media (max-width: 768px) {
          .nav { padding: 16px 24px; }
          .nav.scrolled { padding: 12px 24px; }
          .nav-links { display: none; }
          .hero { padding: 100px 24px 60px; }
          .section { padding: 64px 24px; }
          .features-grid { grid-template-columns: 1fr; }
          .steps-grid { grid-template-columns: 1fr; }
          .how-bg { padding: 64px 24px; }
          .footer { flex-direction: column; gap: 24px; text-align: center; padding: 40px 24px; }
        }
      `}</style>

      {/* NAVBAR */}
      <nav className={`nav ${scrolled ? "scrolled" : ""}`}>
        <div className="logo">Pamoja<span>Plus</span></div>
        <div className="nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="/login" className="btn-outline">Login</a>
          <a href="/register" className="btn-primary">Register Group</a>
        </div>
      </nav>

      {/* HERO */}
      <section className="hero" ref={heroRef}>
        <div className="hero-bg" />
        <div className="hero-pattern" />
        <div className="hero-content">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Built for Kenyan welfare groups
          </div>
          <h1>
            Your chama,<br />
            <em>managed</em><br />
            digitally.
          </h1>
          <p className="hero-sub">
            Pamoja Plus replaces WhatsApp tracking with a real system. 
            Contributions, pledges, cycles, and accountability — all in one place.
          </p>
          <div className="hero-actions">
            <a href="/register" className="btn-primary">Register your group →</a>
            <a href="#how" className="btn-outline">See how it works</a>
          </div>
          <div className="hero-stat">
            <div className="stat-item">
              <div className="stat-num">10+</div>
              <div className="stat-label">Collections tracked</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">KES 0</div>
              <div className="stat-label">To get started</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">100%</div>
              <div className="stat-label">Audit trail</div>
            </div>
          </div>
        </div>

        {/* Floating card */}
        <div className="hero-card">
          <div className="card-header">
            <span className="card-title">January Cycle</span>
            <span className="card-badge">Active</span>
          </div>
          <div className="card-amount">KES 48,500</div>
          <div className="card-sub">collected of KES 60,000 target</div>
          <div className="card-members">
            {[
              { name: "Nyikwa Charles", color: "#1A3A2A", status: "verified" },
              { name: "Auntie Topa", color: "#C8891A", status: "verified" },
              { name: "Brenda K.", color: "#7A4F0A", status: "pending" },
              { name: "Calmax Bro", color: "#2D6A4F", status: "pending" },
            ].map((m) => (
              <div className="member-row" key={m.name}>
                <div className="member-info">
                  <div className="member-avatar" style={{ background: m.color }}>
                    {m.name[0]}
                  </div>
                  <span className="member-name">{m.name}</span>
                </div>
                <span className={`member-status ${m.status === "verified" ? "status-verified" : "status-pending"}`}>
                  {m.status === "verified" ? "✓ Paid" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section" id="features">
        <div id="feat-label" data-animate className={isVisible("feat-label") ? "visible" : ""}>
          <div className="section-label">Features</div>
          <h2 className="section-title">Everything your group needs.<br />Nothing it doesn't.</h2>
          <p className="section-sub">
            Stop chasing members on WhatsApp. Pamoja Plus gives every welfare group 
            the tools to run transparently and efficiently.
          </p>
        </div>
        <div className="features-grid">
          {features.map((f, i) => (
            <div
              key={f.title}
              id={`feat-${i}`}
              data-animate
              data-delay={String(i % 3 + 1)}
              className={`feature-card ${isVisible(`feat-${i}`) ? "visible" : ""}`}
            >
              <div className="feature-title">{f.title}</div>
              <div className="feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <div className="how-bg" id="how">
        <div className="how-inner">
          <div id="how-label" data-animate className={isVisible("how-label") ? "visible" : ""}>
            <div className="section-label">How it works</div>
            <h2 className="section-title" style={{ color: "#F5E6C8" }}>Up and running<br />in four steps.</h2>
            <p className="section-sub">
              No technical knowledge required. If you can use WhatsApp, you can use Pamoja Plus.
            </p>
          </div>
          <div className="steps-grid">
            {steps.map((s, i) => (
              <div
                key={s.num}
                id={`step-${i}`}
                data-animate
                data-delay={String(i + 1)}
                className={`step ${isVisible(`step-${i}`) ? "visible" : ""}`}
              >
                <div className="step-num">{s.num}</div>
                <div className="step-title">{s.title}</div>
                <div className="step-desc">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* PRICING */}
      <section className="section" id="pricing">
        <div id="price-label" data-animate className={isVisible("price-label") ? "visible" : ""}>
          <div className="section-label">Pricing</div>
          <h2 className="section-title">Simple, fair pricing.<br />Pay as you grow.</h2>
          <p className="section-sub">
            No hidden charges. Cancel anytime. M-Pesa payments accepted.
          </p>
        </div>
        <div className="pricing-grid">
          {[
            {
              plan: "Starter", price: "Free", period: "forever",
              features: ["Up to 20 members", "1 group", "Basic contributions", "Announcements"],
              featured: false,
            },
            {
              plan: "Pro", price: "KES 2,000", period: "per month",
              features: ["Unlimited members", "Multiple groups", "Pledge tracking", "Audit logs", "Priority support"],
              featured: true,
            },
            {
              plan: "Enterprise", price: "Custom", period: "contact us",
              features: ["Custom branding", "M-Pesa automation", "API access", "Dedicated support"],
              featured: false,
            },
          ].map((p, i) => (
            <div
              key={p.plan}
              id={`price-${i}`}
              data-animate
              data-delay={String(i + 1)}
              className={`pricing-card ${p.featured ? "featured" : ""} ${isVisible(`price-${i}`) ? "visible" : ""}`}
            >
              <div className="pricing-plan">{p.plan}</div>
              <div className="pricing-price">{p.price}</div>
              <div className="pricing-period">{p.period}</div>
              <ul className="pricing-features">
                {p.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <a
                href="/register"
                className={p.featured ? "btn-primary" : "btn-outline"}
                style={{ width: "100%", textAlign: "center" }}
              >
                Get started
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="cta-section">
        <div
          className="cta-inner"
          id="cta"
          data-animate
          style={isVisible("cta") ? { opacity: 1, transform: "translateY(0)" } : {}}
        >
          <div className="section-label">Get started today</div>
          <h2 className="section-title">Your group deserves better than WhatsApp.</h2>
          <p>
            Join welfare groups across Kenya who have moved from manual tracking 
            to full digital accountability with Pamoja Plus.
          </p>
          <a href="/register" className="btn-primary" style={{ fontSize: "16px", padding: "16px 40px" }}>
            Register your group free →
          </a>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer-logo">Pamoja<span>Plus</span></div>
        <div className="footer-copy">© 2026 Pamoja Plus. Built in Nairobi 🇰🇪</div>
        <div className="footer-links">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Contact</a>
        </div>
      </footer>
    </div>
  );
}