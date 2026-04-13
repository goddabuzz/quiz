import { useState, useEffect, useCallback, useRef, useMemo } from "react";

const CATEGORIES = {
  landen: { label:"Landen", emoji:"\u{1F3D4}\uFE0F", color:"#2D6A4F", items:[
    {letter:"A",name:"Groenland",lat:69,lon:-37},
    {letter:"B",name:"IJsland",lat:65,lon:-18},
    {letter:"C",name:"Noorwegen",lat:64.5,lon:12},
    {letter:"D",name:"Zweden",lat:63,lon:16},
    {letter:"E",name:"Finland",lat:64,lon:26},
    {letter:"F",name:"Denemarken",lat:56,lon:10},
    {letter:"G",name:"Estland",lat:58.8,lon:25.5},
    {letter:"H",name:"Letland",lat:57,lon:25},
    {letter:"I",name:"Litouwen",lat:55.5,lon:24},
    {letter:"J",name:"Polen",lat:52,lon:20},
  ]},
  steden: { label:"Steden", emoji:"\u{1F3F0}", color:"#9B2226", items:[
    {letter:"1",name:"Reykjavik",lat:64.15,lon:-21.95},
    {letter:"2",name:"Oslo",lat:59.91,lon:10.75},
    {letter:"3",name:"Stockholm",lat:59.33,lon:18.07},
    {letter:"4",name:"Helsinki",lat:60.17,lon:24.94},
    {letter:"5",name:"Kopenhagen",lat:55.68,lon:12.57},
    {letter:"6",name:"Warschau",lat:52.23,lon:21.01},
  ]},
  zeeen: { label:"Zee\u00ebn", emoji:"\u{1F30A}", color:"#005F73", items:[
    {letter:"a",name:"Atlantische Oceaan",lat:58,lon:-20},
    {letter:"b",name:"Noordzee",lat:57,lon:3},
    {letter:"c",name:"Oostzee",lat:58,lon:19},
  ]},
};

const ALL = [...CATEGORIES.landen.items,...CATEGORIES.steden.items,...CATEGORIES.zeeen.items];
const MODES = {
  nameToMap:{label:"Vind op de kaart",emoji:"\u{1F4CD}",desc:"Tik op de juiste plek"},
  mapToName:{label:"Benoem de plek",emoji:"\u{1F3F7}\uFE0F",desc:"Kies de juiste naam"},
};

