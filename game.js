/* Firebase nạp NỀN: nếu CDN bị chặn / mất mạng / cấu hình lỗi thì game vẫn chạy (điểm lưu trên máy). */
let fbFailed = false;
let FB = { enabled: false, topScores: async () => [], submitScore: async () => null, fetchMe: async () => null };

/* ============ Hằng số & tiện ích ============ */
const W = 420, H = 700, GROUND_Y = 610;
const GRAV = 1650, FLAP = -500, MAX_FALL = 720;
const BIRD_X = 110, BIRD_R = 12, PIPE_W = 74, SPACING = 235;
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cv = $("c"), ctx = cv.getContext("2d");

const store = {
  get(k, d) { try { const v = localStorage.getItem("ibf_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ibf_" + k, JSON.stringify(v)); } catch {} }
};
let profile = store.get("profile", null);            // { acc, name }
let best = 0, plays = 0, soundOn = store.get("sound", true);
const saveBest = () => profile && store.set("best:" + profile.acc, best);
function loadProfileData() { best = profile ? store.get("best:" + profile.acc, 0) : 0; plays = profile ? store.get("plays:" + profile.acc, 0) : 0; }
loadProfileData();

function resize() {
  const r = window.devicePixelRatio || 1, b = cv.getBoundingClientRect();
  cv.width = Math.round(b.width * r); cv.height = Math.round(b.height * r);
}
addEventListener("resize", resize); resize();

/* ============ Âm thanh ============ */
let ac;
function beep(f, d = 0.08, type = "sine", v = 0.12, slide = 0) {
  if (!soundOn) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = type; o.frequency.value = f;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), ac.currentTime + d);
    gn.gain.value = v; gn.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d);
    o.connect(gn); gn.connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
  } catch {}
}

/* ============ Chủ đề theo điểm ============ */
// [top RGB, bottom RGB, cột đá RGB, mặt đất RGB, —, độ sáng sao]
const THEMES = [
  [90, 170, 255, 205, 235, 255, 122, 98, 78, 96, 72, 52, 0],       // 0–9   : trời xanh
  [255, 120, 90, 255, 205, 130, 112, 78, 92, 84, 56, 70, 0.1],     // 10–24 : hoàng hôn
  [15, 20, 60, 50, 60, 120, 70, 76, 112, 46, 52, 84, 1],           // 25–49 : đêm
  [40, 10, 80, 130, 40, 150, 92, 58, 130, 62, 36, 100, 1]          // 50+   : thiên hà
];
const themeOf = s => (s < 10 ? 0 : s < 25 ? 1 : s < 50 ? 2 : 3);
let th = THEMES[0].slice();
const rgb = (a, i, k = 1) => `rgb(${(a[i] * k) | 0},${(a[i + 1] * k) | 0},${(a[i + 2] * k) | 0})`;

const stars = Array.from({ length: 70 }, () => ({ x: rand(0, W), y: rand(0, H * 0.7), s: rand(1, 2.4), p: rand(0, 6) }));
const clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 90 + rand(0, 40), y: rand(60, 360), r: rand(18, 34), k: rand(0.04, 0.12) }));
const islands = Array.from({ length: 4 }, (_, i) => ({ x: i * 150, y: rand(140, 420), w: rand(50, 96), k: rand(0.12, 0.22) }));

/* ============ Sprite đại bàng bay pixel-art (24×20, 3 khung vỗ cánh) ============ */
const BODY = [
"........................","........................","........................","..............KKKK......",
".............KWWWWK.....","............KWWWWWWK....","............KWWWAEWYYK..","............KWWWWWWYYYK.",
"............KWWWWWWYOK..","...........KKWWWWWKK....","........KKKBBBKWWWKBBK..","......KKBBBBBBBKKBBBBK..",
"....KKBBLBBBBBBBBBBBBK..","..KKWGBBBBBBBBBBBBBBK...",".KWWGGKBBBBBBBBBBBBK....","KWWGGK.KBBBBBBBBBK......",
".KGGK...KKBBBBBKK.......",".........KYYK.KYYK......",".........KKK..KKK.......","........................"];
const WINGS = [
 ["....KK..................","...KBBK.................","..KBLBBK................","..KBLLBBK...............","...KBLLBBK..............",
  "...KBBLLBBK.............","....KBBLBBBK............",".....KBBLBBBK...........","......KBBBBBBK..........",
  "......KBBLBBBBK.........",".....KKBBBBBBBBK........"],                                                  // cánh giơ lên
 [null,null,null,null,null,null,null,null,"..KKK...................",".KBBBKKK................",
  "KBLLBBBBKK..............","KBLLLBBBBBK.............",".KBBBBBBBBBK............"],                                     // cánh ngang
 [null,null,null,null,null,null,null,null,null,null,null,"........KBBBK...........","......KBBLBBBK..........",
  "....KBBLLBBBBK..........","...KBBLLBBBBK...........","..KBBLBBBBK.............","..KBLBBBK...............",
  "...KBBBK................","....KKK................."]];                                                    // cánh hạ xuống
