import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer style={{
      background: "#111",
      padding: "48px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: 24,
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;600&display=swap');
        .footer-logo { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 900; color: white; text-decoration: none; }
        .footer-logo span { color: #C8891A; }
        .footer-link { color: #555; text-decoration: none; font-size: 13px; transition: color 0.2s; }
        .footer-link:hover { color: white; }
      `}</style>

      {/* Logo */}
      <Link to="/" className="footer-logo">Pamoja<span>Plus</span></Link>

      {/* Copy */}
      <div style={{ fontSize: 13, color: "#555" }}>
        © {new Date().getFullYear()} Pamoja Plus. Built in Nairobi 🇰🇪
      </div>

      {/* Links */}
      <div style={{ display: "flex", gap: 24 }}>
        <a href="#" className="footer-link">Privacy</a>
        <a href="#" className="footer-link">Terms</a>
        <Link to="/register" className="footer-link">Get Started</Link>
      </div>
    </footer>
  );
}