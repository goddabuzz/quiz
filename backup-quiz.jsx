import { useState, useEffect, useCallback, useRef } from "react";

const CATEGORIES = {
  landen: { label:"Landen", emoji:"\u{1F3D4}\uFE0F", color:"#2D6A4F", items:[
    {letter:"A",name:"Groenland",x:84.7,y:165.1},
    {letter:"B",name:"IJsland",x:328.2,y:300.4},
    {letter:"C",name:"Noorwegen",x:635.3,y:300.4},
    {letter:"D",name:"Zweden",x:698.8,y:347.7},
    {letter:"E",name:"Finland",x:804.7,y:316.8},
    {letter:"F",name:"Denemarken",x:635.3,y:429.8},
    {letter:"G",name:"Estland",x:794.1,y:390.6},
    {letter:"H",name:"Letland",x:788.8,y:417.1},
    {letter:"I",name:"Litouwen",x:783.5,y:436.1},
    {letter:"J",name:"Polen",x:735.9,y:477.7},
  ]},
  steden: { label:"Steden", emoji:"\u{1F3F0}", color:"#9B2226", items:[
    {letter:"1",name:"Reykjavik",x:297.5,y:315.1},
    {letter:"2",name:"Oslo",x:643.2,y:378.1},
    {letter:"3",name:"Stockholm",x:720.7,y:386.0},
    {letter:"4",name:"Helsinki",x:793.5,y:374.3},
    {letter:"5",name:"Kopenhagen",x:662.5,y:433.8},
    {letter:"6",name:"Warschau",x:751.8,y:475.0},
  ]},
  zeeen: { label:"Zee\u00ebn", emoji:"\u{1F30A}", color:"#005F73", items:[
    {letter:"a",name:"Atlantische Oceaan",x:317.6,y:429.8},
    {letter:"b",name:"Noordzee",x:561.2,y:410.6},
    {letter:"c",name:"Oostzee",x:725.3,y:410.6},
  ]},
};

const ALL = [...CATEGORIES.landen.items,...CATEGORIES.steden.items,...CATEGORIES.zeeen.items];
const MODES = {
  nameToMap:{label:"Vind op de kaart",emoji:"\u{1F4CD}",desc:"Tik op de juiste plek"},
  mapToName:{label:"Benoem de plek",emoji:"\u{1F3F7}\uFE0F",desc:"Kies de juiste naam"},
};

