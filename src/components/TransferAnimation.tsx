// ── TransferAnimation ──────────────────────────────────────────────────────────
// Beautiful full-screen overlay showing a courier carrying coins from one
// wallet to the other.  When blocked, a firewall wall rises and the courier
// bounces back.
//
// Props:
//   state:    'idle' | 'sending' | 'success' | 'blocked'
//   from:     sender display name
//   to:       recipient display name
//   amount:   e.g. "50.00"
//   currency: e.g. "GYD"
//   reason:   block reason (only shown in 'blocked' state)

import { useEffect, useState } from "react";

export type TransferState = "idle" | "sending" | "success" | "blocked";

interface Props {
  state: TransferState;
  from?: string;
  to?: string;
  amount?: string;
  currency?: string;
  reason?: string;
}

// ── Styles injected once ──────────────────────────────────────────────────────
const CSS = `
@keyframes ta-walk {
  0%   { transform: translateX(0);   }
  100% { transform: translateX(var(--ta-travel)); }
}
@keyframes ta-bounce {
  0%   { transform: translateX(var(--ta-half)) scaleX(1);   }
  40%  { transform: translateX(var(--ta-half)) scaleX(-1);  }
  70%  { transform: translateX(calc(var(--ta-half) - 60px)) scaleX(-1); }
  100% { transform: translateX(0) scaleX(-1);  }
}
@keyframes ta-wall-rise {
  0%   { transform: scaleY(0); opacity: 0; }
  60%  { transform: scaleY(1.1); opacity: 1; }
  100% { transform: scaleY(1); opacity: 1; }
}
@keyframes ta-coin-float {
  0%   { transform: translateY(0) scale(1); opacity:1; }
  100% { transform: translateY(-40px) scale(0.5); opacity:0; }
}
@keyframes ta-success-ring {
  0%   { transform: scale(0.5); opacity:1; }
  100% { transform: scale(2.5); opacity:0; }
}
@keyframes ta-success-bounce {
  0%,100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
}
@keyframes ta-pulse-glow {
  0%,100% { box-shadow: 0 0 12px 2px rgba(var(--ta-gold),0.4); }
  50%      { box-shadow: 0 0 28px 8px rgba(var(--ta-gold),0.8); }
}
@keyframes ta-shake {
  0%,100% { transform: translateX(0); }
  20%      { transform: translateX(-6px) rotate(-3deg); }
  40%      { transform: translateX(6px) rotate(3deg); }
  60%      { transform: translateX(-4px); }
  80%      { transform: translateX(4px); }
}
@keyframes ta-overlay-in {
  from { opacity:0; backdrop-filter:blur(0); }
  to   { opacity:1; backdrop-filter:blur(8px); }
}
@keyframes ta-leg {
  0%,100% { transform: rotate(-20deg); }
  50%      { transform: rotate(20deg); }
}
@keyframes ta-arm {
  0%,100% { transform: rotate(10deg); }
  50%      { transform: rotate(-10deg); }
}
@keyframes ta-sparkle {
  0%   { transform: scale(0) rotate(0deg); opacity:1; }
  100% { transform: scale(1.5) rotate(180deg); opacity:0; }
}
@keyframes ta-brick-shake {
  0%,100% { transform: translateX(0); }
  25%      { transform: translateX(3px); }
  75%      { transform: translateX(-3px); }
}
.ta-courier {
  --ta-travel: 0px;
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.ta-courier.ta-walking {
  animation: ta-walk 1.8s cubic-bezier(0.4,0,0.6,1) forwards;
}
.ta-courier.ta-bouncing {
  animation: ta-bounce 1.4s cubic-bezier(0.4,0,0.2,1) forwards;
}
.ta-leg-l { animation: ta-leg 0.35s linear infinite alternate; transform-origin: top center; }
.ta-leg-r { animation: ta-leg 0.35s linear infinite alternate-reverse; transform-origin: top center; }
.ta-arm-l { animation: ta-arm 0.35s linear infinite alternate; transform-origin: top center; }
.ta-arm-r { animation: ta-arm 0.35s linear infinite alternate-reverse; transform-origin: top center; }
.ta-wall { transform-origin: bottom center; animation: ta-wall-rise 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards; }
.ta-wall-shake { animation: ta-brick-shake 0.1s linear infinite; }
`;

let cssInjected = false;
function injectCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const el = document.createElement("style");
  el.textContent = CSS;
  document.head.appendChild(el);
}