const PAL = { K: "#2a1a10", B: "#6b3f1f", L: "#a5662f", W: "#f4f4f4", G: "#c8cddc", Y: "#f2b632", O: "#e08a1e", A: "#e8a020", E: "#111111" };
function makeFrame(f) {
  const grid = BODY.map(r => r.padEnd(24, ".").split(""));
  WINGS[f].forEach((r, y) => { if (r) r.padEnd(24, ".").split("").forEach((ch, x) => { if (ch !== ".") grid[y][x] = ch; }); });
  const c = document.createElement("canvas"); c.width = 24; c.height = 20;
  const x = c.getContext("2d");
  grid.forEach((row, y) => row.forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, y, 1, 1); } }));
  return c;
}
const EAGLE = [0, 1, 2].map(makeFrame);               // 0 = cánh lên, 1 = ngang, 2 = hạ
$("eagleBig").getContext("2d").drawImage(EAGLE[1], 0, 0);

/* ============ Trạng thái game ============ */
const g = { state: "menu", bird: null, pipes: [], score: 0, scroll: 0, wingT: 0, shake: 0, flash: 0, deadT: 0, hitGround: false };
let t = 0;

function reset() {
  g.bird = { y: 320, vy: 0 };
  g.pipes = []; g.score = 0; g.scroll = 0; g.wingT = 0; g.shake = 0; g.flash = 0; g.deadT = 0; g.hitGround = false;
  $("score").textContent = "0"; $("msg").textContent = "";
}
const diff = () => Math.min(g.score / 40, 1);
const speed = () => 150 + diff() * 75;

function spawnPipe() {
  const d = diff(), gapH = 188 - d * 46;                // 188 → 142
  const prev = g.pipes[g.pipes.length - 1];
  const lo = 70 + gapH / 2, hi = GROUND_Y - 70 - gapH / 2;
  let gapY = rand(lo, hi);
  if (prev) gapY = clamp(gapY, prev.gapY - 170, prev.gapY + 170);   // luôn vượt được
  gapY = clamp(gapY, lo, hi);
  g.pipes.push({ x: prev ? prev.x + SPACING : W + 60, gapY, gapH, passed: false });
}

function say(txt) { const m = $("msg"); m.textContent = txt; m.classList.remove("pop"); void m.offsetWidth; m.classList.add("pop"); }

/* ============ Điều khiển ============ */
function flap() {
  g.bird.vy = FLAP; g.wingT = 0.3;
  beep(480, 0.12, "triangle", 0.1, 260);
}
function tap() {
  if (g.state === "ready") { g.state = "playing"; $("hint").classList.add("hidden"); spawnPipe(); flap(); }
  else if (g.state === "playing") flap();
}
const NOPASSIVE = { passive: false };
cv.addEventListener("touchstart", e => { e.preventDefault(); tap(); }, NOPASSIVE);
cv.addEventListener("touchmove", e => e.preventDefault(), NOPASSIVE);
cv.addEventListener("mousedown", e => { e.preventDefault(); tap(); });
addEventListener("contextmenu", e => e.preventDefault());
addEventListener("keydown", e => {
  if (/INPUT/.test(document.activeElement.tagName)) return;
  if (["Space", "ArrowUp", "KeyW"].includes(e.code) && !e.repeat) { e.preventDefault(); tap(); }
});

/* ============ Cập nhật ============ */
function hitsPipe(p) {
  const b = g.bird, r = BIRD_R;
  const top = p.gapY - p.gapH / 2, bot = p.gapY + p.gapH / 2;
  const rects = [[p.x, -50, PIPE_W, top + 50], [p.x, bot, PIPE_W, H],            // thân cột
                 [p.x - 5, top - 22, PIPE_W + 10, 22], [p.x - 5, bot, PIPE_W + 10, 22]]; // mũ cột
  return rects.some(([rx, ry, rw, rh]) => {
    const cx = clamp(BIRD_X, rx, rx + rw), cy = clamp(b.y, ry, ry + rh);
    return (BIRD_X - cx) ** 2 + (b.y - cy) ** 2 < r * r;
  });
}

