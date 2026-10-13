import React from 'react';
import ReactDOM from 'react-dom/client';
// Inter and DM Sans are served by the site itself, so visitors' browsers
// never contact Google Fonts.
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import '@fontsource/dm-sans/800.css';
import App from './App';

// If a screen crashes, show a friendly message with a way out instead of a
// blank white page.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error("NRIClub crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    const font = "'DM Sans', sans-serif";
    return (
      <div role="alert" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 16px", background: "#FAFAF8", fontFamily: font, boxSizing: "border-box" }}>
        <div style={{ maxWidth: 380, width: "100%", textAlign: "center" }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#37352F", margin: "0 0 8px" }}>Something went wrong</h2>
          <p style={{ fontSize: 14, color: "#6B6A67", lineHeight: 1.6, margin: "0 0 24px" }}>
            Sorry, this page ran into a problem. Reloading usually fixes it. If it keeps happening, write to <a href="mailto:support@nriclub.app" style={{ color: "#37352F", fontWeight: 600 }}>support@nriclub.app</a>.
          </p>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: "12px 28px", borderRadius: 8, border: "none", background: "#37352F", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font }}>
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