// ── SVG Courier Character ─────────────────────────────────────────────────────
function Courier({ color = "#F59E0B", size = 64 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size * 1.5} viewBox="0 0 40 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Head */}
      <circle cx="20" cy="8" r="7" fill={color} />
      {/* Hat */}
      <rect x="12" y="2" width="16" height="3" rx="1.5" fill="#1E3A5F" />
      <rect x="14" y="0" width="12" height="3" rx="1.5" fill="#1E3A5F" />
      {/* Body */}
      <rect x="14" y="15" width="12" height="14" rx="3" fill="#1E3A5F" />
      {/* Belt */}
      <rect x="14" y="25" width="12" height="2" fill="#F59E0B" />
      {/* Left arm */}
      <g className="ta-arm-l">
        <rect x="7" y="16" width="7" height="3" rx="1.5" fill={color} />
      </g>
      {/* Right arm — holds bag */}
      <g className="ta-arm-r">
        <rect x="26" y="16" width="7" height="3" rx="1.5" fill={color} />
        {/* Coin bag */}
        <circle cx="35" cy="17" r="5" fill="#F59E0B" stroke="#D97706" strokeWidth="1" />
        <text x="35" y="20" textAnchor="middle" fontSize="6" fill="#92400E">$</text>
      </g>
      {/* Left leg */}
      <g className="ta-leg-l">
        <rect x="14" y="29" width="5" height="14" rx="2.5" fill={color} />
        <rect x="12" y="41" width="7" height="3" rx="1.5" fill="#1E3A5F" />
      </g>
      {/* Right leg */}
      <g className="ta-leg-r">
        <rect x="21" y="29" width="5" height="14" rx="2.5" fill={color} />
        <rect x="21" y="41" width="7" height="3" rx="1.5" fill="#1E3A5F" />
      </g>
    </svg>
  );
}

// ── SVG Wallet Icon ───────────────────────────────────────────────────────────
function WalletIcon({ label, gold = false }: { label: string; gold?: boolean }) {
  const c = gold ? "#F59E0B" : "#3B82F6";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
        <rect x="4" y="14" width="48" height="32" rx="6" fill={c} opacity="0.15" stroke={c} strokeWidth="2" />
        <rect x="4" y="20" width="48" height="6" fill={c} opacity="0.3" />
        <rect x="36" y="26" width="12" height="8" rx="3" fill={c} />
        <circle cx="42" cy="30" r="2" fill="white" />
      </svg>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", maxWidth: 72, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
    </div>
  );
}

// ── Firewall Wall ─────────────────────────────────────────────────────────────
function FirewallWall({ shake }: { shake: boolean }) {
  const brickRows = 5;
  const brickCols = 4;
  const colors = ["#DC2626", "#B91C1C", "#EF4444", "#991B1B"];

  return (
    <div className={shake ? "ta-wall ta-wall-shake" : "ta-wall"} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Shield icon on top */}
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 28 }}>🛡️</span>
      </div>
      {/* Brick wall */}
      {Array.from({ length: brickRows }).map((_, row) => (
        <div key={row} style={{ display: "flex", gap: 2, transform: row % 2 === 0 ? "translateX(0)" : "translateX(8px)" }}>
          {Array.from({ length: brickCols }).map((_, col) => (
            <div key={col} style={{
              width: 28, height: 14,
              borderRadius: 2,
              backgroundColor: colors[(row + col) % colors.length],
              boxShadow: "inset 0 2px 3px rgba(0,0,0,0.3)",
            }} />
          ))}
        </div>
      ))}
      <div style={{ textAlign: "center", marginTop: 4, fontSize: 10, fontWeight: 700, color: "#DC2626", letterSpacing: "0.1em" }}>
        BLOCKED
      </div>
    </div>
  );
}

