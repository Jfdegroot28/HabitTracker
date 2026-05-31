import React, { useState, useEffect, useRef, useMemo } from "react";
import { sGet, sSet, sDel } from "./supabase";
import {
  Lock, Check, ChevronLeft, ChevronRight, Plus, X, RefreshCw, Flame,
  Trash2, Pencil, Settings2, ClipboardList, Target, LogOut, KeyRound,
  ShieldCheck, User, BarChart3, TrendingUp, TrendingDown, Award, CalendarDays,
  Trophy, Medal, Crown, Users
} from "lucide-react";

/* ------------------------------------------------------------------ *
 *  CONFIG                                                            *
 * ------------------------------------------------------------------ */
const START = new Date(2026, 4, 31);  // May 31 2026
const END   = new Date(2027, 5, 1);   // Jun 1 2027
const SALT  = "bullpen.v2";

// Core habits that every player must track — these are locked (not editable/deletable)
// Special types: "nutrition" = 1-5 star rating, "game" = checkbox + notes
const CORE_HABITS = [
  { id: "core_sleep",        label: "8+ hrs of sleep",        type: "check" },
  { id: "core_workout",      label: "Workout",                 type: "check" },
  { id: "core_throw",        label: "Throw",                   type: "check" },
  { id: "core_water",        label: "100+ oz of water",        type: "check" },
  { id: "core_mobility",     label: "Mobility / Arm Care",     type: "check" },
  { id: "core_defense",      label: "Defensive Work",          type: "check" },
  { id: "core_offense",      label: "Offensive Work",          type: "check" },
  { id: "core_no_alcohol",   label: "No Alcohol",              type: "check" },
  { id: "core_nutrition",    label: "Nutrition Quality",       type: "nutrition" },
  { id: "core_energy",       label: "Energy Level",            type: "energy" },
  { id: "core_mental",       label: "Mental Health",           type: "mental" },
  { id: "core_game",         label: "Game Day",                type: "game" },
];
const CORE_IDS = new Set(CORE_HABITS.map((h) => h.id));
const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const MONTHS = ["January","February","March","April","May","June","July",
  "August","September","October","November","December"];
const MONTHS_SH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/* ------------------------------------------------------------------ *
 *  HELPERS                                                           *
 * ------------------------------------------------------------------ */
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const inRange = (d) => sod(d) >= sod(START) && sod(d) <= sod(END);
const weekStart = (d) => { const s = sod(d); return addDays(s, -((s.getDay() + 6) % 7)); };
const weekEnd = (d) => addDays(weekStart(d), 6);
const monthLast = (y, m) => new Date(y, m + 1, 0);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

async function sha(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SALT + str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function dayStatus(date, now) {
  if (!inRange(date)) return "out";
  const d0 = sod(date), today = sod(now);
  if (d0 > today) return "future";
  return now.getTime() >= addDays(d0, 3).getTime() ? "locked" : "open";
}
const canEditDay = (date, now, coach) =>
  inRange(date) && (coach ? sod(date) <= sod(now) || true : dayStatus(date, now) === "open");
const weekStatus = (d, now) => {
  const ws = weekStart(d), today = sod(now);
  if (ws > today) return "future";
  return now.getTime() >= addDays(weekEnd(d), 3).getTime() ? "locked" : "open";
};
const monthStatus = (y, m, now) => {
  const first = new Date(y, m, 1), last = monthLast(y, m), today = sod(now);
  if (first > today) return "future";
  return now.getTime() >= addDays(last, 3).getTime() ? "locked" : "open";
};

function fmtCountdown(ms) {
  if (ms <= 0) return "locking…";
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24), rh = h % 24;
  if (d > 0) return `locks in ${d}d ${rh}h`;
  if (h > 0) return `locks in ${h}h ${Math.floor((ms % 3600000) / 60000)}m`;
  return `locks in ${Math.floor(ms / 60000)}m`;
}

function newPitcher(id, name) {
  return {
    id, name, personalGoal: "", teamGoal: "", dailyGoals: ["", "", ""],
    // core habits are baked in; customHabits are player-added extras
    customHabits: [],
    days: {}, weeks: {}, months: {},
  };
}
// All trackable habits for a pitcher = locked core + their custom additions
function allHabits(p) {
  return [...CORE_HABITS, ...(p.customHabits || [])];
}



/* ================================================================== *
 *  APP (loader + auth routing)                                       *
 * ================================================================== */
export default function App() {
  const [auth, setAuth] = useState(null);
  const [roster, setRoster] = useState([]);
  const [session, setSession] = useState(null);
  const [booted, setBooted] = useState(false);
  const [storageOk, setStorageOk] = useState(true);

  useEffect(() => { (async () => {
    setAuth(await sGet("auth") as any);
    setRoster((await sGet("roster") as any[] | null) || []);
    setBooted(true);
  })(); }, []);

  const saveRoster = async (next) => { setRoster(next); await sSet("roster", next); };

  async function completeSetup(pw) {
    const a = { coachHash: await sha(pw), setup: true };
    await sSet("auth", a); setAuth(a); setSession({ role: "coach" });
  }
  async function changeCoachPw(pw) {
    const a = { ...auth, coachHash: await sha(pw) };
    await sSet("auth", a); setAuth(a);
  }

  return (
    <div className="pt-root">
      <Style />
      {!booted ? (
        <div className="pt-empty">Loading…</div>
      ) : !auth?.setup ? (
        <Setup onDone={completeSetup} />
      ) : !session ? (
        <Login auth={auth} roster={roster} onLogin={setSession} />
      ) : (
        <Tracker
          session={session} roster={roster} saveRoster={saveRoster}
          auth={auth} changeCoachPw={changeCoachPw}
          onLogout={() => setSession(null)}
          refreshRoster={async () => setRoster((await sGet("roster")) || [])}
        />
      )}
    </div>
  );
}

/* ================================================================== *
 *  AUTH SCREENS                                                      *
 * ================================================================== */
function WildcatLogo({ size = 46 }) {
  return (
    <img
      src="data:image/png;base64,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"
      width={size} height={size}
      alt="Wildcats Baseball"
      style={{borderRadius:"11px",flexShrink:0,objectFit:"cover",boxShadow:"0 6px 20px rgba(245,168,0,.35)"}}
    />
  );
}

function Brand({ tag }) {
  return (
    <div className="pt-brand center">
      <WildcatLogo />
      <div>
        <h1>SUNY POLY BASEBALL</h1>
        <p>{tag}</p>
      </div>
    </div>
  );
}

