import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: scrolled ? "14px 48px" : "20px 48px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      transition: "all 0.3s ease",
      background: scrolled ? "rgba(250,250,247,0.95)" : "transparent",
      backdropFilter: scrolled ? "blur(12px)" : "none",
      boxShadow: scrolled ? "0 1px 0 rgba(0,0,0,0.08)" : "none",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600&display=swap');
        .nav-logo { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 900; color: #1A1A1A; text-decoration: none; letter-spacing: -0.5px; }
        .nav-logo span { color: #C8891A; }
        .nav-link { text-decoration: none; color: #444; font-size: 14px; font-weight: 500; transition: color 0.2s; }
        .nav-link:hover { color: #1A1A1A; }
        .nav-btn-outline { background: transparent; color: #1A3A2A; padding: 10px 24px; border-radius: 100px; font-size: 14px; font-weight: 700; text-decoration: none; border: 2px solid #1A3A2A; transition: all 0.2s; }
        .nav-btn-outline:hover { background: #1A3A2A; color: white; }
        .nav-btn-primary { background: #1A3A2A; color: white; padding: 10px 24px; border-radius: 100px; font-size: 14px; font-weight: 700; text-decoration: none; border: none; transition: all 0.2s; }
        .nav-btn-primary:hover { background: #0F2419; box-shadow: 0 6px 20px rgba(26,58,42,0.25); }
        @media (max-width: 768px) { .nav-links { display: none; } }
      `}</style>

      {/* Logo */}
      <Link to="/" className="nav-logo">Pamoja<span>Plus</span></Link>

      {/* Links */}
      <div className="nav-links" style={{ display: "flex", gap: 32, alignItems: "center" }}>
        <a href="#features" className="nav-link">Features</a>
        <a href="#how" className="nav-link">How it works</a>
        <a href="#pricing" className="nav-link">Pricing</a>
        <Link to="/login" className="nav-btn-outline">Login</Link>
        <Link to="/register" className="nav-btn-primary">Register Group</Link>
      </div>
    </nav>
  );
}