// ── Sparkles ──────────────────────────────────────────────────────────────────
function Sparkles() {
  const sparks = ["✨", "⭐", "💛", "🌟", "✨"];
  return (
    <div style={{ position: "absolute", top: -20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 8 }}>
      {sparks.map((s, i) => (
        <span key={i} className="ta-sparkle" style={{
          fontSize: 20,
          animation: `ta-sparkle 0.6s ${i * 0.1}s ease-out forwards`,
          display: "inline-block",
        }}>
          {s}
        </span>
      ))}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function TransferAnimation({ state, from = "You", to = "Recipient", amount = "0", currency = "GYD", reason }: Props) {
  injectCSS();
  const [phase, setPhase] = useState<"enter" | "walking" | "impact" | "done">("enter");
  const [wallShake, setWallShake] = useState(false);

  useEffect(() => {
    if (state === "sending") {
      setPhase("enter");
      const t = setTimeout(() => setPhase("walking"), 100);
      return () => clearTimeout(t);
    }
    if (state === "blocked") {
      setPhase("walking");
      const t1 = setTimeout(() => { setPhase("impact"); setWallShake(true); }, 900);
      const t2 = setTimeout(() => setWallShake(false), 1500);
      const t3 = setTimeout(() => setPhase("done"), 2200);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    if (state === "success") {
      setPhase("walking");
      const t = setTimeout(() => setPhase("done"), 2000);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (state === "idle") return null;

  const containerStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(10, 16, 30, 0.88)",
    animation: "ta-overlay-in 0.3s ease forwards",
    backdropFilter: "blur(8px)",
    padding: "24px",
  };

  const stageStyle: React.CSSProperties = {
    position: "relative",
    width: "100%",
    maxWidth: 420,
    height: 160,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };

  const isSending  = state === "sending";
  const isSuccess  = state === "success";
  const isBlocked  = state === "blocked";
  const isWalking  = phase === "walking";
  const isBouncing = isBlocked && (phase === "impact" || phase === "done");

  // Courier x travel (from left wallet edge to right wallet edge minus courier width)
  const travelPx = isBlocked ? 140 : 260;
  const halfPx   = 140;

  return (
    <div style={containerStyle}>
      {/* Amount badge */}
      <div style={{
        background: "linear-gradient(135deg, #F59E0B, #D97706)",
        borderRadius: 999,
        padding: "8px 24px",
        marginBottom: 28,
        fontSize: 22,
        fontWeight: 800,
        color: "white",
        letterSpacing: "0.02em",
        boxShadow: "0 4px 24px rgba(245,158,11,0.4)",
        animation: "ta-pulse-glow 2s ease-in-out infinite",
      }}>
        {currency} {parseFloat(amount).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
      </div>

      {/* Stage */}
      <div style={stageStyle}>
        {/* Sender wallet */}
        <WalletIcon label={from} gold />

        {/* Track line */}
        <div style={{
          position: "absolute", left: 70, right: 70, top: "50%",
          height: 2,
          background: isBlocked
            ? "linear-gradient(90deg, #F59E0B 50%, rgba(220,38,38,0.3) 50%)"
            : "linear-gradient(90deg, #F59E0B, #3B82F6)",
          borderRadius: 1,
        }} />

        {/* Firewall wall (blocked state) */}
        {isBlocked && (
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", zIndex: 10 }}>
            <FirewallWall shake={wallShake} />
          </div>
        )}

        {/* Courier */}
        <div style={{ position: "absolute", left: 64, top: "50%", transform: "translateY(-50%)", zIndex: 20 }}>
          <div
            className={`ta-courier ${isWalking && !isBouncing ? "ta-walking" : ""} ${isBouncing ? "ta-bouncing" : ""}`}
            style={{ "--ta-travel": `${travelPx}px`, "--ta-half": `${halfPx}px` } as React.CSSProperties}
          >
            <Courier color={isBlocked && phase !== "enter" ? "#EF4444" : "#F59E0B"} size={48} />
            {/* Floating coins while walking */}
            {isWalking && !isBouncing && (
              <div style={{ position: "absolute", top: -10, right: -10, fontSize: 14 }}>
                {["💰", "💛", "💰"].map((c, i) => (
                  <span key={i} style={{
                    position: "absolute",
                    right: i * 12,
                    top: -i * 8,
                    animation: `ta-coin-float 0.7s ${i * 0.2}s ease-out infinite`,
                    display: "inline-block",
                  }}>{c}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Success sparkles */}
        {isSuccess && phase === "done" && (
          <div style={{ position: "absolute", right: 56, top: "30%", zIndex: 30 }}>
            <Sparkles />
          </div>
        )}

        {/* Receiver wallet */}
        <WalletIcon label={to} />
      </div>

      {/* Status message */}
      <div style={{ marginTop: 28, textAlign: "center" }}>
        {isSending && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "white", marginBottom: 6 }}>
              Sending your money…
            </div>
            <div style={{ fontSize: 13, color: "#94A3B8" }}>
              Courier is on the way from <strong style={{ color: "#F59E0B" }}>{from}</strong> to <strong style={{ color: "#3B82F6" }}>{to}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: 8, height: 8, borderRadius: "50%", background: "#F59E0B",
                  animation: `ta-coin-float 0.8s ${i * 0.2}s ease-in-out infinite alternate`,
                }} />
              ))}
            </div>
          </div>
        )}

        {isSuccess && (
          <div style={{ animation: "ta-success-bounce 0.6s ease-in-out" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#22C55E", marginBottom: 4 }}>
              Delivered!
            </div>
            <div style={{ fontSize: 13, color: "#94A3B8" }}>
              <strong style={{ color: "#22C55E" }}>{to}</strong> received your payment
            </div>
          </div>
        )}

        {isBlocked && (
          <div style={{ animation: "ta-shake 0.5s ease-in-out" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🚫</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#EF4444", marginBottom: 6 }}>
              Transfer Blocked
            </div>
            {reason && (
              <div style={{
                fontSize: 13, color: "#FCA5A5",
                background: "rgba(220,38,38,0.12)",
                borderRadius: 10,
                padding: "8px 16px",
                maxWidth: 340,
                border: "1px solid rgba(220,38,38,0.3)",
              }}>
                {reason}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