function die(ground) {
  if (g.state !== "playing") return;
  g.state = "dying"; g.deadT = 0; g.shake = 8; g.flash = 1;
  g.hitGround = ground;
  if (!ground) g.bird.vy = Math.min(g.bird.vy, 0) - 120;
  beep(200, 0.25, "sawtooth", 0.14, -120);
}

function update(dt) {
  t += dt;
  const target = THEMES[themeOf(g.score)];
  for (let i = 0; i < th.length; i++) th[i] += (target[i] - th[i]) * Math.min(1, dt * 2);
  g.shake = Math.max(0, g.shake - dt * 30);
  g.flash = Math.max(0, g.flash - dt * 4);
  g.wingT = Math.max(0, g.wingT - dt);

  if (g.state === "ready" || g.state === "menu") {
    g.scroll += 60 * dt;
    if (g.state === "ready") {
      g.bird.y = 320 + Math.sin(t * 5) * 9;
      if (Math.floor(t * 2.2) !== Math.floor((t - dt) * 2.2)) g.wingT = 0.3;
    }
  }
  else if (g.state === "playing") {
    const sp = speed();
    g.scroll += sp * dt;
    const b = g.bird;
    b.vy = Math.min(MAX_FALL, b.vy + GRAV * dt);
    b.y += b.vy * dt;
    if (b.y < BIRD_R) { b.y = BIRD_R; b.vy = Math.max(0, b.vy); }

    for (const p of g.pipes) p.x -= sp * dt;
    const last = g.pipes[g.pipes.length - 1];
    if (last && last.x <= W + 60 - SPACING) spawnPipe();
    while (g.pipes.length && g.pipes[0].x + PIPE_W < -20) g.pipes.shift();

    for (const p of g.pipes) {
      if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
        p.passed = true; g.score++; $("score").textContent = g.score;
        beep(g.score % 10 === 0 ? 1100 : 760, 0.14, "sine", 0.13);
        if (g.score % 10 === 0) say(`Tuyệt vời! ${g.score} cột`);
      }
      if (hitsPipe(p)) { die(false); break; }
    }
    if (g.state === "playing" && b.y > GROUND_Y - BIRD_R) { b.y = GROUND_Y - BIRD_R; die(true); }
  }
  else if (g.state === "dying") {
    g.deadT += dt;
    const b = g.bird;
    b.vy = Math.min(MAX_FALL + 200, b.vy + GRAV * 1.1 * dt);
    b.y += b.vy * dt;
    if (b.y >= GROUND_Y - 8) { b.y = GROUND_Y - 8; b.vy = 0; if (g.shake < 1 && !g.hitGround) { g.shake = 4; } g.hitGround = true; }
    if (g.hitGround && g.deadT > 0.55) gameOver();
  }
}

/* ============ Vẽ ============ */
function drawPipe(p) {
  const top = p.gapY - p.gapH / 2, bot = p.gapY + p.gapH / 2;
  const body = rgb(th, 6), dark = rgb(th, 6, 0.72), light = rgb(th, 6, 1.18);
  const piece = (y, h, capTop) => {
    ctx.fillStyle = body; ctx.fillRect(p.x, y, PIPE_W, h);
    ctx.fillStyle = light; ctx.fillRect(p.x + 6, y, 8, h);          // mặt sáng
    ctx.fillStyle = dark; ctx.fillRect(p.x + PIPE_W - 12, y, 12, h);  // mặt tối
    for (let k = 0; k < h; k += 34) { ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fillRect(p.x + 18, y + k + 10, 22, 4); } // vân đá
    const cy = capTop ? y : y + h - 22;
    ctx.fillStyle = body; ctx.fillRect(p.x - 5, cy, PIPE_W + 10, 22);
    ctx.fillStyle = capTop ? "#5aa845" : dark; ctx.fillRect(p.x - 5, capTop ? cy : cy + 14, PIPE_W + 10, capTop ? 8 : 8);
    ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(p.x - 5, cy, PIPE_W + 10, 3);
  };
  piece(-50, top + 50, false);      // cột trên (mũ ở đầu dưới)
  piece(bot, H - bot, true);        // cột dưới (mũ cỏ ở đầu trên)
}