const LB_KEY = "quiz_leaderboard";
function loadLeaderboard() {
  try { return JSON.parse(localStorage.getItem(LB_KEY) || "[]"); } catch { return []; }
}
function saveLeaderboard(lb) {
  localStorage.setItem(LB_KEY, JSON.stringify(lb.slice(0, 50)));
}
function addToLeaderboard(name, score, total, category, mode) {
  const lb = loadLeaderboard();
  lb.push({ name, score, total, pct: total > 0 ? Math.round((score / total) * 100) : 0, category, mode, date: Date.now() });
  lb.sort((a, b) => b.pct - a.pct || b.score - a.score || a.date - b.date);
  saveLeaderboard(lb);
  return lb;
}

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function MapView({ items, ps, onPin, hl, fb, gm }) {
  const W = 900, H = 500;
  const zoom = 4;
  const centerLat = 63, centerLon = -5;

  const latLonToPixel = useCallback((lat, lon) => {
    const n = Math.pow(2, zoom);
    const x = ((lon + 180) / 360) * n * 256;
    const latRad = lat * Math.PI / 180;
    const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n * 256;
    return { x, y };
  }, [zoom]);

  const center = latLonToPixel(centerLat, centerLon);
  const offsetX = center.x - W / 2;
  const offsetY = center.y - H / 2;

  const tileStartX = Math.floor(offsetX / 256);
  const tileEndX = Math.ceil((offsetX + W) / 256);
  const tileStartY = Math.floor(offsetY / 256);
  const tileEndY = Math.ceil((offsetY + H) / 256);
  const n = Math.pow(2, zoom);

  const tiles = [];
  for (let tx = tileStartX; tx < tileEndX; tx++) {
    for (let ty = tileStartY; ty < tileEndY; ty++) {
      if (ty < 0 || ty >= n) continue;
      const wrappedTx = ((tx % n) + n) % n;
      tiles.push({ tx: wrappedTx, ty, left: tx * 256 - offsetX, top: ty * 256 - offsetY });
    }
  }

  const pinPosition = useCallback((lat, lon) => {
    const p = latLonToPixel(lat, lon);
    return { x: p.x - offsetX, y: p.y - offsetY };
  }, [latLonToPixel, offsetX, offsetY]);

  const containerRef = useRef(null);
  const [baseScale, setBaseScale] = useState(1);

  // Pan & zoom state
  const [userZoom, setUserZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const gestureRef = useRef({ startDist: 0, startZoom: 1, startPan: { x: 0, y: 0 }, startMid: { x: 0, y: 0 }, isPinching: false, lastTap: 0 });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startPan: { x: 0, y: 0 } });

  const clampPan = useCallback((px, py, z) => {
    const maxPanX = Math.max(0, (W * z - W) / 2);
    const maxPanY = Math.max(0, (H * z - H) / 2);
    return { x: Math.max(-maxPanX, Math.min(maxPanX, px)), y: Math.max(-maxPanY, Math.min(maxPanY, py)) };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setBaseScale(entry.contentRect.width / W);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset zoom/pan when question changes (hl or fb changes)
  useEffect(() => {
    setUserZoom(1);
    setPan({ x: 0, y: 0 });
  }, [hl]);

  const dist = (t1, t2) => Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  const mid = (t1, t2) => ({ x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 });

  const handleTouchStart = useCallback((e) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const g = gestureRef.current;
      g.startDist = dist(e.touches[0], e.touches[1]);
      g.startZoom = userZoom;
      g.startPan = { ...pan };
      g.startMid = mid(e.touches[0], e.touches[1]);
      g.isPinching = true;
    } else if (e.touches.length === 1 && userZoom > 1) {
      const d = dragRef.current;
      d.dragging = true;
      d.startX = e.touches[0].clientX;
      d.startY = e.touches[0].clientY;
      d.startPan = { ...pan };
    }
  }, [userZoom, pan]);

  const handleTouchMove = useCallback((e) => {
    if (e.touches.length === 2 && gestureRef.current.isPinching) {
      e.preventDefault();
      const g = gestureRef.current;
      const newDist = dist(e.touches[0], e.touches[1]);
      const newZoom = Math.max(1, Math.min(4, g.startZoom * (newDist / g.startDist)));
      const newMid = mid(e.touches[0], e.touches[1]);
      const dx = (newMid.x - g.startMid.x) / baseScale;
      const dy = (newMid.y - g.startMid.y) / baseScale;
      setUserZoom(newZoom);
      setPan(clampPan(g.startPan.x + dx, g.startPan.y + dy, newZoom));
    } else if (e.touches.length === 1 && dragRef.current.dragging) {
      e.preventDefault();
      const d = dragRef.current;
      const dx = (e.touches[0].clientX - d.startX) / baseScale;
      const dy = (e.touches[0].clientY - d.startY) / baseScale;
      setPan(clampPan(d.startPan.x + dx, d.startPan.y + dy, userZoom));
    }
  }, [baseScale, userZoom, clampPan]);

  const handleTouchEnd = useCallback((e) => {
    if (e.touches.length < 2) gestureRef.current.isPinching = false;
    if (e.touches.length === 0) dragRef.current.dragging = false;
    // Double-tap to reset zoom
    if (e.touches.length === 0 && e.changedTouches.length === 1) {
      const now = Date.now();
      if (now - gestureRef.current.lastTap < 300 && userZoom > 1) {
        setUserZoom(1);
        setPan({ x: 0, y: 0 });
      }
      gestureRef.current.lastTap = now;
    }
  }, [userZoom]);

  const isMobile = baseScale < 0.75;
  const pinR_base = isMobile ? 15 : 11;
  const pinR_hl = isMobile ? 18 : 14;
  const fontSize_base = isMobile ? 12 : 9;
  const fontSize_hl = isMobile ? 14 : 11;

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", overflow: "hidden", borderRadius: 12, background: "#e8f0f8", touchAction: userZoom > 1 ? "none" : "pan-y" }}
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {userZoom > 1 && (
        <div style={{ position: "absolute", top: 6, right: 6, zIndex: 5, display: "flex", gap: 4 }}>
          <button onClick={() => { setUserZoom(1); setPan({ x: 0, y: 0 }); }}
            style={{ background: "rgba(0,0,0,0.5)", color: "white", border: "none", borderRadius: 8, padding: "4px 8px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "'Fredoka',sans-serif" }}>
            {"\u21BA"} Reset zoom
          </button>
        </div>
      )}
      <div style={{ position: "relative", width: W, height: H, transformOrigin: "0 0", transform: `scale(${baseScale})` }}>
        <div style={{ width: W, height: H, transformOrigin: `${W/2}px ${H/2}px`, transform: `scale(${userZoom}) translate(${pan.x / userZoom}px, ${pan.y / userZoom}px)` }}>
        {tiles.map(t => (
          <img key={`${t.tx}-${t.ty}`}
            src={`https://basemaps.cartocdn.com/light_nolabels/${zoom}/${t.tx}/${t.ty}.png`}
            alt=""
            style={{ position: "absolute", left: t.left, top: t.top, width: 256, height: 256, pointerEvents: "none" }}
            draggable={false}
          />
        ))}
        <svg style={{ position: "absolute", inset: 0, width: W, height: H }}>
          {items.map(it => {
            const pos = pinPosition(it.lat, it.lon);
            const st = ps[it.letter] || "neutral";
            const isHl = hl === it.letter;
            const click = gm === "nameToMap" && !fb;
            const cols = { neutral: "#1a237e", correct: "#2e7d32", wrong: "#c62828" };
            const c = isHl ? "#d32f2f" : (cols[st] || cols.neutral);
            const pinR = isHl ? pinR_hl : pinR_base;
            return (
              <g key={it.letter} onClick={click ? () => onPin(it) : undefined}
                style={{ cursor: click ? "pointer" : "default" }}>
                {/* Invisible larger touch target for mobile */}
                {click && <circle cx={pos.x} cy={pos.y} r={Math.max(pinR + 8, 22)} fill="transparent" />}
                {isHl && (
                  <circle cx={pos.x} cy={pos.y} r={pinR + 8} fill={c} opacity="0.15">
                    <animate attributeName="r" values={`${pinR + 4};${pinR + 12};${pinR + 4}`} dur="1.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.2;0.05;0.2" dur="1.4s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={pos.x} cy={pos.y} r={pinR + 3} fill="white" opacity="0.9" />
                <circle cx={pos.x} cy={pos.y} r={pinR} fill={c} />
                <text x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="central"
                  fill="white" fontSize={isHl ? fontSize_hl : fontSize_base} fontWeight="800"
                  fontFamily="'Fredoka',sans-serif">
                  {it.letter}
                </text>
              </g>
            );
          })}
        </svg>
        </div>
      </div>
      <div style={{ paddingBottom: `${(H / W) * 100}%` }} />
      {isMobile && userZoom === 1 && (
        <div style={{ position: "absolute", bottom: 6, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.45)", color: "white", borderRadius: 8, padding: "3px 10px", fontSize: 10, fontWeight: 600, pointerEvents: "none", whiteSpace: "nowrap" }}>
          Knijp om in te zoomen
        </div>
      )}
    </div>
  );
}

function ScoreBar({ s }) {
  const t = s.correct + s.wrong;
  const p = t > 0 ? Math.round((s.correct / t) * 100) : 0;
  return (
    <div style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", borderRadius: 14, padding: "11px 14px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", flexWrap: "wrap" }}>
      <span style={{ fontSize: 20 }}>{"\u{1F3AF}"}</span>
      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Fredoka',sans-serif", color: "#1e293b" }}>
        {s.correct}/{t}<span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 5 }}>({p}%)</span>
      </div>
      <div style={{ flex: 1, minWidth: 50, height: 6, background: "#e2e8f0", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: p + "%", height: "100%", background: "linear-gradient(90deg,#2e7d32,#43a047)", borderRadius: 99, transition: "width 0.4s" }} />
      </div>
      <span style={{ color: "#2e7d32", fontWeight: 700, fontSize: 12 }}>{"\u2713"}{s.correct}</span>
      <span style={{ color: "#c62828", fontWeight: 700, fontSize: 12 }}>{"\u2717"}{s.wrong}</span>
    </div>
  );
}

function Leaderboard({ onBack }) {
  const [lb, setLb] = useState(loadLeaderboard());
  const clear = () => { saveLeaderboard([]); setLb([]); };
  return (
    <div className="su">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ fontFamily: "'Fredoka',sans-serif", fontSize: 20, color: "#2c3e50", margin: 0 }}>{"\u{1F3C6}"} Scorebord</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {lb.length > 0 && <button onClick={clear} style={{ background: "none", border: "1px solid #ddd", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "#95a5a6" }}>Wissen</button>}
          <button onClick={onBack} style={{ background: "rgba(0,0,0,.05)", border: "none", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "#7f8c8d", fontWeight: 600 }}>{"\u2190"} Terug</button>
        </div>
      </div>
      {lb.length === 0 ? (
        <div style={{ background: "rgba(255,255,255,.9)", borderRadius: 14, padding: 24, textAlign: "center", color: "#95a5a6" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>{"\u{1F4ED}"}</div>
          <p style={{ margin: 0, fontFamily: "'Fredoka',sans-serif" }}>Nog geen scores. Speel een quiz!</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {lb.map((e, i) => (
            <div key={i} style={{ background: i < 3 ? ["linear-gradient(135deg,#fff8e1,#fff3c4)","linear-gradient(135deg,#f5f5f5,#e8e8e8)","linear-gradient(135deg,#fff3e0,#ffe0b2)"][i] : "rgba(255,255,255,.9)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
              <span style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 800, fontSize: 18, color: i < 3 ? ["#f9a825","#78909c","#e65100"][i] : "#bbb", minWidth: 28, textAlign: "center" }}>
                {i < 3 ? ["\u{1F947}","\u{1F948}","\u{1F949}"][i] : `#${i + 1}`}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 14, color: "#2c3e50" }}>{e.name}</div>
                <div style={{ fontSize: 10, color: "#95a5a6" }}>{e.category} {"\u00b7"} {e.mode === "nameToMap" ? "Kaart" : "Naam"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 800, fontSize: 18, color: e.pct >= 80 ? "#2e7d32" : e.pct >= 50 ? "#f9a825" : "#c62828" }}>{e.pct}%</div>
                <div style={{ fontSize: 10, color: "#95a5a6" }}>{e.score}/{e.total}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FinishScreen({ s, onR, playerName, cat, gm, multiplayer, mpResults, onNextPlayer }) {
  const t = s.correct + s.wrong;
  const p = t > 0 ? Math.round((s.correct / t) * 100) : 0;
  const st = p >= 90 ? 3 : p >= 60 ? 2 : p >= 30 ? 1 : 0;
  const m = p === 100 ? "Perfect! \u{1F389}" : p >= 80 ? "Super goed! \u{1F31F}" : p >= 60 ? "Goed bezig! \u{1F4AA}" : "Blijf oefenen! \u{1F642}";

  const allDone = multiplayer && !onNextPlayer;
  const sorted = allDone ? [...mpResults].sort((a, b) => b.pct - a.pct || b.correct - a.correct) : [];

  return (
    <div style={{ textAlign: "center", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      {multiplayer && <div style={{ fontSize: 12, color: "#95a5a6", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>{playerName}</div>}
      <div>{[0, 1, 2].map(i => <span key={i} style={{ fontSize: 38, filter: i < st ? "none" : "grayscale(1) opacity(0.3)" }}>{"\u2B50"}</span>)}</div>
      <h2 style={{ fontFamily: "'Fredoka',sans-serif", fontSize: 22, color: "#1e293b", margin: 0 }}>{m}</h2>
      <div style={{ fontSize: 34, fontWeight: 800, fontFamily: "'Fredoka',sans-serif", color: p >= 80 ? "#2e7d32" : p >= 50 ? "#f9a825" : "#c62828" }}>{p}%</div>
      <p style={{ color: "#64748b", margin: 0 }}>{s.correct} van {t} goed</p>

      {allDone && (
        <div style={{ width: "100%", marginTop: 8 }}>
          <h3 style={{ fontFamily: "'Fredoka',sans-serif", fontSize: 16, color: "#2c3e50", marginBottom: 8 }}>{"\u{1F3C6}"} Eindstand</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sorted.map((r, i) => (
              <div key={i} style={{ background: i === 0 ? "linear-gradient(135deg,#fff8e1,#fff3c4)" : "rgba(255,255,255,.85)", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", gap: 8, border: i === 0 ? "2px solid #f9a825" : "1px solid #eee" }}>
                <span style={{ fontWeight: 800, fontSize: 16, minWidth: 24 }}>{i === 0 ? "\u{1F947}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : `#${i+1}`}</span>
                <span style={{ flex: 1, fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 14, color: "#2c3e50", textAlign: "left" }}>{r.name}</span>
                <span style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 800, fontSize: 16, color: r.pct >= 80 ? "#2e7d32" : r.pct >= 50 ? "#f9a825" : "#c62828" }}>{r.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", justifyContent: "center" }}>
        {multiplayer && onNextPlayer && (
          <button onClick={onNextPlayer} style={{ background: "linear-gradient(135deg,#e65100,#f57c00)", color: "white", border: "none", borderRadius: 11, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Fredoka',sans-serif" }}>{"\u{1F3C3}"} Volgende speler</button>
        )}
        <button onClick={() => onR(false)} style={{ background: "linear-gradient(135deg,#1565c0,#1976d2)", color: "white", border: "none", borderRadius: 11, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Fredoka',sans-serif" }}>{"\u{1F501}"} Opnieuw</button>
        <button onClick={() => onR(true)} style={{ background: "linear-gradient(135deg,#6a1b9a,#7b1fa2)", color: "white", border: "none", borderRadius: 11, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Fredoka',sans-serif" }}>{"\u{1F3E0}"} Menu</button>
      </div>
    </div>
  );
}

export default function App() {
  const [scr, setScr] = useState("menu");
  const [cat, setCat] = useState(null);
  const [gm, setGm] = useState(null);
  const [qs, setQs] = useState([]);
  const [qi, setQi] = useState(0);
  const [sc, setSc] = useState({ correct: 0, wrong: 0 });
  const [ts, setTs] = useState({ correct: 0, wrong: 0, games: 0 });
  const [fb, setFb] = useState(null);
  const [ps, setPs] = useState({});
  const [cs, setCs] = useState({});
  const tmr = useRef(null);

  // Player & multiplayer state
  const [playerName, setPlayerName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [mpMode, setMpMode] = useState(false);
  const [mpPlayers, setMpPlayers] = useState([]);
  const [mpInput, setMpInput] = useState("");
  const [mpCurrent, setMpCurrent] = useState(0);
  const [mpResults, setMpResults] = useState([]);

  useEffect(() => {
    try {
      const d = JSON.parse(window.name || "{}");
      if (d.t) setTs(d.t);
    } catch (e) {}
  }, []);

  const saveT = (t) => {
    try { window.name = JSON.stringify({ t }); } catch (e) {}
  };

  const buildQuestions = (c, m) => {
    const its = c === "alles" ? ALL : CATEGORIES[c].items;
    const s = shuffle(its);
    if (m === "mapToName") {
      return s.map(i => ({
        ...i,
        opts: shuffle([i, ...shuffle(ALL.filter(x => x.name !== i.name)).slice(0, 3)])
      }));
    }
    return s;
  };

  const start = (c, m) => {
    setQs(buildQuestions(c, m));
    setCat(c); setGm(m); setQi(0);
    setSc({ correct: 0, wrong: 0 });
    setFb(null); setPs({}); setCs({});
    setScr("game");
  };

  const startSingle = (c, m) => {
    setMpMode(false); setMpPlayers([]); setMpResults([]); setMpCurrent(0);
    setPlayerName(nameInput.trim() || "Speler");
    start(c, m);
  };

  const startMultiplayer = (c, m) => {
    if (mpPlayers.length < 2) return;
    setMpMode(true); setMpCurrent(0); setMpResults([]);
    setPlayerName(mpPlayers[0]);
    start(c, m);
  };

  const nextMpPlayer = () => {
    const next = mpCurrent + 1;
    setMpCurrent(next);
    setPlayerName(mpPlayers[next]);
    setQs(buildQuestions(cat, gm));
    setQi(0); setSc({ correct: 0, wrong: 0 });
    setFb(null); setPs({}); setCs({});
    setScr("game");
  };

  const answer = useCallback((sel) => {
    if (fb) return;
    const cur = qs[qi];
    const ok = sel.letter === cur.letter;
    if (gm === "nameToMap") {
      setPs({ [cur.letter]: "correct", ...(ok ? {} : { [sel.letter]: "wrong" }) });
    } else {
      setCs({ [cur.name]: "correct", ...(ok ? {} : { [sel.name]: "wrong" }) });
    }
    setSc(s => ({ correct: s.correct + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
    setFb(ok ? "correct" : "wrong");
    tmr.current = setTimeout(() => {
      setFb(null); setPs({}); setCs({});
      if (qi + 1 >= qs.length) {
        const finalCorrect = sc.correct + (ok ? 1 : 0);
        const finalWrong = sc.wrong + (ok ? 0 : 1);
        const finalTotal = finalCorrect + finalWrong;
        const nt = { correct: ts.correct + finalCorrect, wrong: ts.wrong + finalWrong, games: ts.games + 1 };
        setTs(nt); saveT(nt);
        const catLabel = cat === "alles" ? "Alles" : CATEGORIES[cat]?.label || cat;
        addToLeaderboard(playerName || "Speler", finalCorrect, finalTotal, catLabel, gm);
        if (mpMode) {
          setMpResults(r => [...r, { name: playerName, correct: finalCorrect, wrong: finalWrong, total: finalTotal, pct: finalTotal > 0 ? Math.round((finalCorrect / finalTotal) * 100) : 0 }]);
        }
        setScr("finish");
      } else {
        setQi(q => q + 1);
      }
    }, 1400);
  }, [fb, qs, qi, gm, sc, ts, playerName, mpMode, cat]);

  const restart = (m) => {
    if (m) { setMpMode(false); setMpPlayers([]); setMpResults([]); setScr("menu"); }
    else { if (mpMode) { setMpResults([]); setMpCurrent(0); setPlayerName(mpPlayers[0]); } start(cat, gm); }
  };
  const resetT = () => { const r = { correct: 0, wrong: 0, games: 0 }; setTs(r); saveT(r); };
  const cur = qs[qi];
  const dI = cat === "alles" ? ALL : CATEGORIES[cat]?.items || [];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#e8f0f8 0%,#dce8f0 50%,#e0eee0 100%)", fontFamily: "'Nunito',sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
      <style>{
        "@keyframes su{from{transform:translateY(14px);opacity:0}to{transform:translateY(0);opacity:1}}" +
        "@keyframes pop{0%{transform:scale(.85);opacity:0}60%{transform:scale(1.06)}100%{transform:scale(1);opacity:1}}" +
        ".su{animation:su .35s ease}.pop{animation:pop .3s ease}" +
        ".cb{transition:all .15s ease}.cb:hover{transform:translateY(-2px);box-shadow:0 4px 14px rgba(0,0,0,.1)}" +
        ".mc{transition:all .2s ease}.mc:hover{transform:translateY(-3px);box-shadow:0 6px 24px rgba(0,0,0,.12)}"
      }</style>

      {/* Header */}
      <div style={{ background: "rgba(255,255,255,0.8)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(200,210,220,0.4)", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 26 }}>{"\u{1F5FA}\uFE0F"}</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 17, fontFamily: "'Fredoka',sans-serif", fontWeight: 700, color: "#2c3e50" }}>Noord-Europa Quiz</h1>
            <p style={{ margin: 0, fontSize: 10, color: "#7f8c8d" }}>Landen {"\u00b7"} Steden {"\u00b7"} Zee{"\u00eb"}n</p>
          </div>
        </div>
        {scr !== "menu" && (
          <button onClick={() => { clearTimeout(tmr.current); setScr("menu"); }}
            style={{ background: "rgba(0,0,0,.05)", border: "none", borderRadius: 10, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontWeight: 600, color: "#7f8c8d" }}>
            {"\u2190"} Menu
          </button>
        )}
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "14px 14px 36px" }}>

        {/* MENU */}
        {scr === "menu" && (
          <div className="su">
            {ts.games > 0 && (
              <div style={{ background: "rgba(255,255,255,0.85)", borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 22 }}>{"\u{1F3C6}"}</span>
                  <div>
                    <div style={{ fontSize: 10, color: "#7f8c8d", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Totaal</div>
                    <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 16, color: "#2c3e50" }}>
                      {ts.correct} goed <span style={{ color: "#95a5a6", fontSize: 12 }}>uit {ts.correct + ts.wrong} {"\u00b7"} {ts.games} {ts.games === 1 ? "spel" : "spelletjes"}</span>
                    </div>
                  </div>
                </div>
                <button onClick={resetT} style={{ background: "none", border: "1px solid #dce6d0", borderRadius: 8, padding: "3px 8px", fontSize: 10, cursor: "pointer", color: "#95a5a6" }}>Reset</button>
              </div>
            )}

            <button onClick={() => setScr("leaderboard")} className="mc" style={{ width: "100%", background: "linear-gradient(135deg,#f9a825,#fbc02d)", color: "#5d4037", border: "none", borderRadius: 14, padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginBottom: 16, boxShadow: "0 3px 12px rgba(249,168,37,.3)" }}>
              <span style={{ fontSize: 24 }}>{"\u{1F3C6}"}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 15 }}>Scorebord</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>Bekijk alle scores</div>
              </div>
            </button>

            <h2 style={{ fontFamily: "'Fredoka',sans-serif", fontSize: 20, color: "#2c3e50", marginBottom: 4, marginTop: 4 }}>Kies een categorie</h2>
            <p style={{ color: "#7f8c8d", fontSize: 13, marginTop: 0, marginBottom: 12 }}>Wat wil je oefenen?</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
              {[...Object.entries(CATEGORIES), ["alles", { label: "Alles!", emoji: "\u{1F30D}", color: "#6a1b9a", items: ALL }]].map(([k, c]) => (
                <div key={k} className="mc" onClick={() => setCat(k)} style={{
                  background: cat === k ? "linear-gradient(135deg," + c.color + "12," + c.color + "22)" : "rgba(255,255,255,0.85)",
                  border: "2px solid " + (cat === k ? c.color : "transparent"),
                  borderRadius: 14, padding: "14px 16px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12, boxShadow: "0 2px 8px rgba(0,0,0,.04)",
                }}>
                  <span style={{ fontSize: 28 }}>{c.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 16, color: "#2c3e50" }}>{c.label}</div>
                    <div style={{ fontSize: 11, color: "#95a5a6" }}>{c.items.length} items</div>
                  </div>
                  {cat === k && <span style={{ background: c.color, color: "white", borderRadius: 99, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{"\u2713"}</span>}
                </div>
              ))}
            </div>

            {cat && (
              <div className="pop">
                <h2 style={{ fontFamily: "'Fredoka',sans-serif", fontSize: 20, color: "#2c3e50", marginBottom: 4 }}>Jouw naam</h2>
                <input value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Naam..." maxLength={20}
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 14px", borderRadius: 10, border: "2px solid #d5ddd0", fontSize: 14, fontFamily: "'Fredoka',sans-serif", marginBottom: 12, outline: "none" }} />

                {/* Multiplayer setup */}
                <div style={{ background: "rgba(255,255,255,.85)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, border: "1px solid #e8e8e8" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 14, color: "#2c3e50" }}>{"\u{1F465}"} Multiplayer</span>
                    <span style={{ fontSize: 10, color: "#95a5a6" }}>{mpPlayers.length} spelers</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <input value={mpInput} onChange={e => setMpInput(e.target.value)} placeholder="Speler toevoegen..." maxLength={20}
                      onKeyDown={e => { if (e.key === "Enter" && mpInput.trim() && mpPlayers.length < 8) { setMpPlayers(p => [...p, mpInput.trim()]); setMpInput(""); } }}
                      style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 12, fontFamily: "'Fredoka',sans-serif", outline: "none" }} />
                    <button onClick={() => { if (mpInput.trim() && mpPlayers.length < 8) { setMpPlayers(p => [...p, mpInput.trim()]); setMpInput(""); } }}
                      style={{ background: "#43a047", color: "white", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Fredoka',sans-serif" }}>+</button>
                  </div>
                  {mpPlayers.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {mpPlayers.map((p, i) => (
                        <span key={i} style={{ background: "#e3f2fd", borderRadius: 8, padding: "3px 8px", fontSize: 11, fontWeight: 600, color: "#1565c0", display: "flex", alignItems: "center", gap: 4 }}>
                          {p}
                          <span onClick={() => setMpPlayers(ps => ps.filter((_, j) => j !== i))} style={{ cursor: "pointer", color: "#c62828", fontWeight: 800, fontSize: 13, lineHeight: 1 }}>{"\u00d7"}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <h2 style={{ fontFamily: "'Fredoka',sans-serif", fontSize: 20, color: "#2c3e50", marginBottom: 4 }}>Hoe wil je oefenen?</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  {Object.entries(MODES).map(([k, m]) => (
                    <button key={k} onClick={() => mpPlayers.length >= 2 ? startMultiplayer(cat, k) : startSingle(cat, k)} className="mc" style={{
                      background: "linear-gradient(135deg,#1565c0,#1976d2)", color: "white",
                      border: "none", borderRadius: 14, padding: "16px 18px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                      boxShadow: "0 4px 14px rgba(21,101,192,.3)",
                    }}>
                      <span style={{ fontSize: 26 }}>{m.emoji}</span>
                      <div>
                        <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 15 }}>{m.label} {mpPlayers.length >= 2 ? "(" + mpPlayers.length + " spelers)" : ""}</div>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>{m.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* GAME */}
        {scr === "game" && cur && (
          <div className="su">
            <ScoreBar s={sc} />

            {mpMode && (
              <div style={{ background: "rgba(255,255,255,.9)", borderRadius: 10, padding: "6px 12px", marginBottom: 6, textAlign: "center", fontSize: 13, fontFamily: "'Fredoka',sans-serif", fontWeight: 700, color: "#1565c0" }}>
                {"\u{1F3C3}"} {playerName} — Speler {mpCurrent + 1} van {mpPlayers.length}
              </div>
            )}

            <div style={{ margin: "10px 0", display: "flex", gap: 2 }}>
              {qs.map((_, i) => (
                <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i < qi ? "#2e7d32" : i === qi ? "#1565c0" : "#d5ddd0", transition: "background .3s" }} />
              ))}
            </div>

            <div style={{ background: "rgba(255,255,255,0.92)", borderRadius: 14, padding: "12px 16px", marginBottom: 10, textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
              <div style={{ fontSize: 10, color: "#95a5a6", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>
                Vraag {qi + 1} van {qs.length}
              </div>
              {gm === "nameToMap" ? (
                <div style={{ fontFamily: "'Fredoka',sans-serif", fontSize: 20, fontWeight: 700, color: "#2c3e50" }}>
                  Waar ligt <span style={{ color: "#1565c0" }}>{cur.name}</span>?
                </div>
              ) : (
                <div style={{ fontFamily: "'Fredoka',sans-serif", fontSize: 20, fontWeight: 700, color: "#2c3e50" }}>
                  Wat is punt <span style={{ background: "#1565c0", color: "white", borderRadius: 7, padding: "1px 9px" }}>{cur.letter}</span>?
                </div>
              )}
            </div>

            {fb && (
              <div className="pop" style={{ textAlign: "center", padding: "6px 0", fontSize: 16, fontFamily: "'Fredoka',sans-serif", fontWeight: 700, color: fb === "correct" ? "#2e7d32" : "#c62828" }}>
                {fb === "correct" ? "\u2705 Goed zo!" : "\u274C Het was: " + cur.name}
              </div>
            )}

            <div style={{ background: "rgba(255,255,255,0.95)", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,.1)", marginBottom: 10, maxHeight: "calc(100vh - 260px)" }}>
              <MapView items={dI} ps={ps} onPin={answer} hl={gm === "mapToName" ? cur.letter : null} fb={fb} gm={gm} />
            </div>



            {gm === "mapToName" && cur.opts && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {cur.opts.map(o => {
                  const st = cs[o.name];
                  let bg = "rgba(255,255,255,.92)", bd = "2px solid #d5ddd0", cl = "#2c3e50";
                  if (st === "correct") { bg = "#e8f5e9"; bd = "2px solid #2e7d32"; cl = "#2e7d32"; }
                  else if (st === "wrong") { bg = "#fce4ec"; bd = "2px solid #c62828"; cl = "#c62828"; }
                  return (
                    <button key={o.name} className="cb" onClick={() => !fb && answer(o)} disabled={!!fb}
                      style={{ background: bg, border: bd, borderRadius: 12, padding: "12px 10px", fontSize: 13, fontWeight: 700, fontFamily: "'Fredoka',sans-serif", color: cl, cursor: fb ? "default" : "pointer", boxShadow: "0 2px 6px rgba(0,0,0,.04)" }}>
                      {o.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* FINISH */}
        {/* LEADERBOARD */}
        {scr === "leaderboard" && <Leaderboard onBack={() => setScr("menu")} />}

        {/* FINISH */}
        {scr === "finish" && (
          <div className="su">
            <FinishScreen s={sc} onR={restart} playerName={playerName} cat={cat} gm={gm}
              multiplayer={mpMode}
              mpResults={mpMode ? [...mpResults, ...(mpResults.find(r => r.name === playerName) ? [] : [{ name: playerName, correct: sc.correct, wrong: sc.wrong, total: sc.correct + sc.wrong, pct: (sc.correct + sc.wrong) > 0 ? Math.round((sc.correct / (sc.correct + sc.wrong)) * 100) : 0 }])] : []}
              onNextPlayer={mpMode && mpCurrent + 1 < mpPlayers.length ? nextMpPlayer : null} />
          </div>
        )}
      </div>
    </div>
  );
}