function shuffle(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function MapView({ items, ps, onPin, hl, fb, gm }) {
  const svgW = 900, svgH = 500;

  const tileUrl = (z, x, y) =>
    "https://tile.openstreetmap.org/" + z + "/" + x + "/" + y + ".png";

  const zoom = 3;
  const tilesPerSide = Math.pow(2, zoom);

  function lonToTileX(lon, z) {
    return Math.floor(((lon + 180) / 360) * Math.pow(2, z));
  }
  function latToTileY(lat, z) {
    const r = Math.PI / 180;
    return Math.floor(
      ((1 - Math.log(Math.tan(lat * r) + 1 / Math.cos(lat * r)) / Math.PI) / 2) *
        Math.pow(2, z)
    );
  }

  const lonMin = -50, lonMax = 35, latMin = 50, latMax = 78;
  const tileXMin = lonToTileX(lonMin, zoom);
  const tileXMax = lonToTileX(lonMax, zoom);
  const tileYMin = latToTileY(latMax, zoom);
  const tileYMax = latToTileY(latMin, zoom);

  function tileToLon(x, z) {
    return (x / Math.pow(2, z)) * 360 - 180;
  }
  function tileToLat(y, z) {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function lonToSvgX(lon) {
    const r = Math.PI / 180;
    const xMin = lonMin * r, xMax = lonMax * r;
    return ((lon * r - xMin) / (xMax - xMin)) * svgW;
  }
  function latToSvgY(lat) {
    const r = Math.PI / 180;
    const yMerc = Math.log(Math.tan(Math.PI / 4 + (lat * r) / 2));
    const yMin = Math.log(Math.tan(Math.PI / 4 + (latMin * r) / 2));
    const yMax = Math.log(Math.tan(Math.PI / 4 + (latMax * r) / 2));
    return (1 - (yMerc - yMin) / (yMax - yMin)) * svgH;
  }

  const tiles = [];
  for (let ty = tileYMin; ty <= tileYMax; ty++) {
    for (let tx = tileXMin; tx <= tileXMax; tx++) {
      const tLonLeft = tileToLon(tx, zoom);
      const tLonRight = tileToLon(tx + 1, zoom);
      const tLatTop = tileToLat(ty, zoom);
      const tLatBottom = tileToLat(ty + 1, zoom);
      const sx = lonToSvgX(tLonLeft);
      const sy = latToSvgY(tLatTop);
      const sw = lonToSvgX(tLonRight) - sx;
      const sh = latToSvgY(tLatBottom) - sy;
      tiles.push({ url: tileUrl(zoom, tx, ty), x: sx, y: sy, w: sw, h: sh, key: tx + "-" + ty });
    }
  }

  return (
    <svg viewBox={"0 0 " + svgW + " " + svgH} style={{ width: "100%", display: "block", borderRadius: 12 }}>
      <defs>
        <clipPath id="mapClip">
          <rect x="0" y="0" width={svgW} height={svgH} />
        </clipPath>
      </defs>
      <rect width={svgW} height={svgH} fill="#a8d4e6" />
      <g clipPath="url(#mapClip)">
        {tiles.map(t => (
          <image key={t.key} href={t.url} x={t.x} y={t.y} width={t.w} height={t.h} />
        ))}
      </g>

      {items.map(it => {
        const st = ps[it.letter] || "neutral";
        const isHl = hl === it.letter;
        const click = gm === "nameToMap" && !fb;
        const cols = { neutral: "#1a237e", correct: "#2e7d32", wrong: "#c62828" };
        const c = isHl ? "#d32f2f" : (cols[st] || cols.neutral);
        const r = isHl ? 14 : 11;
        return (
          <g key={it.letter} onClick={click ? () => onPin(it) : undefined}
            style={{ cursor: click ? "pointer" : "default" }}>
            {isHl && (
              <circle cx={it.x} cy={it.y} r={22} fill={c} opacity="0.15">
                <animate attributeName="r" values="18;26;18" dur="1.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.2;0.05;0.2" dur="1.4s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={it.x} cy={it.y} r={r + 3} fill="white" opacity="0.9" />
            <circle cx={it.x} cy={it.y} r={r} fill={c} />
            <text x={it.x} y={it.y} textAnchor="middle" dominantBaseline="central"
              fill="white" fontSize={isHl ? "11" : "9"} fontWeight="800"
              fontFamily="'Fredoka',sans-serif">
              {it.letter}
            </text>
          </g>
        );
      })}
    </svg>
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

function FinishScreen({ s, onR }) {
  const t = s.correct + s.wrong;
  const p = t > 0 ? Math.round((s.correct / t) * 100) : 0;
  const st = p >= 90 ? 3 : p >= 60 ? 2 : p >= 30 ? 1 : 0;
  const m = p === 100 ? "Perfect! \u{1F389}" : p >= 80 ? "Super goed! \u{1F31F}" : p >= 60 ? "Goed bezig! \u{1F4AA}" : "Blijf oefenen! \u{1F642}";
  return (
    <div style={{ textAlign: "center", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div>{[0, 1, 2].map(i => <span key={i} style={{ fontSize: 38, filter: i < st ? "none" : "grayscale(1) opacity(0.3)" }}>{"\u2B50"}</span>)}</div>
      <h2 style={{ fontFamily: "'Fredoka',sans-serif", fontSize: 22, color: "#1e293b", margin: 0 }}>{m}</h2>
      <div style={{ fontSize: 34, fontWeight: 800, fontFamily: "'Fredoka',sans-serif", color: p >= 80 ? "#2e7d32" : p >= 50 ? "#f9a825" : "#c62828" }}>{p}%</div>
      <p style={{ color: "#64748b", margin: 0 }}>{s.correct} van {t} goed</p>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
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

  useEffect(() => {
    try {
      const d = JSON.parse(window.name || "{}");
      if (d.t) setTs(d.t);
    } catch (e) {}
  }, []);

  const saveT = (t) => {
    try { window.name = JSON.stringify({ t }); } catch (e) {}
  };

  const start = (c, m) => {
    const its = c === "alles" ? ALL : CATEGORIES[c].items;
    const s = shuffle(its);
    if (m === "mapToName") {
      setQs(s.map(i => ({
        ...i,
        opts: shuffle([i, ...shuffle(ALL.filter(x => x.name !== i.name)).slice(0, 3)])
      })));
    } else {
      setQs(s);
    }
    setCat(c); setGm(m); setQi(0);
    setSc({ correct: 0, wrong: 0 });
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
        const nt = { correct: ts.correct + sc.correct + (ok ? 1 : 0), wrong: ts.wrong + sc.wrong + (ok ? 0 : 1), games: ts.games + 1 };
        setTs(nt); saveT(nt); setScr("finish");
      } else {
        setQi(q => q + 1);
      }
    }, 1400);
  }, [fb, qs, qi, gm, sc, ts]);

  const restart = (m) => { m ? setScr("menu") : start(cat, gm); };
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
                <h2 style={{ fontFamily: "'Fredoka',sans-serif", fontSize: 20, color: "#2c3e50", marginBottom: 4 }}>Hoe wil je oefenen?</h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  {Object.entries(MODES).map(([k, m]) => (
                    <button key={k} onClick={() => start(cat, k)} className="mc" style={{
                      background: "linear-gradient(135deg,#1565c0,#1976d2)", color: "white",
                      border: "none", borderRadius: 14, padding: "16px 18px", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                      boxShadow: "0 4px 14px rgba(21,101,192,.3)",
                    }}>
                      <span style={{ fontSize: 26 }}>{m.emoji}</span>
                      <div>
                        <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 15 }}>{m.label}</div>
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

            <div style={{ background: "rgba(255,255,255,0.95)", borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,.1)", marginBottom: 10 }}>
              <MapView items={dI} ps={ps} onPin={answer} hl={gm === "mapToName" ? cur.letter : null} fb={fb} gm={gm} />
            </div>

            <p style={{ fontSize: 8, color: "#bbb", textAlign: "right", margin: "2px 4px 8px", fontStyle: "italic" }}>{"\u00a9"} OpenStreetMap contributors</p>

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
        {scr === "finish" && (
          <div className="su">
            <FinishScreen s={sc} onR={restart} />
          </div>
        )}
      </div>
    </div>
  );
}