function Setup({ onDone }) {
  const [pw, setPw] = useState(""); const [c, setC] = useState(""); const [err, setErr] = useState("");
  const go = () => {
    if (pw.length < 4) return setErr("Use at least 4 characters.");
    if (pw !== c) return setErr("Passwords don’t match.");
    onDone(pw);
  };
  return (
    <div className="pt-gate">
      <Brand tag="First-time setup" />
      <div className="pt-card">
        <h2><ShieldCheck size={18} /> Create the coach password</h2>
        <p className="pt-cardsub">You’re the first to open this. Set the master coach password — you’ll use it to manage the staff and edit any calendar at any time.</p>
        <input type="password" placeholder="Coach password" value={pw} onChange={(e) => setPw(e.target.value)} />
        <input type="password" placeholder="Confirm password" value={c}
          onChange={(e) => setC(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go()} />
        {err && <div className="pt-err">{err}</div>}
        <button className="pt-primary" onClick={go}>Create &amp; enter</button>
      </div>
    </div>
  );
}

function Login({ auth, roster, onLogin }) {
  const [mode, setMode] = useState("coach");
  const [pw, setPw] = useState("");
  const [pid, setPid] = useState(roster[0]?.id || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    const h = await sha(pw);
    if (mode === "coach") {
      if (h === auth.coachHash) onLogin({ role: "coach" });
      else setErr("Incorrect coach password.");
    } else {
      const p = roster.find((x) => x.id === pid);
      if (!p) setErr("Pick your name.");
      else if (!p.passHash) setErr("No password set yet — ask your coach.");
      else if (h === p.passHash) onLogin({ role: "player", pitcherId: p.id, name: p.name });
      else setErr("Incorrect password.");
    }
    setBusy(false);
  };

  return (
    <div className="pt-gate">
      <Brand tag="Daily Habits & Goals · Pitching Staff" />
      <div className="pt-card">
        <div className="pt-roletoggle">
          <button className={mode === "coach" ? "on" : ""} onClick={() => { setMode("coach"); setErr(""); }}>
            <ShieldCheck size={15} /> Coach
          </button>
          <button className={mode === "player" ? "on" : ""} onClick={() => { setMode("player"); setErr(""); }}>
            <User size={15} /> Player
          </button>
        </div>

        {mode === "player" && (
          <select value={pid} onChange={(e) => setPid(e.target.value)}>
            {roster.length === 0 && <option value="">No players added yet</option>}
            {roster.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <input type="password" placeholder="Password" value={pw}
          onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <div className="pt-err">{err}</div>}
        <button className="pt-primary" disabled={busy} onClick={submit}>
          {busy ? "Checking…" : "Sign in"}
        </button>
        <p className="pt-cardsub small">
          {mode === "coach" ? "Coaches can view and edit every calendar at any time."
            : "Players see and edit only their own calendar."}
        </p>
      </div>
    </div>
  );
}

/* ================================================================== *
 *  TRACKER (role-aware main app)                                     *
 * ================================================================== */
function Tracker({ session, roster, saveRoster, auth, changeCoachPw, onLogout, refreshRoster }) {
  const isCoach = session.role === "coach";
  const [selId, setSelId] = useState(isCoach ? roster[0]?.id || null : session.pitcherId);
  const [data, setData] = useState(null);
  const [cursor, setCursor] = useState({ y: 2026, m: 5 });
  const [view, setView] = useState("calendar");
  const [mainTab, setMainTab] = useState("tracker"); // "tracker" | "leaderboard"
  const [openDayKey, setOpenDayKey] = useState(null);
  const [now, setNow] = useState(new Date());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [showHabits, setShowHabits] = useState(false);
  const [manage, setManage] = useState(false);

  const saveTimer = useRef(null);
  const lastTouch = useRef(Date.now());
  const touch = () => { lastTouch.current = Date.now(); };

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  useEffect(() => { if (selId) loadPitcher(selId); /* eslint-disable-next-line */ }, [selId]);

  /* gentle auto-sync when idle */
  useEffect(() => {
    const t = setInterval(async () => {
      if (saving || openDayKey || manage) return;
      if (Date.now() - lastTouch.current < 20000) return;
      if (isCoach) refreshRoster();
      if (selId) { const p = await sGet("pitcher:" + selId); if (p) setData(p); }
    }, 30000);
    return () => clearInterval(t);
  }, [saving, openDayKey, manage, selId, isCoach]);

  async function loadPitcher(id) {
    const entry = roster.find((x) => x.id === id);
    const stored = await sGet("pitcher:" + id);
    const p = stored || newPitcher(id, entry ? entry.name : "Pitcher");
    if (!p.months) p.months = {};
    setData(p); setOpenDayKey(null);
  }

  function persist(next) {
    setSaving(true); clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await sSet("pitcher:" + next.id, next); setSaving(false); setSavedAt(Date.now());
    }, 550);
  }
  function update(mut) {
    touch();
    setData((prev) => { const n = structuredClone(prev); mut(n); persist(n); return n; });
  }

  const grid = useMemo(() => buildGrid(cursor.y, cursor.m), [cursor]);
  const weeksOfMonth = useMemo(() => {
    if (!data) return [];
    const seen = new Map();
    grid.forEach((d) => { if (d.getMonth() === cursor.m && inRange(d)) seen.set(keyOf(weekStart(d)), weekStart(d)); });
    return [...seen.values()].sort((a, b) => a - b);
  }, [grid, cursor, data]);
  const stats = useMemo(() => computeStats(data, now), [data, now]);

  const atStart = cursor.y === START.getFullYear() && cursor.m === START.getMonth();
  const atEnd = cursor.y === END.getFullYear() && cursor.m === END.getMonth();
  const stepMonth = (dir) => { touch(); setCursor((c) => { let m = c.m + dir, y = c.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } return { y, m }; }); };

  function rename(name) {
    if (!isCoach) return;
    saveRoster(roster.map((x) => (x.id === selId ? { ...x, name } : x)));
    update((p) => { p.name = name; });
  }

  return (
    <>
      {/* header */}
      <header className="pt-header">
        <div className="pt-brand">
          <WildcatLogo />
          <div><h1>SUNY POLY BASEBALL</h1><p>May 31 ’26 → Jun 1 ’27</p></div>
        </div>
        <div className="pt-headright">
          <span className={"pt-who " + session.role}>
            {isCoach ? <><ShieldCheck size={13} /> Coach</> : <><User size={13} /> {session.name}</>}
          </span>
          {isCoach && <button className="pt-sync" onClick={() => setManage(true)}><Settings2 size={14} /> Manage</button>}
          <button className={"pt-sync" + (mainTab === "leaderboard" ? " active-sync" : "")} onClick={() => setMainTab(t => t === "leaderboard" ? "tracker" : "leaderboard")}>
            <Trophy size={14} /> Leaderboard
          </button>
          <span className="pt-saveind">{saving ? "Saving…" : savedAt ? "Saved" : ""}</span>
          <button className="pt-sync" onClick={onLogout}><LogOut size={14} /> Sign out</button>
        </div>
      </header>

      {/* tabs (coach) or single chip (player) */}
      {isCoach && mainTab === "tracker" ? (
        <div className="pt-tabs">
          {roster.map((p) => (
            <button key={p.id} className={"pt-tab" + (p.id === selId ? " active" : "")}
              onClick={() => { touch(); setSelId(p.id); }}>{p.name}</button>
          ))}
          {roster.length === 0 && <span className="pt-cardsub">No players yet — open “Manage” to add your staff.</span>}
        </div>
      ) : null}

      {mainTab === "leaderboard" ? (
        <Leaderboard roster={roster} now={now} />
      ) : !data ? (
        <div className="pt-empty">
          {isCoach ? <><h2>Add your staff</h2><p>Open “Manage” to add pitchers and set their passwords.</p></>
            : <p>Loading your calendar…</p>}
        </div>
      ) : (
        <div className="pt-grid2">
          {/* LEFT */}
          <aside className="pt-side">
            <div className="pt-namerow">
              {isCoach
                ? <input className="pt-name" value={data.name} onChange={(e) => rename(e.target.value)} />
                : <div className="pt-name static">{data.name}</div>}
            </div>

            <div className="pt-statrow">
              <div className="pt-stat"><Flame size={15} /><b>{stats.streak}</b><span>day streak</span></div>
              <div className="pt-stat"><ClipboardList size={15} /><b>{stats.weekPct}%</b><span>this week</span></div>
            </div>

            <Section icon={<Target size={14} />} title="Season Goals">
              <Field label="My goal (next year)" value={data.personalGoal}
                onChange={(v) => update((p) => { p.personalGoal = v; })}
                placeholder="e.g. Add 3 mph, sub-3.00 ERA…" />
              <Field label="Team goal (next year)" value={data.teamGoal}
                onChange={(v) => update((p) => { p.teamGoal = v; })}
                placeholder="e.g. Win the conference…" />
            </Section>

            <Section title="3 Daily Goals" sub="The reps that get you there">
              {data.dailyGoals.map((g, i) => (
                <div className="pt-dg" key={i}>
                  <span>{i + 1}</span>
                  <input value={g} placeholder={`Daily goal ${i + 1}`}
                    onChange={(e) => update((p) => { p.dailyGoals[i] = e.target.value; })} />
                </div>
              ))}
            </Section>

            <Section title="Daily Habit Checklist"
              right={isCoach && <button className="pt-mini" onClick={() => setShowHabits((s) => !s)}>
                <Settings2 size={13} /> {showHabits ? "Done" : "Edit"}</button>}>
              <ul className="pt-hablist">
                {CORE_HABITS.map((h) => (
                  <li key={h.id} className="core">
                    <span className="pt-hab-lock">🔒</span>
                    {h.label}
                    {(h.type === "nutrition" || h.type === "energy" || h.type === "mental") && <span className="pt-hab-badge">1–5 rating</span>}
                    {h.type === "game" && <span className="pt-hab-badge">+ notes</span>}
                  </li>
                ))}
                {(data.customHabits || []).map((h, i) => (
                  showHabits ? (
                    <li key={h.id} className="pt-habrow-inline">
                      <input value={h.label} onChange={(e) => update((p) => { p.customHabits[i].label = e.target.value; })} />
                      <button onClick={() => update((p) => { p.customHabits = p.customHabits.filter((x) => x.id !== h.id); })}><X size={14} /></button>
                    </li>
                  ) : (
                    <li key={h.id}>{h.label}</li>
                  )
                ))}
              </ul>
              {showHabits && (
                <button className="pt-addhab" onClick={() => update((p) => { (p.customHabits ||= []).push({ id: uid(), label: "New habit", type: "check" }); })}>
                  <Plus size={14} /> Add custom habit
                </button>
              )}
              {!showHabits && (
                <button className="pt-addhab" style={{marginTop:"8px"}} onClick={() => { update((p) => { (p.customHabits ||= []).push({ id: uid(), label: "New habit", type: "check" }); }); setShowHabits(true); }}>
                  <Plus size={14} /> Add custom habit
                </button>
              )}
            </Section>
          </aside>

          {/* RIGHT */}
          <main className="pt-main">
            <div className="pt-viewswitch">
              <button className={view === "calendar" ? "on" : ""} onClick={() => setView("calendar")}><CalendarDays size={14} /> Calendar</button>
              <button className={view === "review" ? "on" : ""} onClick={() => setView("review")}><BarChart3 size={14} /> Monthly Review</button>
            </div>

            <div className="pt-calhead">
              <button className="pt-nav" disabled={atStart} onClick={() => stepMonth(-1)}><ChevronLeft size={18} /></button>
              <h2>{MONTHS[cursor.m]} {cursor.y}</h2>
              <button className="pt-nav" disabled={atEnd} onClick={() => stepMonth(1)}><ChevronRight size={18} /></button>
            </div>

            {view === "calendar" ? (
              <>
                <div className="pt-week">{WEEKDAYS.map((w) => <span key={w}>{w}</span>)}</div>
                <div className="pt-cal">
                  {grid.map((d, i) => (
                    <DayCell key={i} date={d} cursor={cursor} data={data} now={now}
                      onOpen={() => { touch(); setOpenDayKey(keyOf(d)); }} />
                  ))}
                </div>
                <div className="pt-legend">
                  <span><i className="lg open" />Open</span>
                  <span><i className="lg done" />Logged</span>
                  <span><i className="lg miss" />Missed</span>
                  <span><Lock size={11} /> Locks 48h after the day</span>
                </div>

                <h3 className="pt-wkhdr"><Pencil size={15} /> Weekly Reviews — {MONTHS[cursor.m]}</h3>
                {weeksOfMonth.map((ws) => (
                  <WeekCard key={keyOf(ws)} ws={ws} data={data} now={now} isCoach={isCoach} update={update} onTouch={touch} />
                ))}
              </>
            ) : (
              <MonthReview data={data} cursor={cursor} now={now} isCoach={isCoach} update={update} onTouch={touch} />
            )}
          </main>
        </div>
      )}

      {openDayKey && data && (
        <DayModal dateKey={openDayKey} data={data} now={now} isCoach={isCoach}
          onClose={() => setOpenDayKey(null)} update={update} onTouch={touch} />
      )}

      {manage && isCoach && (
        <ManageModal roster={roster} saveRoster={saveRoster} changeCoachPw={changeCoachPw}
          onClose={() => setManage(false)} onPicked={(id) => { setSelId(id); setManage(false); }} />
      )}
    </>
  );
}

/* ================================================================== *
 *  MANAGE MODAL (coach only)                                         *
 * ================================================================== */