function drawBird() {
  const b = g.bird;
  let frame = 1;
  if (g.wingT > 0) { const p = 1 - g.wingT / 0.3; frame = p < 0.34 ? 0 : p < 0.67 ? 1 : 2; }
  if (g.state === "dying") frame = 2;
  const ang = g.state === "ready" ? 0 : clamp(b.vy / 650, -0.45, 1.25);
  ctx.save();
  ctx.translate(BIRD_X, b.y); ctx.rotate(ang);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(EAGLE[frame], -12 * 2 - 2, -11 * 2, 24 * 2, 20 * 2);
  ctx.restore();
}

function draw() {
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  const gr = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
  gr.addColorStop(0, rgb(th, 0)); gr.addColorStop(1, rgb(th, 3));
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);

  if (th[12] > 0.02) {
    ctx.fillStyle = "#fff";
    for (const s of stars) { ctx.globalAlpha = th[12] * (0.45 + 0.55 * Math.sin(t * 2 + s.p)); ctx.fillRect(s.x, s.y, s.s, s.s); }
  }
  ctx.globalAlpha = 0.5 * (1 - Math.min(1, th[12]));
  ctx.fillStyle = "#fff";
  for (const c of clouds) {
    const x = (((c.x - g.scroll * c.k) % (W + 160)) + (W + 160)) % (W + 160) - 80;
    ctx.beginPath(); ctx.ellipse(x, c.y, c.r * 1.8, c.r, 0, 0, 7); ctx.ellipse(x + c.r, c.y - c.r * 0.5, c.r, c.r * 0.8, 0, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 0.45;                                       // đảo đá bay phía xa (như trong ảnh nhân vật)
  for (const i of islands) {
    const x = (((i.x - g.scroll * i.k) % (W + 220)) + (W + 220)) % (W + 220) - 110, y = i.y + Math.sin(t * 0.8 + i.x) * 4;
    ctx.fillStyle = rgb(th, 6, 0.8);
    ctx.beginPath(); ctx.moveTo(x - i.w / 2, y); ctx.lineTo(x + i.w / 2, y); ctx.lineTo(x + i.w * 0.12, y + i.w * 0.7); ctx.lineTo(x - i.w * 0.1, y + i.w * 0.55); ctx.fill();
    ctx.fillStyle = "#5aa845"; ctx.fillRect(x - i.w / 2, y - 4, i.w, 6);
  }
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate((Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);
  for (const p of g.pipes) drawPipe(p);

  // mặt đất cuộn
  ctx.fillStyle = rgb(th, 9); ctx.fillRect(-10, GROUND_Y, W + 20, H - GROUND_Y + 10);
  ctx.fillStyle = "#5aa845"; ctx.fillRect(-10, GROUND_Y, W + 20, 14);
  ctx.fillStyle = "#468a35";
  const off = -(g.scroll % 28);
  for (let x = off - 28; x < W + 28; x += 28) ctx.fillRect(x, GROUND_Y + 8, 14, 6);
  ctx.fillStyle = "rgba(0,0,0,.14)";
  for (let x = off - 40; x < W + 40; x += 40) ctx.fillRect(x, GROUND_Y + 34, 20, 5);
  ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(-10, GROUND_Y, W + 20, 2);

  if (g.bird) drawBird();
  ctx.restore();

  if (g.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${g.flash * 0.8})`; ctx.fillRect(0, 0, W, H); }
}

/* ============ Vòng lặp ============ */
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try { update(dt); draw(); }
  catch (e) { console.error(e); const d = $("dbg"); if (d) d.textContent = "Lỗi game: " + e.message; }
}

/* ============ Giao diện ============ */
const show = id => $(id).classList.remove("hidden");
const hide = id => $(id).classList.add("hidden");

function refreshLabels() {
  $("menuBest").textContent = best;
  $("overBest").textContent = best;
  $("userInfo").textContent = profile ? `Xin chào, ${profile.name} (@${profile.acc})` : "";
  $("btnAuth").textContent = "👤 Đổi người chơi";
  $("btnSound").textContent = `${soundOn ? "🔊" : "🔇"} Âm thanh: ${soundOn ? "bật" : "tắt"}`;
}

function startGame() {
  hide("menu"); hide("over"); hide("login"); show("hud"); show("hint"); $("hint").classList.remove("hidden");
  reset(); g.state = "ready";
}
function goHome() { hide("over"); hide("hud"); hide("hint"); hide("login"); reset(); g.state = "menu"; show("menu"); refreshLabels(); }
function goLogin() {
  if (profile) { $("lgAcc").value = profile.acc; $("lgName").value = profile.name; }
  hide("menu"); hide("over"); hide("hud"); hide("hint"); $("loginErr").textContent = ""; reset(); g.state = "menu"; show("login");
}

async function gameOver() {
  g.state = "over";
  plays++; if (profile) store.set("plays:" + profile.acc, plays);
  const isNew = g.score > best;
  if (isNew) { best = g.score; saveBest(); }
  $("overScore").textContent = g.score;
  $("overNew").textContent = isNew && g.score > 0 ? "🎉 Kỷ lục mới!" : "";
  refreshLabels();
  hide("hud"); hide("hint"); show("over");
  if (profile && g.score > 0) {
    try { await FB.submitScore(profile.acc, profile.name, g.score); } catch (e) { console.warn("Không gửi được điểm:", e); }
  }
}

$("btnPlay").onclick = startGame;
$("btnReplay").onclick = startGame;
$("btnHome").onclick = goHome;
$("btnSound").onclick = () => { soundOn = !soundOn; store.set("sound", soundOn); refreshLabels(); beep(600); };

/* --- Bảng xếp hạng --- */
let lbKind = "all";
function openLb() { show("lb"); loadLb(lbKind); }
async function loadLb(kind) {
  lbKind = kind;
  $("tabAll").classList.toggle("on", kind === "all");
  $("tabWeek").classList.toggle("on", kind === "week");
  const ul = $("lbList"), note = $("lbNote");
  ul.innerHTML = ""; note.textContent = "";
  if (!FB.enabled) { note.textContent = fbFailed ? "Không tải được Firebase (kiểm tra mạng)." : "Chưa cấu hình Firebase (xem firebase-config.js)."; return; }
  note.textContent = "Đang tải…";
  try {
    const rows = await FB.topScores(kind, 20);
    note.textContent = rows.length ? "" : "Chưa có ai trên bảng xếp hạng.";
    rows.forEach((r, i) => {
      const mine = profile && profile.acc === r.id;
      const li = document.createElement("li"); if (mine) li.className = "me";
      const a = document.createElement("span"); a.className = "rk"; a.textContent = i + 1;
      const b = document.createElement("span"); b.className = "nm"; b.textContent = r.name + (mine ? " (Bạn)" : "");
      const c = document.createElement("span"); c.className = "sc"; c.textContent = r.score;
      li.append(a, b, c); ul.append(li);
    });
  } catch (e) {
    console.warn(e);
    note.textContent = kind === "week" ? "Không tải được. Có thể cần tạo index Firestore (xem Console trình duyệt)." : "Không tải được bảng xếp hạng.";
  }
}
$("btnLbMenu").onclick = openLb;
$("btnLbOver").onclick = openLb;
$("lbClose").onclick = () => hide("lb");
$("tabAll").onclick = () => loadLb("all");
$("tabWeek").onclick = () => loadLb("week");

/* --- Nhập tên để chơi (không mật khẩu, không đăng nhập) --- */
const ACC_RE = /^[A-Za-z0-9_]{3,20}$/;
function enter() {
  const err = $("loginErr"); err.textContent = "";
  const acc = $("lgAcc").value.trim().toLowerCase(), name = $("lgName").value.trim().slice(0, 20);
  if (!ACC_RE.test(acc)) { err.textContent = "Tên tài khoản 3–20 ký tự: chữ không dấu, số hoặc dấu _"; return; }
  if (!name) { err.textContent = "Hãy nhập tên hiển thị."; return; }
  profile = { acc, name }; store.set("profile", profile);
  loadProfileData();
  goHome();
  syncProfile();
}
async function syncProfile() {
  if (!profile || !FB.enabled) return;
  try {
    const r = await FB.fetchMe(profile.acc);
    const rb = r?.bestScore || 0;
    if (rb > best) { best = rb; saveBest(); }
    else if (best > rb || (r && r.name !== profile.name)) await FB.submitScore(profile.acc, profile.name, best, { countPlay: false });
    refreshLabels();
  } catch (e) { console.warn("Đồng bộ lỗi:", e); }
}
$("btnEnter").onclick = enter;
$("lgName").addEventListener("keydown", e => { if (e.key === "Enter") enter(); });
$("btnAuth").onclick = goLogin;
import("./firebase.js?v=1")
  .then(m => { FB = m; syncProfile(); refreshLabels(); })
  .catch(e => { fbFailed = true; console.warn("Không nạp được Firebase:", e); });

/* ============ Khởi động ============ */
reset(); refreshLabels();
if (profile) goHome();
requestAnimationFrame(loop);
window.__ibReady = true;