function ManageModal({ roster, saveRoster, changeCoachPw, onClose, onPicked }) {
  const [name, setName] = useState(""); const [pw, setPw] = useState("");
  const [pwFor, setPwFor] = useState(null); const [pwVal, setPwVal] = useState("");
  const [coachPw, setCoachPw] = useState(""); const [coachMsg, setCoachMsg] = useState("");

  const add = async () => {
    if (!name.trim() || pw.length < 4) return;
    const id = uid();
    await saveRoster([...roster, { id, name: name.trim(), passHash: await sha(pw) }]);
    await sSet("pitcher:" + id, newPitcher(id, name.trim()));
    setName(""); setPw(""); onPicked(id);
  };
  const setPlayerPw = async (id) => {
    if (pwVal.length < 4) return;
    const h = await sha(pwVal);
    await saveRoster(roster.map((x) => (x.id === id ? { ...x, passHash: h } : x)));
    setPwFor(null); setPwVal("");
  };
  const remove = async (id) => {
    if (!window.confirm("Remove this pitcher and all their data? Can’t be undone.")) return;
    await saveRoster(roster.filter((x) => x.id !== id));
    await sDel("pitcher:" + id);
  };
  const saveCoach = async () => {
    if (coachPw.length < 4) return setCoachMsg("Min 4 characters.");
    await changeCoachPw(coachPw); setCoachPw(""); setCoachMsg("Coach password updated.");
  };

  return (
    <div className="pt-overlay" onClick={onClose}>
      <div className="pt-modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="pt-mhead"><h3><Settings2 size={17} /> Manage Staff</h3>
          <button className="pt-x" onClick={onClose}><X size={18} /></button></div>

        <div className="pt-manage-add">
          <input placeholder="New pitcher name" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="password" placeholder="Set password (4+)" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="pt-primary sm" onClick={add}><Plus size={14} /> Add</button>
        </div>

        <div className="pt-rosterlist">
          {roster.length === 0 && <p className="pt-cardsub">No players yet.</p>}
          {roster.map((p) => (
            <div className="pt-rrow" key={p.id}>
              <button className="pt-rname" onClick={() => onPicked(p.id)}>{p.name}</button>
              <span className={"pt-pwtag " + (p.passHash ? "set" : "no")}>
                <KeyRound size={11} /> {p.passHash ? "password set" : "no password"}
              </span>
              {pwFor === p.id ? (
                <span className="pt-pwedit">
                  <input type="password" autoFocus placeholder="New password" value={pwVal}
                    onChange={(e) => setPwVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setPlayerPw(p.id)} />
                  <button onClick={() => setPlayerPw(p.id)}><Check size={14} /></button>
                  <button onClick={() => { setPwFor(null); setPwVal(""); }}><X size={14} /></button>
                </span>
              ) : (
                <button className="pt-mini" onClick={() => { setPwFor(p.id); setPwVal(""); }}>Set password</button>
              )}
              <button className="pt-del sm" onClick={() => remove(p.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>

        <div className="pt-coachpw">
          <h4><ShieldCheck size={14} /> Coach password</h4>
          <div className="pt-manage-add">
            <input type="password" placeholder="New coach password" value={coachPw} onChange={(e) => setCoachPw(e.target.value)} />
            <button className="pt-primary sm" onClick={saveCoach}>Update</button>
          </div>
          {coachMsg && <p className="pt-cardsub small">{coachMsg}</p>}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== *
 *  SHARED UI                                                         *
 * ================================================================== */
function Section({ title, sub, icon, right, children }) {
  return (
    <section className="pt-section">
      <div className="pt-sechead"><h4>{icon}{title}</h4>{right}</div>
      {sub && <p className="pt-sub">{sub}</p>}
      {children}
    </section>
  );
}
function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="pt-field"><span>{label}</span>
      <textarea rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function DayCell({ date, cursor, data, now, onOpen }) {
  const otherMonth = date.getMonth() !== cursor.m;
  const status = dayStatus(date, now);
  const out = status === "out";
  const entry = data.days[keyOf(date)];
  const habits = allHabits(data);
  const done = entry ? habits.filter((h) => {
    if (h.type === "nutrition") return (entry.nutrition || 0) > 0;
    if (h.type === "game") return !!entry.game;
    return !!entry.checks?.[h.id];
  }).length : 0;
  const logged = !!entry && (done > 0 || (entry.log && entry.log.trim()));
  const isToday = keyOf(date) === keyOf(now);
  let cls = "pt-day";
  if (otherMonth || out) cls += " mute";
  if (status === "future") cls += " future";
  if (status === "open") cls += logged ? " open done" : " open";
  if (status === "locked") cls += logged ? " locked done" : " locked miss";
  if (isToday) cls += " today";
  return (
    <button className={cls} disabled={out || otherMonth} onClick={onOpen}>
      <span className="pt-dnum">{date.getDate()}</span>
      {!out && !otherMonth && status !== "future" && (
        <span className="pt-dmeta">{status === "locked" && <Lock size={10} />}
          {allHabits(data).length > 0 && <em>{done}/{allHabits(data).length}</em>}</span>
      )}
      {!out && !otherMonth && (
        <span className="pt-dots">{allHabits(data).map((h) => {
          let checked;
          if (h.type === "nutrition") checked = (entry?.nutrition || 0) > 0;
          else if (h.type === "energy") checked = (entry?.energy || 0) > 0;
          else if (h.type === "mental") checked = (entry?.mental || 0) > 0;
          else if (h.type === "game") checked = !!entry?.game;
          else checked = !!entry?.checks?.[h.id];
          return <i key={h.id} className={checked ? "on" : ""} />;
        })}</span>
      )}
    </button>
  );
}

function NutritionRating({ value, onChange, disabled }) {
  return (
    <div className="pt-nutrition-row">
      {[1,2,3,4,5].map((n) => (
        <button key={n} className={"pt-nstar" + (n <= value ? " on" : "")}
          disabled={disabled} onClick={() => onChange(n === value ? 0 : n)}>
          {n <= value ? "\u2605" : "\u2606"}
        </button>
      ))}
      <span className="pt-nstar-label">
        {value === 0 ? "Not rated" : value <= 2 ? "Poor" : value === 3 ? "OK" : value === 4 ? "Good" : "Excellent"}
      </span>
    </div>
  );
}

function DayModal({ dateKey, data, now, isCoach, onClose, update, onTouch }) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const status = dayStatus(date, now);
  const entry = data.days[dateKey] || { checks: {}, log: "", nutrition: 0, energy: 0, mental: 0, game: false, gameNotes: "" };
  const edit = isCoach ? inRange(date) : status === "open";
  const longDate = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const ensureEntry = (p) => { p.days[dateKey] ||= { checks: {}, log: "", nutrition: 0, energy: 0, mental: 0, game: false, gameNotes: "" }; };
  const toggle = (hid) => update((p) => { ensureEntry(p); p.days[dateKey].checks[hid] = !p.days[dateKey].checks[hid]; });
  const setLog = (v) => update((p) => { ensureEntry(p); p.days[dateKey].log = v; });
  const setNutrition = (v) => update((p) => { ensureEntry(p); p.days[dateKey].nutrition = v; });
  const setEnergy = (v) => update((p) => { ensureEntry(p); p.days[dateKey].energy = v; });
  const setMental = (v) => update((p) => { ensureEntry(p); p.days[dateKey].mental = v; });
  const toggleGame = () => update((p) => { ensureEntry(p); p.days[dateKey].game = !p.days[dateKey].game; });
  const setGameNotes = (v) => update((p) => { ensureEntry(p); p.days[dateKey].gameNotes = v; });

  return (
    <div className="pt-overlay" onClick={onClose}>
      <div className="pt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pt-mhead">
          <div><h3>{longDate}</h3>
            {status === "open" && <span className="pt-badge open">{fmtCountdown(addDays(sod(date), 3) - now)}</span>}
            {status === "locked" && <span className="pt-badge lock"><Lock size={11} /> Locked{isCoach ? " \u00b7 coach override" : " \u00b7 grace period ended"}</span>}
            {status === "future" && <span className="pt-badge fut">{isCoach ? "Upcoming \u00b7 coach can edit" : "Opens on the day"}</span>}
          </div>
          <button className="pt-x" onClick={onClose}><X size={18} /></button>
        </div>

        {(status === "future" && !isCoach) ? (
          <p className="pt-mnote">You can log this on {date.toLocaleDateString()} \u2014 then for 48 hours after it ends.</p>
        ) : (
          <>
            <p className="pt-modal-section-label">\ud83d\udd12 Core Habits</p>
            <div className="pt-checks">
              {CORE_HABITS.map((h) => {
                if (h.type === "nutrition") {
                  return (
                    <div key={h.id} className={"pt-check nutrition-row" + ((entry.nutrition || 0) > 0 ? " on" : "") + (!edit ? " ro" : "")}>
                      <span style={{flex:1,fontFamily:"var(--body)",fontSize:"14px"}}>{h.label}</span>
                      <NutritionRating value={entry.nutrition || 0} onChange={(v) => { onTouch(); setNutrition(v); }} disabled={!edit} />
                    </div>
                  );
                }
                if (h.type === "energy") {
                  return (
                    <div key={h.id} className={"pt-check nutrition-row" + ((entry.energy || 0) > 0 ? " on" : "") + (!edit ? " ro" : "")}>
                      <span style={{flex:1,fontFamily:"var(--body)",fontSize:"14px"}}>{h.label}</span>
                      <NutritionRating value={entry.energy || 0} onChange={(v) => { onTouch(); setEnergy(v); }} disabled={!edit} />
                    </div>
                  );
                }
                if (h.type === "mental") {
                  return (
                    <div key={h.id} className={"pt-check nutrition-row" + ((entry.mental || 0) > 0 ? " on" : "") + (!edit ? " ro" : "")}>
                      <span style={{flex:1,fontFamily:"var(--body)",fontSize:"14px"}}>{h.label}</span>
                      <NutritionRating value={entry.mental || 0} onChange={(v) => { onTouch(); setMental(v); }} disabled={!edit} />
                    </div>
                  );
                }
                if (h.type === "game") {
                  const gameOn = !!entry.game;
                  return (
                    <div key={h.id} className="pt-game-block">
                      <button className={"pt-check" + (gameOn ? " on" : "") + (edit ? "" : " ro")}
                        disabled={!edit} onClick={() => { onTouch(); toggleGame(); }}>
                        <span className="box">{gameOn && <Check size={14} strokeWidth={3} />}</span>
                        Game Day
                        {gameOn && <span className="pt-game-tag">\u26be Add game notes below</span>}
                      </button>
                      {gameOn && (
                        <label className="pt-field" style={{marginTop:"8px"}}>
                          <span>Game performance &amp; stats</span>
                          <textarea rows={3} readOnly={!edit}
                            value={entry.gameNotes || ""}
                            placeholder={edit ? "e.g. 6 IP, 2 ER, 8 K, 87 pitches \u2014 felt strong on slider\u2026" : "\u2014"}
                            onChange={(e) => { onTouch(); setGameNotes(e.target.value); }} />
                        </label>
                      )}
                    </div>
                  );
                }
                const on = !!entry.checks?.[h.id];
                return (
                  <button key={h.id} className={"pt-check" + (on ? " on" : "") + (edit ? "" : " ro")}
                    disabled={!edit} onClick={() => { onTouch(); toggle(h.id); }}>
                    <span className="box">{on && <Check size={14} strokeWidth={3} />}</span>{h.label}
                  </button>
                );
              })}
            </div>

            {(data.customHabits || []).length > 0 && (
              <>
                <p className="pt-modal-section-label" style={{marginTop:"14px"}}>\u270f\ufe0f Custom Habits</p>
                <div className="pt-checks">
                  {(data.customHabits || []).map((h) => {
                    const on = !!entry.checks?.[h.id];
                    return (
                      <button key={h.id} className={"pt-check" + (on ? " on" : "") + (edit ? "" : " ro")}
                        disabled={!edit} onClick={() => { onTouch(); toggle(h.id); }}>
                        <span className="box">{on && <Check size={14} strokeWidth={3} />}</span>{h.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <label className="pt-field" style={{marginTop:"14px"}}><span>Daily log {edit && !isCoach && "\u00b7 required each day"}</span>
              <textarea rows={3} readOnly={!edit} value={entry.log || ""}
                placeholder={edit ? "How\u2019d today go? Throwing feel, soreness, wins\u2026" : "\u2014"}
                onChange={(e) => { onTouch(); setLog(e.target.value); }} />
            </label>
            {!edit && <p className="pt-mnote locked">Locked \u2014 entries lock 48h after the day ends so the log stays honest.</p>}
          </>
        )}
      </div>
    </div>
  );
}


function WeekCard({ ws, data, now, isCoach, update, onTouch }) {
  const we = addDays(ws, 6), key = keyOf(ws), status = weekStatus(ws, now);
  const edit = isCoach ? true : status === "open";
  const w = data.weeks[key] || { well: "", bad: "", better: "", info: "" };
  const set = (f, v) => update((p) => { (p.weeks[key] ||= { well: "", bad: "", better: "", info: "" })[f] = v; });
  const range = `${ws.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${we.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  const fields = [["well", "✅ What went well"], ["bad", "⚠️ What didn’t"], ["better", "🎯 Do better next week"], ["info", "📌 Games · injuries · PRs · notes"]];
  return (
    <div className={"pt-wkcard" + (status === "locked" && !isCoach ? " locked" : "")}>
      <div className="pt-wktop"><b>Week of {range}</b>
        {status === "open" && <span className="pt-badge open sm">{fmtCountdown(addDays(we, 3) - now)}</span>}
        {status === "locked" && <span className="pt-badge lock sm"><Lock size={10} /> {isCoach ? "override" : "Locked"}</span>}
        {status === "future" && <span className="pt-badge fut sm">Upcoming</span>}
      </div>
      <div className="pt-wkfields">
        {fields.map(([f, label]) => (
          <label className="pt-field" key={f}><span>{label}</span>
            <textarea rows={2} readOnly={!edit} value={w[f] || ""} placeholder={edit ? "" : "—"}
              onChange={(e) => { onTouch(); set(f, e.target.value); }} />
          </label>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== *
 *  MONTHLY REVIEW + PROGRESS                                         *
 * ================================================================== */
function MonthReview({ data, cursor, now, isCoach, update, onTouch }) {
  const r = useMemo(() => monthAnalytics(data, cursor.y, cursor.m, now), [data, cursor, now]);
  const season = useMemo(() => seasonTrend(data, now), [data, now]);
  const mk = mKey(new Date(cursor.y, cursor.m, 1));
  const ms = monthStatus(cursor.y, cursor.m, now);
  const noteEdit = isCoach ? true : ms === "open";
  const note = data.months?.[mk]?.note || "";
  const setNote = (v) => update((p) => { (p.months ||= {})[mk] ||= {}; p.months[mk].note = v; });

  const delta = r.prevPct == null ? null : r.pct - r.prevPct;
  const maxHabit = Math.max(1, ...r.habitTotals.map((h) => h.count));

  return (
    <div className="pt-review">
      {/* Progress / "is it working" */}
      <div className="pt-progress">
        <div className="pt-bigmetric">
          <span className="pt-bmlabel">Consistency this month</span>
          <div className="pt-bmrow">
            <b>{r.pct}%</b>
            {delta != null && (
              <span className={"pt-delta " + (delta >= 0 ? "up" : "down")}>
                {delta >= 0 ? <TrendingUp size={15} /> : <TrendingDown size={15} />}
                {delta >= 0 ? "+" : ""}{delta}% vs last month
              </span>
            )}
          </div>
          <p className="pt-bmcopy">
            {delta == null
              ? "First tracked month — this becomes your baseline. Stack the days."
              : delta > 0 ? "Trending up. The work is showing — keep stacking days."
              : delta < 0 ? "Dipped from last month. Tighten the routine this week."
              : "Holding steady. Find one habit to push further."}
          </p>
        </div>
        <div className="pt-pcards">
          <div className="pt-pcard"><Flame size={16} /><b>{r.streakInMonth}</b><span>best streak in month</span></div>
          <div className="pt-pcard"><Award size={16} /><b>{r.topHabit ? r.topHabit.count : 0}×</b><span>{r.topHabit ? r.topHabit.label : "top habit"}</span></div>
          <div className="pt-pcard"><CalendarDays size={16} /><b>{r.daysLogged}/{r.daysCounted}</b><span>days logged</span></div>
        </div>
      </div>

      {/* Per-week checklist counts */}
      <h3 className="pt-wkhdr"><BarChart3 size={15} /> Check-ins per week</h3>
      <div className="pt-weekbars">
        {r.weeks.map((w, i) => {
          const max = Math.max(1, ...r.weeks.map((x) => x.checks));
          return (
            <div className="pt-wbar" key={i}>
              <span className="pt-wblabel">{w.label}</span>
              <div className="pt-wbtrack"><div className="pt-wbfill" style={{ width: `${(w.checks / max) * 100}%` }} /></div>
              <span className="pt-wbval">{w.checks} <em>· {w.daysActive}d</em></span>
            </div>
          );
        })}
      </div>

      {/* Per-habit monthly totals */}
      <h3 className="pt-wkhdr"><ClipboardList size={15} /> Times logged this month — by activity</h3>
      <div className="pt-habbars">
        {r.habitTotals.map((h) => (
          <div className="pt-hbar" key={h.id}>
            <span className="pt-hblabel">{h.label}</span>
            <div className="pt-hbtrack"><div className="pt-hbfill" style={{ width: `${(h.count / maxHabit) * 100}%` }} /></div>
            <span className="pt-hbval">{h.count}/{r.daysCounted}</span>
          </div>
        ))}
        {r.habitTotals.length === 0 && <p className="pt-cardsub">No habits to summarize.</p>}
      </div>

      {/* Season trend */}
      <h3 className="pt-wkhdr"><TrendingUp size={15} /> Season trend — consistency by month</h3>
      <div className="pt-trend">
        {season.map((s) => (
          <div className="pt-tcol" key={s.mk}>
            <div className="pt-ttrack"><div className="pt-tfill" style={{ height: `${s.pct}%` }} /></div>
            <span className="pt-tpct">{s.pct}%</span>
            <span className="pt-tlabel">{s.label}</span>
          </div>
        ))}
        {season.length === 0 && <p className="pt-cardsub">Trend appears once you’ve logged a month.</p>}
      </div>

      {/* Milestones logged */}
      {r.milestones.length > 0 && (
        <>
          <h3 className="pt-wkhdr"><Award size={15} /> Wins &amp; PRs you logged this month</h3>
          <ul className="pt-miles">{r.milestones.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </>
      )}

      {/* Monthly reflection */}
      <h3 className="pt-wkhdr"><Pencil size={15} /> Monthly reflection</h3>
      <div className={"pt-wkcard" + (ms === "locked" && !isCoach ? " locked" : "")}>
        <label className="pt-field"><span>Biggest takeaway from {MONTHS[cursor.m]} — and the focus for next month</span>
          <textarea rows={3} readOnly={!noteEdit} value={note} placeholder={noteEdit ? "" : "—"}
            onChange={(e) => { onTouch(); setNote(e.target.value); }} />
        </label>
      </div>
    </div>
  );
}

/* ================================================================== *
 *  PURE COMPUTE                                                      *
 * ================================================================== */
function buildGrid(y, m) {
  const first = new Date(y, m, 1);
  const start = addDays(first, -((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function loggedOn(data, date) {
  const e = data.days[keyOf(date)];
  if (!e) return false;
  const habits = allHabits(data);
  return habits.some((h) => {
    if (h.type === "nutrition") return (e.nutrition || 0) > 0;
    if (h.type === "energy") return (e.energy || 0) > 0;
    if (h.type === "mental") return (e.mental || 0) > 0;
    if (h.type === "game") return !!e.game;
    return !!e.checks?.[h.id];
  }) || (e.log && e.log.trim());
}
function checkCount(data, date) {
  const e = data.days[keyOf(date)];
  if (!e) return 0;
  const habits = allHabits(data);
  return habits.reduce((sum, h) => {
    if (h.type === "nutrition") return sum + ((e.nutrition || 0) > 0 ? 1 : 0);
    if (h.type === "energy") return sum + ((e.energy || 0) > 0 ? 1 : 0);
    if (h.type === "mental") return sum + ((e.mental || 0) > 0 ? 1 : 0);
    if (h.type === "game") return sum + (e.game ? 1 : 0);
    return sum + (e.checks?.[h.id] ? 1 : 0);
  }, 0);
}
function totalHabitCount(data) {
  return allHabits(data).length;
}

function computeStats(data, now) {
  if (!data) return { streak: 0, weekPct: 0 };
  const hc = Math.max(1, totalHabitCount(data));
  let streak = 0, cur = sod(now);
  if (!loggedOn(data, cur)) cur = addDays(cur, -1);
  while (inRange(cur) && loggedOn(data, cur)) { streak++; cur = addDays(cur, -1); }
  const ws = weekStart(now); let poss = 0, done = 0;
  for (let i = 0; i < 7; i++) { const d = addDays(ws, i); if (!inRange(d) || d > sod(now)) continue; poss += hc; done += checkCount(data, d); }
  return { streak, weekPct: poss ? Math.round((done / poss) * 100) : 0 };
}

function monthDaysCounted(y, m, now) {
  const last = monthLast(y, m), today = sod(now), out = [];
  for (let d = new Date(y, m, 1); d <= last; d = addDays(d, 1))
    if (inRange(d) && sod(d) <= today) out.push(new Date(d));
  return out;
}

function monthAnalytics(data, y, m, now) {
  const hc = Math.max(1, totalHabitCount(data));
  const days = monthDaysCounted(y, m, now);
  const daysCounted = days.length;
  const daysLogged = days.filter((d) => loggedOn(data, d)).length;
  let totalChecks = 0; days.forEach((d) => { totalChecks += checkCount(data, d); });
  const pct = daysCounted ? Math.round((totalChecks / (hc * daysCounted)) * 100) : 0;

  // previous month %
  const pm = m === 0 ? 11 : m - 1, py = m === 0 ? y - 1 : y;
  let prevPct = null;
  if (new Date(py, pm, 1) >= new Date(START.getFullYear(), START.getMonth(), 1)) {
    const pd = monthDaysCounted(py, pm, now);
    if (pd.length) { const phc = Math.max(1, totalHabitCount(data)); let tc = 0; pd.forEach((d) => tc += checkCount(data, d)); prevPct = Math.round((tc / (phc * pd.length)) * 100); }
  }

  // habit totals
  const habitTotals = allHabits(data).map((h) => {
    let count;
    if (h.type === "nutrition") count = days.filter((d) => (data.days[keyOf(d)]?.nutrition || 0) > 0).length;
    else if (h.type === "energy") count = days.filter((d) => (data.days[keyOf(d)]?.energy || 0) > 0).length;
    else if (h.type === "mental") count = days.filter((d) => (data.days[keyOf(d)]?.mental || 0) > 0).length;
    else if (h.type === "game") count = days.filter((d) => !!data.days[keyOf(d)]?.game).length;
    else count = days.filter((d) => data.days[keyOf(d)]?.checks?.[h.id]).length;
    return { id: h.id, label: h.label, count };
  });
  const topHabit = habitTotals.slice().sort((a, b) => b.count - a.count)[0] || null;

  // per-week
  const wmap = new Map();
  days.forEach((d) => { const k = keyOf(weekStart(d)); if (!wmap.has(k)) wmap.set(k, { ws: weekStart(d), checks: 0, daysActive: 0 }); const o = wmap.get(k); o.checks += checkCount(data, d); if (loggedOn(data, d)) o.daysActive++; });
  const weeks = [...wmap.values()].sort((a, b) => a.ws - b.ws).map((o) => ({ label: o.ws.toLocaleDateString(undefined, { month: "short", day: "numeric" }), checks: o.checks, daysActive: o.daysActive }));

  // best streak within month
  let streakInMonth = 0, c = 0;
  days.forEach((d) => { if (loggedOn(data, d)) { c++; streakInMonth = Math.max(streakInMonth, c); } else c = 0; });

  // milestones from weekly info/well within this month
  const milestones = [];
  const seenKeys = new Set();
  days.forEach((d) => {
    const wk = keyOf(weekStart(d)); if (seenKeys.has(wk)) return; seenKeys.add(wk);
    const w = data.weeks[wk];
    if (w?.info && w.info.trim()) milestones.push(w.info.trim());
  });

  return { pct, prevPct, habitTotals, topHabit, weeks, daysCounted, daysLogged, streakInMonth, milestones };
}

function seasonTrend(data, now) {
  const hc = Math.max(1, totalHabitCount(data)), out = [];
  let y = START.getFullYear(), m = START.getMonth();
  const today = sod(now);
  while (new Date(y, m, 1) <= new Date(END.getFullYear(), END.getMonth(), 1)) {
    if (new Date(y, m, 1) <= today) {
      const days = monthDaysCounted(y, m, now);
      if (days.length) {
        let tc = 0; days.forEach((d) => tc += checkCount(data, d));
        out.push({ mk: `${y}-${m}`, label: MONTHS_SH[m], pct: Math.round((tc / (hc * days.length)) * 100) });
      }
    }
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

/* ================================================================== *
 *  LEADERBOARD                                                       *
 * ================================================================== */
function Leaderboard({ roster, now }) {
  const [allData, setAllData] = useState(null);
  const [sortHabit, setSortHabit] = useState(null); // null = overall

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        roster.map(async (p) => {
          const d = await sGet("pitcher:" + p.id);
          return d ? { ...d, name: p.name } : newPitcher(p.id, p.name);
        })
      );
      setAllData(entries);
    })();
  }, [roster]);

  const rankings = useMemo(() => {
    if (!allData || allData.length === 0) return { overall: [], habits: [] };

    // Collect all habit labels across all pitchers (use first pitcher's habits as reference)
    const habitRef = allData[0]?.habits || [];

    // Season-to-date days
    const today = sod(now);
    const days = [];
    for (let d = new Date(START); sod(d) <= today; d = addDays(d, 1)) {
      if (inRange(d)) days.push(new Date(d));
    }

    const overall = allData.map((p) => {
      const hc = Math.max(1, totalHabitCount(p));
      let total = 0;
      days.forEach((d) => { total += checkCount(p, d); });
      const pct = days.length ? Math.round((total / (hc * days.length)) * 100) : 0;
      const streak = (() => {
        let s = 0, cur = sod(now);
        if (!loggedOn(p, cur)) cur = addDays(cur, -1);
        while (inRange(cur) && loggedOn(p, cur)) { s++; cur = addDays(cur, -1); }
        return s;
      })();
      return { name: p.name, pct, streak };
    }).sort((a, b) => b.pct - a.pct);

    // Per-habit breakdown — match habits by label across pitchers
    const allLabels = [...new Set(allData.flatMap((p) => allHabits(p).map((h) => h.label)))];
    const habits = allLabels.map((label) => {
      // find the habit type from any pitcher that has it
      const htype = allData.flatMap((p) => allHabits(p)).find((h) => h.label === label)?.type || "check";
      const rows = allData.map((p) => {
        const h = allHabits(p).find((x) => x.label === label);
        if (!h) return { name: p.name, pct: 0 };
        let count;
        if (h.type === "nutrition") count = days.filter((d) => (p.days[keyOf(d)]?.nutrition || 0) > 0).length;
        else if (h.type === "energy") count = days.filter((d) => (p.days[keyOf(d)]?.energy || 0) > 0).length;
        else if (h.type === "mental") count = days.filter((d) => (p.days[keyOf(d)]?.mental || 0) > 0).length;
        else if (h.type === "game") count = days.filter((d) => !!p.days[keyOf(d)]?.game).length;
        else count = days.filter((d) => p.days[keyOf(d)]?.checks?.[h.id]).length;
        const pct = days.length ? Math.round((count / days.length) * 100) : 0;
        return { name: p.name, pct };
      }).sort((a, b) => b.pct - a.pct);
      return { label, rows };
    });

    return { overall, habits };
  }, [allData, now]);

  const activeHabits = sortHabit === null ? null : rankings.habits.find((h) => h.label === sortHabit);
  const displayRanking = activeHabits
    ? activeHabits.rows
    : rankings.overall;

  const rankIcon = (i) => {
    if (i === 0) return <Crown size={14} style={{ color: "#ffd700" }} />;
    if (i === 1) return <Medal size={14} style={{ color: "#c0c0c0" }} />;
    if (i === 2) return <Medal size={14} style={{ color: "#cd7f32" }} />;
    return <span className="pt-lb-rank">#{i + 1}</span>;
  };

  if (!allData) {
    return <div className="pt-empty"><p>Loading leaderboard…</p></div>;
  }
  if (roster.length === 0) {
    return <div className="pt-empty"><h2>No players yet</h2><p>Add pitchers via Manage to see the leaderboard.</p></div>;
  }

  const today = sod(now);
  const daysSinceStart = Math.max(1, Math.round((today - sod(START)) / 86400000) + 1);

  return (
    <div className="pt-lb-root">
      {/* hero header */}
      <div className="pt-lb-hero">
        <div className="pt-lb-hero-icon"><Trophy size={28} /></div>
        <div>
          <h2>Team Leaderboard</h2>
          <p>Season-to-date consistency · {daysSinceStart} days tracked</p>
        </div>
      </div>

      {/* habit filter pills */}
      <div className="pt-lb-pills">
        <button className={"pt-lb-pill" + (sortHabit === null ? " on" : "")} onClick={() => setSortHabit(null)}>
          <Users size={12} /> Overall
        </button>
        {rankings.habits.map((h) => (
          <button key={h.label} className={"pt-lb-pill" + (sortHabit === h.label ? " on" : "")}
            onClick={() => setSortHabit(sortHabit === h.label ? null : h.label)}>
            {h.label.length > 24 ? h.label.slice(0, 22) + "…" : h.label}
          </button>
        ))}
      </div>

      {/* ranking */}
      <div className="pt-lb-board">
        <div className="pt-lb-boardhead">
          <span>{sortHabit ? `📋 ${sortHabit}` : "🏆 Overall Consistency"}</span>
          <span>Season %</span>
        </div>
        {displayRanking.map((row, i) => (
          <div key={row.name} className={"pt-lb-row" + (i === 0 ? " gold" : i === 1 ? " silver" : i === 2 ? " bronze" : "")}>
            <div className="pt-lb-pos">{rankIcon(i)}</div>
            <div className="pt-lb-name">{row.name}</div>
            <div className="pt-lb-bar-wrap">
              <div className="pt-lb-bar-track">
                <div className="pt-lb-bar-fill" style={{ width: `${row.pct}%`, animationDelay: `${i * 80}ms` }} />
              </div>
            </div>
            <div className="pt-lb-pct">{row.pct}<span>%</span></div>
            {sortHabit === null && (
              <div className="pt-lb-streak">
                <Flame size={11} style={{ color: row.streak > 0 ? "#ff8a3d" : "var(--mut)" }} />
                <span>{row.streak}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* habit grid — only when showing overall */}
      {sortHabit === null && rankings.habits.length > 0 && (
        <>
          <h3 className="pt-wkhdr"><ClipboardList size={15} /> Habit-by-habit breakdown — click to sort</h3>
          <div className="pt-lb-habitgrid">
            {rankings.habits.map((h) => {
              const leader = h.rows[0];
              const avg = h.rows.length ? Math.round(h.rows.reduce((s, r) => s + r.pct, 0) / h.rows.length) : 0;
              return (
                <button key={h.label} className="pt-lb-habitcard" onClick={() => setSortHabit(h.label)}>
                  <div className="pt-lb-hc-label">{h.label}</div>
                  <div className="pt-lb-hc-leader">
                    <Crown size={11} style={{ color: "#ffd700" }} />
                    <span>{leader?.name || "—"}</span>
                    <b>{leader?.pct ?? 0}%</b>
                  </div>
                  <div className="pt-lb-hc-footer">
                    <span>Team avg</span>
                    <div className="pt-lb-hc-avgbar">
                      <div style={{ width: `${avg}%` }} />
                    </div>
                    <b>{avg}%</b>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}


function Style() {
  return (
    <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Oswald:wght@500;600;700&family=Space+Mono:wght@400;700&display=swap');
    .pt-root{
      --bg:#0a0e13;--bg2:#0d1219;--panel:#121a23;--panel2:#172230;--line:#202d3a;--line2:#2b3b4c;
      --txt:#e8eef4;--mut:#8b99a8;--mut2:#5d6b7b;--accent:#ffb020;--accent2:#ff8a3d;
      --good:#36d6a0;--bad:#ff5d6c;--lock:#4a586b;
      --disp:'Oswald',sans-serif;--body:'Archivo',sans-serif;--mono:'Space Mono',monospace;
      font-family:var(--body);color:var(--txt);min-height:100vh;padding:22px clamp(14px,4vw,40px) 60px;
      background:radial-gradient(900px 500px at 12% -8%,rgba(255,176,32,.10),transparent 60%),
        radial-gradient(800px 600px at 100% 0%,rgba(54,214,160,.07),transparent 55%),
        linear-gradient(180deg,var(--bg),var(--bg2));background-attachment:fixed;}
    .pt-root *{box-sizing:border-box;}
    .spin{animation:sp 1s linear infinite;}@keyframes sp{to{transform:rotate(360deg);}}

    .pt-brand{display:flex;align-items:center;gap:14px;}
    .pt-brand.center{justify-content:center;margin-bottom:22px;}
    .pt-logo{width:46px;height:46px;border-radius:13px;display:grid;place-items:center;overflow:hidden;box-shadow:0 6px 20px rgba(245,168,0,.35);}
    .pt-brand h1{font-family:var(--disp);font-weight:700;font-size:clamp(14px,2.2vw,22px);letter-spacing:1.5px;margin:0;line-height:1.1;max-width:280px;}
    .pt-brand p{margin:4px 0 0;color:var(--mut);font-size:12.5px;letter-spacing:.4px;}

    /* gate */
    .pt-gate{max-width:430px;margin:6vh auto 0;}
    .pt-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:24px;}
    .pt-card h2{display:flex;align-items:center;gap:9px;font-family:var(--disp);font-weight:600;letter-spacing:.6px;font-size:19px;margin:0 0 8px;}
    .pt-cardsub{color:var(--mut);font-size:13px;line-height:1.5;margin:0 0 16px;}
    .pt-cardsub.small{font-size:12px;margin:14px 0 0;}
    .pt-card input,.pt-card select{width:100%;background:var(--bg2);border:1px solid var(--line);border-radius:10px;
      color:var(--txt);font-family:var(--body);font-size:14px;padding:12px 13px;outline:none;margin-bottom:11px;}
    .pt-card input:focus,.pt-card select:focus{border-color:var(--accent);}
    .pt-roletoggle{display:flex;gap:8px;margin-bottom:16px;}
    .pt-roletoggle button{flex:1;display:flex;align-items:center;justify-content:center;gap:7px;font-family:var(--disp);
      letter-spacing:.6px;font-size:14px;text-transform:uppercase;color:var(--mut);background:var(--bg2);
      border:1px solid var(--line);border-radius:10px;padding:11px;cursor:pointer;}
    .pt-roletoggle button.on{color:#16202c;background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent;}
    .pt-primary{width:100%;font-family:var(--disp);font-weight:600;letter-spacing:.8px;text-transform:uppercase;font-size:15px;
      color:#16202c;background:linear-gradient(135deg,var(--accent),var(--accent2));border:0;padding:13px;border-radius:11px;cursor:pointer;}
    .pt-primary.sm{width:auto;padding:10px 16px;font-size:13px;display:inline-flex;align-items:center;gap:6px;}
    .pt-primary:disabled{opacity:.6;}
    .pt-err{background:rgba(255,93,108,.12);border:1px solid rgba(255,93,108,.4);color:#ffd2d6;padding:9px 12px;border-radius:9px;font-size:13px;margin-bottom:11px;}

    /* header */
    .pt-header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:18px;}
    .pt-headright{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
    .pt-who{display:flex;align-items:center;gap:6px;font-family:var(--disp);letter-spacing:.6px;font-size:13px;text-transform:uppercase;
      padding:7px 12px;border-radius:9px;border:1px solid var(--line2);}
    .pt-who.coach{color:var(--accent);background:rgba(255,176,32,.1);border-color:rgba(255,176,32,.3);}
    .pt-who.player{color:var(--good);background:rgba(54,214,160,.1);border-color:rgba(54,214,160,.3);}
    .pt-saveind{font-family:var(--mono);font-size:11px;color:var(--mut);min-width:48px;}
    .pt-sync{display:flex;align-items:center;gap:7px;font-weight:600;font-size:12.5px;color:var(--txt);
      background:var(--panel);border:1px solid var(--line2);padding:8px 13px;border-radius:9px;cursor:pointer;}
    .pt-sync:hover{border-color:var(--accent);}
    .pt-sync.active-sync{color:#16202c;background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent;}
    .pt-warn{background:rgba(255,93,108,.1);border:1px solid rgba(255,93,108,.4);color:#ffd2d6;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:16px;}

    .pt-tabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:20px;border-bottom:1px solid var(--line);padding-bottom:14px;}
    .pt-tab{font-family:var(--disp);font-weight:600;letter-spacing:.6px;font-size:14px;text-transform:uppercase;color:var(--mut);
      background:var(--panel);border:1px solid var(--line);padding:9px 16px;border-radius:10px;cursor:pointer;transition:.15s;}
    .pt-tab:hover{color:var(--txt);border-color:var(--line2);}
    .pt-tab.active{color:#16202c;background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent;box-shadow:0 5px 16px rgba(255,138,61,.28);}

    .pt-empty{text-align:center;padding:60px 20px;color:var(--mut);}
    .pt-empty h2{font-family:var(--disp);letter-spacing:1px;color:var(--txt);font-size:24px;margin:0 0 8px;}

    .pt-grid2{display:grid;grid-template-columns:340px 1fr;gap:22px;align-items:start;}
    @media(max-width:860px){.pt-grid2{grid-template-columns:1fr;}}
    .pt-side{display:flex;flex-direction:column;gap:14px;}
    .pt-namerow{display:flex;gap:8px;align-items:center;}
    .pt-name{flex:1;font-family:var(--disp);font-weight:700;font-size:21px;letter-spacing:.8px;background:var(--panel);
      border:1px solid var(--line);border-radius:11px;color:var(--txt);padding:11px 14px;outline:none;}
    .pt-name.static{background:transparent;border-color:transparent;padding-left:0;}
    .pt-name:focus{border-color:var(--accent);}
    .pt-del{background:var(--panel);border:1px solid var(--line);color:var(--mut);border-radius:11px;padding:11px;cursor:pointer;}
    .pt-del.sm{padding:8px;border-radius:8px;}
    .pt-del:hover{color:var(--bad);border-color:var(--bad);}
    .pt-statrow{display:flex;gap:10px;}
    .pt-stat{flex:1;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:8px;color:var(--accent);}
    .pt-stat b{font-family:var(--mono);font-size:21px;color:var(--txt);}
    .pt-stat span{color:var(--mut);font-size:11px;margin-left:auto;text-align:right;line-height:1.2;}

    .pt-section{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:15px;}
    .pt-sechead{display:flex;justify-content:space-between;align-items:center;}
    .pt-section h4{display:flex;align-items:center;gap:7px;font-family:var(--disp);font-weight:600;letter-spacing:.8px;text-transform:uppercase;font-size:13.5px;margin:0;color:var(--accent);}
    .pt-sub{color:var(--mut);font-size:11.5px;margin:3px 0 0;}
    .pt-field{display:block;margin-top:11px;}
    .pt-field span{display:block;font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.6px;margin-bottom:5px;}
    .pt-field textarea{width:100%;resize:vertical;background:var(--bg2);border:1px solid var(--line);border-radius:9px;color:var(--txt);font-family:var(--body);font-size:13.5px;padding:9px 11px;outline:none;line-height:1.45;}
    .pt-field textarea:focus{border-color:var(--accent);}
    .pt-field textarea[readonly]{color:var(--mut);opacity:.7;}
    .pt-dg{display:flex;align-items:center;gap:9px;margin-top:9px;}
    .pt-dg span{width:24px;height:24px;flex:none;border-radius:7px;display:grid;place-items:center;font-family:var(--mono);font-size:12px;color:var(--accent);background:rgba(255,176,32,.12);border:1px solid rgba(255,176,32,.3);}
    .pt-dg input{flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:8px;color:var(--txt);font-family:var(--body);font-size:13.5px;padding:8px 10px;outline:none;}
    .pt-dg input:focus{border-color:var(--accent);}
    .pt-mini{display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--mut);background:var(--bg2);border:1px solid var(--line);border-radius:7px;padding:5px 9px;cursor:pointer;font-family:var(--body);}
    .pt-mini:hover{color:var(--accent);border-color:var(--accent);}
    .pt-hablist{margin:11px 0 0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:7px;}
    .pt-hablist li{font-size:13px;color:var(--txt);padding-left:18px;position:relative;}
    .pt-hablist li:before{content:"";position:absolute;left:0;top:6px;width:7px;height:7px;border-radius:2px;background:var(--accent);}
    .pt-habedit{margin-top:11px;display:flex;flex-direction:column;gap:7px;}
    .pt-habrow{display:flex;gap:6px;}
    .pt-habrow input{flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:8px;color:var(--txt);font-family:var(--body);font-size:13px;padding:7px 9px;outline:none;}
    .pt-habrow button{background:var(--bg2);border:1px solid var(--line);color:var(--mut);border-radius:8px;cursor:pointer;padding:0 8px;}
    .pt-habrow button:hover{color:var(--bad);border-color:var(--bad);}
    .pt-addhab{display:flex;align-items:center;gap:6px;justify-content:center;color:var(--accent);background:transparent;border:1px dashed var(--line2);border-radius:8px;padding:8px;cursor:pointer;font-family:var(--body);font-size:13px;}

    .pt-main{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:18px;}
    .pt-viewswitch{display:flex;gap:8px;margin-bottom:16px;}
    .pt-viewswitch button{display:flex;align-items:center;gap:7px;font-family:var(--disp);letter-spacing:.6px;font-size:13px;text-transform:uppercase;color:var(--mut);background:var(--bg2);border:1px solid var(--line);border-radius:9px;padding:9px 15px;cursor:pointer;}
    .pt-viewswitch button.on{color:#16202c;background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent;}
    .pt-calhead{display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:14px;}
    .pt-calhead h2{font-family:var(--disp);font-weight:600;letter-spacing:1.5px;text-transform:uppercase;font-size:20px;margin:0;min-width:200px;text-align:center;}
    .pt-nav{background:var(--bg2);border:1px solid var(--line);color:var(--txt);border-radius:10px;padding:8px;cursor:pointer;display:grid;place-items:center;}
    .pt-nav:hover:not(:disabled){border-color:var(--accent);color:var(--accent);}
    .pt-nav:disabled{opacity:.3;cursor:not-allowed;}
    .pt-week{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px;}
    .pt-week span{text-align:center;font-family:var(--disp);font-size:11px;letter-spacing:1px;color:var(--mut);text-transform:uppercase;}
    .pt-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;}
    .pt-day{position:relative;aspect-ratio:1/1;background:var(--bg2);border:1px solid var(--line);border-radius:10px;display:flex;flex-direction:column;align-items:flex-start;padding:7px 8px;cursor:pointer;transition:.13s;overflow:hidden;}
    .pt-day:hover:not(:disabled){transform:translateY(-2px);border-color:var(--accent);}
    .pt-day:disabled{cursor:default;}
    .pt-day.mute{opacity:.22;}.pt-day.future{opacity:.5;}
    .pt-dnum{font-family:var(--mono);font-size:14px;color:var(--txt);}
    .pt-day.today{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);}
    .pt-day.open{border-color:var(--line2);}
    .pt-day.open.done{border-color:var(--good);background:rgba(54,214,160,.07);}
    .pt-day.locked{background:rgba(255,255,255,.015);}
    .pt-day.locked.done{border-color:rgba(54,214,160,.35);background:rgba(54,214,160,.05);}
    .pt-day.locked.miss{border-color:rgba(255,93,108,.3);background:rgba(255,93,108,.05);}
    .pt-dmeta{position:absolute;top:6px;right:7px;display:flex;align-items:center;gap:4px;color:var(--mut);}
    .pt-dmeta em{font-family:var(--mono);font-size:9.5px;font-style:normal;}
    .pt-dmeta svg{color:var(--lock);}
    .pt-dots{margin-top:auto;display:flex;flex-wrap:wrap;gap:3px;}
    .pt-dots i{width:6px;height:6px;border-radius:50%;background:var(--line2);}
    .pt-dots i.on{background:var(--good);}
    .pt-legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:14px;padding-top:13px;border-top:1px solid var(--line);font-size:11.5px;color:var(--mut);}
    .pt-legend span{display:flex;align-items:center;gap:6px;}
    .pt-legend .lg{width:11px;height:11px;border-radius:3px;display:inline-block;border:1px solid var(--line2);}
    .pt-legend .lg.open{background:var(--bg2);}
    .pt-legend .lg.done{background:rgba(54,214,160,.5);border-color:var(--good);}
    .pt-legend .lg.miss{background:rgba(255,93,108,.4);border-color:var(--bad);}


    /* core habit panel styles */
    .pt-hablist li.core{color:var(--mut);font-size:12.5px;}
    .pt-hab-lock{font-size:10px;margin-right:4px;opacity:.6;}
    .pt-hab-badge{display:inline-block;font-family:var(--mono);font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(255,176,32,.15);color:var(--accent);border:1px solid rgba(255,176,32,.3);margin-left:6px;vertical-align:middle;}
    .pt-habrow-inline{display:flex;gap:6px;list-style:none;padding-left:0;}
    .pt-habrow-inline input{flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:8px;color:var(--txt);font-family:var(--body);font-size:13px;padding:6px 9px;outline:none;}
    .pt-habrow-inline button{background:var(--bg2);border:1px solid var(--line);color:var(--mut);border-radius:8px;cursor:pointer;padding:0 8px;}
    .pt-habrow-inline button:hover{color:var(--bad);}

    /* day modal section labels */
    .pt-modal-section-label{font-family:var(--disp);font-size:11px;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);margin:0 0 7px;}

    /* nutrition rating */
    .pt-check.nutrition-row{cursor:default;flex-direction:row;align-items:center;gap:10px;}
    .pt-nutrition-row{display:flex;align-items:center;gap:4px;}
    .pt-nstar{background:none;border:none;font-size:20px;cursor:pointer;color:var(--accent);padding:0 2px;line-height:1;transition:.1s;}
    .pt-nstar:disabled{cursor:default;opacity:.5;}
    .pt-nstar.on{color:#ffd700;text-shadow:0 0 8px rgba(255,215,0,.5);}
    .pt-nstar-label{font-family:var(--mono);font-size:11px;color:var(--mut);margin-left:6px;min-width:58px;}

    /* game day block */
    .pt-game-block{display:flex;flex-direction:column;gap:0;}
    .pt-game-tag{margin-left:auto;font-family:var(--mono);font-size:10px;color:var(--accent);background:rgba(255,176,32,.12);padding:2px 7px;border-radius:5px;}

    /* leaderboard */
    .pt-lb-root{max-width:860px;}
    .pt-lb-hero{display:flex;align-items:center;gap:16px;margin-bottom:22px;}
    .pt-lb-hero-icon{width:56px;height:56px;border-radius:15px;background:linear-gradient(135deg,#ffd700,var(--accent));display:grid;place-items:center;color:#16202c;box-shadow:0 8px 24px rgba(255,176,32,.35);flex:none;}
    .pt-lb-hero h2{font-family:var(--disp);font-weight:700;font-size:26px;letter-spacing:1.5px;margin:0;line-height:1;}
    .pt-lb-hero p{margin:4px 0 0;color:var(--mut);font-size:12.5px;letter-spacing:.4px;}
    .pt-lb-pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px;}
    .pt-lb-pill{display:flex;align-items:center;gap:6px;font-family:var(--body);font-size:12.5px;color:var(--mut);background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:6px 13px;cursor:pointer;transition:.13s;}
    .pt-lb-pill:hover{border-color:var(--line2);color:var(--txt);}
    .pt-lb-pill.on{color:#16202c;background:linear-gradient(135deg,var(--accent),var(--accent2));border-color:transparent;}
    .pt-lb-board{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;margin-bottom:28px;}
    .pt-lb-boardhead{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:var(--bg2);border-bottom:1px solid var(--line);font-family:var(--disp);font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:var(--mut);}
    .pt-lb-row{display:flex;align-items:center;gap:12px;padding:13px 18px;border-bottom:1px solid var(--line);transition:.15s;}
    .pt-lb-row:last-child{border-bottom:none;}
    .pt-lb-row:hover{background:rgba(255,255,255,.02);}
    .pt-lb-row.gold{background:rgba(255,215,0,.05);}
    .pt-lb-row.silver{background:rgba(192,192,192,.04);}
    .pt-lb-row.bronze{background:rgba(205,127,50,.04);}
    .pt-lb-pos{width:28px;flex:none;display:flex;align-items:center;justify-content:center;}
    .pt-lb-rank{font-family:var(--mono);font-size:11px;color:var(--mut);}
    .pt-lb-name{font-family:var(--disp);font-weight:600;letter-spacing:.5px;font-size:15px;color:var(--txt);width:120px;flex:none;}
    @media(max-width:560px){.pt-lb-name{width:80px;font-size:13px;}}
    .pt-lb-bar-wrap{flex:1;}
    .pt-lb-bar-track{height:12px;background:var(--bg2);border:1px solid var(--line);border-radius:6px;overflow:hidden;}
    .pt-lb-bar-fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:6px;animation:lb-grow .6s ease both;}
    @keyframes lb-grow{from{width:0!important;}to{}}
    .pt-lb-pct{font-family:var(--mono);font-size:16px;color:var(--txt);width:52px;text-align:right;flex:none;}
    .pt-lb-pct span{font-size:11px;color:var(--mut);}
    .pt-lb-streak{display:flex;align-items:center;gap:4px;font-family:var(--mono);font-size:11px;color:var(--mut);width:36px;flex:none;}
    .pt-lb-habitgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:28px;}
    .pt-lb-habitcard{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:14px;text-align:left;cursor:pointer;transition:.15s;display:flex;flex-direction:column;gap:10px;}
    .pt-lb-habitcard:hover{border-color:var(--accent);transform:translateY(-2px);}
    .pt-lb-hc-label{font-size:12.5px;color:var(--txt);line-height:1.35;font-weight:500;}
    .pt-lb-hc-leader{display:flex;align-items:center;gap:6px;font-size:12px;}
    .pt-lb-hc-leader span{color:var(--mut);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
    .pt-lb-hc-leader b{font-family:var(--mono);color:var(--accent);font-size:13px;}
    .pt-lb-hc-footer{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--mut);}
    .pt-lb-hc-avgbar{flex:1;height:5px;background:var(--bg2);border-radius:3px;overflow:hidden;}
    .pt-lb-hc-avgbar div{height:100%;background:linear-gradient(90deg,var(--good),#2ea88a);border-radius:3px;}
    .pt-lb-hc-footer b{font-family:var(--mono);font-size:11px;color:var(--good);}

    .pt-wkhdr{display:flex;align-items:center;gap:8px;font-family:var(--disp);font-weight:600;letter-spacing:1px;text-transform:uppercase;font-size:15px;color:var(--accent);margin:24px 0 12px;}
    .pt-wkcard{background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:14px;margin-bottom:12px;}
    .pt-wkcard.locked{opacity:.78;}
    .pt-wktop{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
    .pt-wktop b{font-family:var(--disp);letter-spacing:.6px;font-size:14px;}
    .pt-wkfields{display:grid;grid-template-columns:1fr 1fr;gap:11px;}
    @media(max-width:560px){.pt-wkfields{grid-template-columns:1fr;}}

    .pt-badge{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono);font-size:11px;padding:4px 9px;border-radius:7px;}
    .pt-badge.sm{font-size:10px;padding:3px 7px;}
    .pt-badge.open{background:rgba(255,176,32,.13);color:var(--accent);border:1px solid rgba(255,176,32,.3);}
    .pt-badge.lock{background:rgba(74,88,107,.2);color:var(--mut);border:1px solid var(--line2);}
    .pt-badge.fut{background:rgba(139,153,168,.12);color:var(--mut);border:1px solid var(--line);}

    /* review */
    .pt-progress{display:grid;grid-template-columns:1.2fr 1fr;gap:14px;}
    @media(max-width:640px){.pt-progress{grid-template-columns:1fr;}}
    .pt-bigmetric{background:linear-gradient(135deg,rgba(255,176,32,.1),rgba(255,138,61,.05));border:1px solid rgba(255,176,32,.25);border-radius:14px;padding:16px;}
    .pt-bmlabel{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--mut);}
    .pt-bmrow{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:4px 0 8px;}
    .pt-bmrow b{font-family:var(--mono);font-size:40px;color:var(--txt);line-height:1;}
    .pt-delta{display:flex;align-items:center;gap:5px;font-family:var(--mono);font-size:12px;padding:4px 9px;border-radius:8px;}
    .pt-delta.up{color:var(--good);background:rgba(54,214,160,.12);}
    .pt-delta.down{color:var(--bad);background:rgba(255,93,108,.12);}
    .pt-bmcopy{font-size:12.5px;color:var(--mut);line-height:1.5;margin:0;}
    .pt-pcards{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;}
    @media(max-width:640px){.pt-pcards{grid-template-columns:1fr 1fr 1fr;}}
    .pt-pcard{background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:13px 10px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:4px;color:var(--accent);}
    .pt-pcard b{font-family:var(--mono);font-size:20px;color:var(--txt);}
    .pt-pcard span{font-size:10px;color:var(--mut);line-height:1.25;}

    .pt-weekbars{display:flex;flex-direction:column;gap:9px;}
    .pt-wbar{display:flex;align-items:center;gap:11px;}
    .pt-wblabel{font-family:var(--mono);font-size:11px;color:var(--mut);width:62px;flex:none;}
    .pt-wbtrack{flex:1;height:14px;background:var(--bg2);border:1px solid var(--line);border-radius:7px;overflow:hidden;}
    .pt-wbfill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:7px;transition:width .4s;}
    .pt-wbval{font-family:var(--mono);font-size:12px;color:var(--txt);width:70px;text-align:right;flex:none;}
    .pt-wbval em{color:var(--mut);font-style:normal;font-size:10px;}

    .pt-habbars{display:flex;flex-direction:column;gap:9px;}
    .pt-hbar{display:flex;align-items:center;gap:11px;}
    .pt-hblabel{font-size:12.5px;color:var(--txt);width:150px;flex:none;}
    @media(max-width:560px){.pt-hblabel{width:110px;font-size:11.5px;}}
    .pt-hbtrack{flex:1;height:14px;background:var(--bg2);border:1px solid var(--line);border-radius:7px;overflow:hidden;}
    .pt-hbfill{height:100%;background:linear-gradient(90deg,var(--good),#2ea88a);border-radius:7px;transition:width .4s;}
    .pt-hbval{font-family:var(--mono);font-size:12px;color:var(--mut);width:54px;text-align:right;flex:none;}

    .pt-trend{display:flex;align-items:flex-end;gap:8px;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:16px 14px;overflow-x:auto;}
    .pt-tcol{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:42px;flex:1;}
    .pt-ttrack{width:26px;height:110px;background:rgba(255,255,255,.03);border-radius:6px;display:flex;align-items:flex-end;overflow:hidden;}
    .pt-tfill{width:100%;background:linear-gradient(180deg,var(--accent),var(--accent2));border-radius:6px 6px 0 0;transition:height .4s;}
    .pt-tpct{font-family:var(--mono);font-size:10px;color:var(--txt);}
    .pt-tlabel{font-family:var(--disp);font-size:11px;letter-spacing:.5px;color:var(--mut);text-transform:uppercase;}

    .pt-miles{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px;}
    .pt-miles li{background:var(--bg2);border:1px solid var(--line);border-left:3px solid var(--good);border-radius:9px;padding:10px 13px;font-size:13px;color:var(--txt);white-space:pre-wrap;}

    /* modal */
    .pt-overlay{position:fixed;inset:0;background:rgba(5,8,11,.7);backdrop-filter:blur(4px);display:grid;place-items:center;padding:18px;z-index:50;}
    .pt-modal{width:min(520px,100%);max-height:88vh;overflow:auto;background:var(--panel2);border:1px solid var(--line2);border-radius:18px;padding:20px;box-shadow:0 30px 80px rgba(0,0,0,.6);animation:pop .18s ease;}
    .pt-modal.wide{width:min(580px,100%);}
    @keyframes pop{from{transform:scale(.96);opacity:0;}to{transform:scale(1);opacity:1;}}
    .pt-mhead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:16px;}
    .pt-mhead h3{display:flex;align-items:center;gap:8px;font-family:var(--disp);font-weight:600;letter-spacing:.5px;font-size:18px;margin:0 0 7px;}
    .pt-x{background:var(--bg2);border:1px solid var(--line);color:var(--mut);border-radius:9px;padding:7px;cursor:pointer;}
    .pt-x:hover{color:var(--txt);border-color:var(--line2);}
    .pt-checks{display:flex;flex-direction:column;gap:8px;margin-bottom:14px;}
    .pt-check{display:flex;align-items:center;gap:11px;text-align:left;font-family:var(--body);font-size:14px;color:var(--txt);background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:11px 13px;cursor:pointer;transition:.13s;}
    .pt-check:hover:not(.ro){border-color:var(--accent);}
    .pt-check .box{width:21px;height:21px;flex:none;border-radius:6px;border:1.5px solid var(--line2);display:grid;place-items:center;color:#16202c;}
    .pt-check.on{border-color:var(--good);background:rgba(54,214,160,.1);}
    .pt-check.on .box{background:var(--good);border-color:var(--good);}
    .pt-check.ro{opacity:.7;cursor:default;}
    .pt-mnote{font-size:12.5px;color:var(--mut);margin:6px 0 0;line-height:1.5;}
    .pt-mnote.locked{color:var(--lock);margin-top:12px;}

    /* manage */
    .pt-manage-add{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;}
    .pt-manage-add input{flex:1;min-width:130px;background:var(--bg2);border:1px solid var(--line);border-radius:9px;color:var(--txt);font-family:var(--body);font-size:13.5px;padding:10px 12px;outline:none;}
    .pt-manage-add input:focus{border-color:var(--accent);}
    .pt-rosterlist{display:flex;flex-direction:column;gap:8px;margin-bottom:18px;}
    .pt-rrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:9px 11px;}
    .pt-rname{font-family:var(--disp);letter-spacing:.5px;font-size:14px;color:var(--txt);background:none;border:0;cursor:pointer;flex:1;text-align:left;}
    .pt-rname:hover{color:var(--accent);}
    .pt-pwtag{display:flex;align-items:center;gap:4px;font-family:var(--mono);font-size:10px;padding:3px 7px;border-radius:6px;}
    .pt-pwtag.set{color:var(--good);background:rgba(54,214,160,.1);}
    .pt-pwtag.no{color:var(--bad);background:rgba(255,93,108,.1);}
    .pt-pwedit{display:flex;gap:5px;align-items:center;}
    .pt-pwedit input{background:var(--panel);border:1px solid var(--line2);border-radius:7px;color:var(--txt);font-family:var(--body);font-size:12.5px;padding:7px 9px;outline:none;width:130px;}
    .pt-pwedit button{background:var(--panel);border:1px solid var(--line);color:var(--mut);border-radius:7px;cursor:pointer;padding:6px;}
    .pt-pwedit button:hover{color:var(--accent);}
    .pt-coachpw{border-top:1px solid var(--line);padding-top:14px;}
    .pt-coachpw h4{display:flex;align-items:center;gap:7px;font-family:var(--disp);letter-spacing:.6px;text-transform:uppercase;font-size:13px;color:var(--accent);margin:0 0 10px;}
    `}</style>
  );
}
