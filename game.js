/* Firebase nạp NỀN: nếu CDN bị chặn / mất mạng / cấu hình lỗi thì game vẫn chạy (điểm lưu trên máy). */
let fbFailed = false;
let FB = { enabled: false, topScores: async () => [], submitScore: async () => null, fetchMe: async () => null };

/* ============ Hằng số & tiện ích ============ */
const W = 420, H = 700, GROUND_Y = 610;
const GRAV = 1650, FLAP = -500, MAX_FALL = 720;
const BIRD_X = 110, PIPE_W = 74, SPACING = 235;
const STAGE_AT = 20;                 // cứ 20 điểm tiến hóa 1 lần
const PEAR_EVO = 5;                  // mỗi quả lê = +5 điểm tiến hóa
const MAX_STAGE = 4;                 // 5 hình thái (0..4)
const SCALES = [1.8, 2.05, 2.3, 2.55, 2.85];   // hình thái càng cao càng to
const RADII  = [12, 13, 14, 15, 16];           // vùng va chạm tăng nhẹ
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const cv = $("c"), ctx = cv.getContext("2d");

const store = {
  get(k, d) { try { const v = localStorage.getItem("ibf_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ibf_" + k, JSON.stringify(v)); } catch {} }
};
let profile = store.get("profile", null);            // { acc, name }
let charId = store.get("char", "eagle");              // "eagle" | "dragon"
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
function beep(f, d = 0.08, type = "sine", v = 0.12, slide = 0, delay = 0) {
  if (!soundOn) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), gn = ac.createGain(), t0 = ac.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t0 + d);
    gn.gain.setValueAtTime(v, t0); gn.gain.exponentialRampToValueAtTime(0.001, t0 + d);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + d);
  } catch {}
}

/* ============ Chủ đề theo điểm ============ */
// [top RGB, bottom RGB, cột đá RGB, mặt đất RGB, độ sáng sao]
const THEMES = [
  [90, 170, 255, 205, 235, 255, 122, 98, 78, 96, 72, 52, 0],
  [255, 120, 90, 255, 205, 130, 112, 78, 92, 84, 56, 70, 0.1],
  [15, 20, 60, 50, 60, 120, 70, 76, 112, 46, 52, 84, 1],
  [40, 10, 80, 130, 40, 150, 92, 58, 130, 62, 36, 100, 1]
];
const themeOf = s => (s < 10 ? 0 : s < 25 ? 1 : s < 50 ? 2 : 3);
let th = THEMES[0].slice();
const rgb = (a, i, k = 1) => `rgb(${(a[i] * k) | 0},${(a[i + 1] * k) | 0},${(a[i + 2] * k) | 0})`;

const stars = Array.from({ length: 70 }, () => ({ x: rand(0, W), y: rand(0, H * 0.7), s: rand(1, 2.4), p: rand(0, 6) }));
const clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 90 + rand(0, 40), y: rand(60, 360), r: rand(18, 34), k: rand(0.04, 0.12) }));
const islands = Array.from({ length: 4 }, (_, i) => ({ x: i * 150, y: rand(140, 420), w: rand(50, 96), k: rand(0.12, 0.22) }));

/* ============ Sprite: 2 nhân vật × 5 hình thái × 3 khung vỗ cánh (28×24 pixel) ============ */
// Dữ liệu nén RLE: mỗi hàng là chuỗi "ký tự + số lần lặp", các hàng nối bằng "|". Màu theo bảng pal của từng hình thái.
const SPR = {"eagle":{"label":"Chim Ưng","icon":"🦅","names":["Ưng Non","Ưng Lửa","Ưng Sét","Ưng Hoàng Kim","Thần Ưng"],"pal":[{"K":"#2a1a10","B":"#6b3f1f","L":"#a5662f","W":"#f4f4f4","G":"#c8cddc","Y":"#f2b632","O":"#e08a1e","A":"#e8a020","E":"#111111","R":"#e8541c","F":"#ff9a2e","H":"#ffe45e"},{"K":"#2a1010","B":"#b8321a","L":"#ff7a2e","W":"#fff0d8","G":"#ffb347","Y":"#ffd23a","O":"#ff8a00","A":"#ffd400","E":"#111111","R":"#e8541c","F":"#ff9a2e","H":"#ffe45e"},{"K":"#10163a","B":"#2c4a9c","L":"#5aa8ff","W":"#eaf6ff","G":"#ffe14a","Y":"#ffd23a","O":"#ff9a00","A":"#ffe14a","E":"#111111","R":"#3a6fe0","F":"#ffe14a","H":"#ffffff"},{"K":"#4a2e08","B":"#c8921e","L":"#ffe27a","W":"#fff7d6","G":"#fff2a8","Y":"#fff6c0","O":"#ffb300","A":"#ff5a00","E":"#111111","R":"#ff8a00","F":"#ffd23a","H":"#fffbe0"},{"K":"#1c0f3a","B":"#5a2ca0","L":"#c06bff","W":"#ffffff","G":"#6cf0ff","Y":"#fff6c0","O":"#ffb300","A":"#4de1ff","E":"#111111","R":"#ff3ec8","F":"#4de1ff","H":"#ffffff"}],"stages":[[".28|.28|.28|.6K2.20|.5KB2K.19|.4KBLB2K.18|.4KBL2B2K.5K4.8|.5KBL2B2K.3KW4K.7|.5KB2L2B2K.KW6K.6|.6KB2LB3K2W3AEWY2K.4|.7KB2LB3KW6Y3K.3|.8KB6KW5YOK.4|.8KB2LB4KW3K2.6|.7K2B8KW2KB2K.4|.8K2B7K2B4K.4|.6K2B2LB12K.4|.4K2WGB14K.5|.3KW2G2KB12K.6|.2KW2G2K.KB9K.8|.3KG2K.3K2B5K2.9|.11KY2K.KY2K.8|.11K3.2K3.9|.28|.28",".28|.28|.28|.28|.28|.28|.16K4.8|.15KW4K.7|.14KW6K.6|.14KW3AEWY2K.4|.14KW6Y3K.3|.4K3.7KW6YOK.4|.3KB3K3.3K2W5K2.6|.2KBL2B4K3B3KW3KB2K.4|.2KBL3B5KB4K2B4K.4|.3KB9KB9K.4|.4K2WGB14K.5|.3KW2G2KB12K.6|.2KW2G2K.KB9K.8|.3KG2K.3K2B5K2.9|.11KY2K.KY2K.8|.11K3.2K3.9|.28|.28",".28|.28|.28|.28|.28|.28|.16K4.8|.15KW4K.7|.14KW6K.6|.14KW3AEWY2K.4|.14KW6Y3K.3|.14KW6YOK.4|.13K2W5K2.6|.10K3B3KW3KB2K.4|.8K3B3KB2K2B4K.4|.6K3B2LB3KB7K.4|.4K3B2L2B4KB6K.5|.3KWKB2L2B4KB6K.6|.2KWKB2LB4KB6K.8|.3K2BLB3K2B5K2.9|.5KB3K.KY2K.KY2K.8|.6K3.2K3.2K3.9|.28|.28"],[".28|.18K.9|.15K.KHK.K.6|.6K2.6KHK2HK2HK.5|.5KB2K.6KHKFKHK.6|.4KBLB2K.5KRKRKRK.6|.4KBL2B2K.5KR3K.7|.5KBL2B2K.3KW4K.7|.5KB2L2B2K.KW6K.6|.6KB2LB3K2W3AEWY2K.4|.7KB2LB3KW6Y3K.3|.8KB6KW5YOK.4|.8KB2LB4KW3K2.6|.7K2B8KW2KB2K.4|.8K2B7K2B4K.4|.6K2B2LB12K.4|.4K2WGB14K.5|.3KW2G2KB12K.6|.2KW2G2K.KB9K.8|.3KG2K.3K2B5K2.9|.11KY2K.KY2K.8|.11K3.2K3.9|.28|.28",".28|.18K.9|.15K.KHK.K.6|.14KHK2HK2HK.5|.15KHKFKHK.6|.15KRKRKRK.6|.16KR3K.7|.15KW4K.7|.14KW6K.6|.14KW3AEWY2K.4|.14KW6Y3K.3|.4K3.7KW6YOK.4|.3KB3K3.3K2W5K2.6|.2KBL2B4K3B3KW3KB2K.4|.2KBL3B5KB4K2B4K.4|.3KB9KB9K.4|.4K2WGB14K.5|.3KW2G2KB12K.6|.2KW2G2K.KB9K.8|.3KG2K.3K2B5K2.9|.11KY2K.KY2K.8|.11K3.2K3.9|.28|.28",".28|.18K.9|.15K.KHK.K.6|.14KHK2HK2HK.5|.15KHKFKHK.6|.15KRKRKRK.6|.16KR3K.7|.15KW4K.7|.14KW6K.6|.14KW3AEWY2K.4|.14KW6Y3K.3|.14KW6YOK.4|.13K2W5K2.6|.10K3B3KW3KB2K.4|.8K3B3KB2K2B4K.4|.6K3B2LB3KB7K.4|.4K3B2L2B4KB6K.5|.3KWKB2L2B4KB6K.6|.2KWKB2LB4KB6K.8|.3K2BLB3K2B5K2.9|.5KB3K.KY2K.KY2K.8|.6K3.2K3.2K3.9|.28|.28"],[".19K.8|.14K.3KHK.7|.13KHK.KHK.8|.6K2.6KHK.KHK.7|.5KB2K.5KFK2FK.8|.4KBLB2K.5KFK2FK.7|.4KBL2B2K.4KRKRK.8|.5KBL2B2K.3KW4K.7|.5KB2L2B2K.KW6K.6|.6KB2LB3K2W3AEWY2K.4|.7KB2LB3KW6Y3K.3|.8KB6KW5YOK.4|.8KB2LB4KW3K2.6|.7K2B2HB5KW2KB2K.4|.8K2HB6K2B4K.4|.6K2B2LHB11K.4|.4K2WGB2HB11K.5|.3KW2G2KB12K.6|.2KW2G2K.KB9K.8|.3KG2K.3K2B5K2.9|.2KR2K.5KY2K.KY2K.8|.KFK2.6K3.2K3.9|KH2K.24|.K2.25",".19K.8|.14K.3KHK.7|.13KHK.KHK.8|.14KHK.KHK.7|.14KFK2FK.8|.15KFK2FK.7|.15KRKRK.8|.15KW4K.7|.14KW6K.6|.14KW3AEWY2K.4|.14KW6Y3K.3|.4K3.7KW6YOK.4|.3KB3K3.K.K2W5K2.6|.2KBL2B4KHKB3KW3KB2K.4|.2KBL3B3HBKB4K2B4K.4|.3KB7HBKB9K.4|.4K2WGB2HB11K.5|.3KW2G2KB12K.6|.2KW2G2K.KB9K.8|.3KG2K.3K2B5K2.9|.2KR2K.5KY2K.KY2K.8|.KFK2.6K3.2K3.9|KH2K.24|.K2.25",".19K.8|.14K.3KHK.7|.13KHK.KHK.8|.14KHK.KHK.7|.14KFK2FK.8|.15KFK2FK.7|.15KRKRK.8|.15KW4K.7|.14KW6K.6|.14KW3AEWY2K.4|.14KW6Y3K.3|.14KW6YOK.4|.11K.K2W5K2.6|.10KHKB3KW3KB2K.4|.8K2HB3KB2K2B4K.4|.6K3B2HB3KB7K.4|.4K3B2LHB4KB6K.5|.3KWKB2L2B4KB6K.6|.2KWKB2LB4KB6K.8|.3K2BLB3K2B5K2.9|.2KR2KB3K.KY2K.KY2K.8|.KFK2.K3.2K3.2K3.9|KH2K.24|.K2.25"],[".16KHK.9|.16KHK.9|.15K2FK2.8|.6K2.6KHKFH2K.7|.5KB2K.5KH2RH3K.6|.4KBLB2K.4KRFR3FK.6|.4KBL2B2K.3KR6K.6|.5KBL2B2K.3KW4K.7|.5KB2L2B2K.KW6K.6|.6KB2LB3K2W3AEWY2K.4|.7KB2LB3KW6Y3K.3|.8KB6KW5YOK.4|.8KB2LB4KW3K2.6|.7K2B8KW2KB2K.4|.8K2B3FHFBK2B4K.4|.6K2B2LBRF3RB6K.4|.4K2WGB14K.5|.3KW2G2KB12K.6|.2KW2G2K.KB9K.8|.3KG2K.3K2B5K2.9|.2KR2K.5KY2K.KY2K.8|.KFK2RK.4K3.2K3.9|KH2KFK.22|.K2HK.23",".16KHK.9|.16KHK.9|.15K2FK2.8|.14KHKFH2K.7|.14KH2RH3K.6|.14KRFR3FK.6|.14KR6K.6|.15KW4K.7|.14KW6K.6|.14KW3AEWY2K.4|.14KW6Y3K.3|.4K3.7KW6YOK.4|.3KB3K3.3K2W5K2.6|.2KBL2B4K3B3KW3KB2K.4|.2KBL3B5KFHFBK2B4K.4|.3KB8RF3RB6K.4|.4K2WGB14K.5|.3KW2G2KB12K.6|.2KW2G2K.KB9K.8|.3KG2K.3K2B5K2.9|.2KR2K.5KY2K.KY2K.8|.KFK2RK.4K3.2K3.9|KH2KFK.22|.K2HK.23",".16KHK.9|.16KHK.9|.15K2FK2.8|.14KHKFH2K.7|.14KH2RH3K.6|.14KRFR3FK.6|.14KR6K.6|.15KW4K.7|.14KW6K.6|.14KW3AEWY2K.4|.14KW6Y3K.3|.14KW6YOK.4|.13K2W5K2.6|.10K3B3KW3KB2K.4|.8K3B2FHFBK2B4K.4|.6K3B2LRF3RB6K.4|.4K3B2L2B4KB6K.5|.3KWKB2L2B4KB6K.6|.2KWKB2LB4KB6K.8|.3K2BLB3K2B5K2.9|.2KR2KB3K.KY2K.KY2K.8|.KFK2RK3.2K3.2K3.9|KH2KFK.22|.K2HK.23"],[".15K.KHK.K.6|.14KHK2HK2HK.5|.13K2HK2FK2HK2.4|.6K2.4KHKFK2FK2FKHK.3|.5KB2K.3KHFKFKRKFKHK.4|.4KBLB2K.3KRKRKRKRKRK.4|.4KBL2B2K.2KRKRKRKR2K.5|.5KBL2B2K.2K2W4K2.6|.5KB2L2B2K.KW6K.6|.6KB2LB3K2W3AEWY2K.4|.7KB2LB3KW6Y3K.3|.8KB6KW5YOK.4|.8KB2LB4KW3K2.6|.7K2B8KW2KB2K.4|.8K2B3FHFBK2B4K.4|K2.4K2B2LBRF3RHB5K.4|H2K.K2WGB8FBFB3K.5|K2FKW2G2KB12K.6|.KR2WG2K.KB9K.8|.2K2G2K.3K2B5K2.9|.2KR2K.5KY2K.KY2K.8|.KFK2RK.4K3.2K3.9|KH2KFK.22|.K2HK.23",".15K.KHK.K.6|.14KHK2HK2HK.5|.13K2HK2FK2HK2.4|.12KHKFK2FK2FKHK.3|.12KHFKFKRKFKHK.4|.13KRKRKRKRKRK.4|.13KRKRKRKR2K.5|.14K2W4K2.6|.14KW6K.6|.14KW3AEWY2K.4|.14KW6Y3K.3|.4K3.7KW6YOK.4|.3KB3K3.3K2W5K2.6|.2KBL2B4K3B3KW3KB2K.4|.2KBL3B5KFHFBK2B4K.4|K2.KB8RF3RHB5K.4|H2K.K2WGB8FBFB3K.5|K2FKW2G2KB12K.6|.KR2WG2K.KB9K.8|.2K2G2K.3K2B5K2.9|.2KR2K.5KY2K.KY2K.8|.KFK2RK.4K3.2K3.9|KH2KFK.22|.K2HK.23",".15K.KHK.K.6|.14KHK2HK2HK.5|.13K2HK2FK2HK2.4|.12KHKFK2FK2FKHK.3|.12KHFKFKRKFKHK.4|.13KRKRKRKRKRK.4|.13KRKRKRKR2K.5|.14K2W4K2.6|.14KW6K.6|.14KW3AEWY2K.4|.14KW6Y3K.3|.14KW6YOK.4|.13K2W5K2.6|.10K3B3KW3KB2K.4|.8K3B2FHFBK2B4K.4|K2.4K3B2LRF3RHB5K.4|H2K.K3B2L2B4KFBFB3K.5|K2FKWKB2L2B4KB6K.6|.KR2KB2LB4KB6K.8|.2K3BLB3K2B5K2.9|.2KR2KB3K.KY2K.KY2K.8|.KFK2RK3.2K3.2K3.9|KH2KFK.22|.K2HK.23"]]},"dragon":{"label":"Rồng","icon":"🐲","names":["Rồng Con","Rồng Lửa","Rồng Băng","Rồng Vàng","Thần Long"],"pal":[{"K":"#12301c","B":"#3fae5a","L":"#d9f08a","D":"#2a7a40","M":"#7ad07a","N":"#1f5a30","Y":"#f3e9c0","A":"#ffd400","E":"#111111","W":"#ffffff","R":"#e0a030","F":"#f0c050","H":"#fff0a0"},{"K":"#2a0f0a","B":"#d6402a","L":"#ffc36b","D":"#8f2218","M":"#ff8a3d","N":"#6b1a12","Y":"#fff0c0","A":"#ffe45e","E":"#111111","W":"#ffffff","R":"#e8541c","F":"#ff9a2e","H":"#ffe45e"},{"K":"#0a1c36","B":"#2f8fd8","L":"#bfeaff","D":"#1c5a98","M":"#7fd0ff","N":"#14406e","Y":"#ffffff","A":"#ffffff","E":"#0a2a50","W":"#ffffff","R":"#3aa7ff","F":"#9be3ff","H":"#ffffff"},{"K":"#3a2606","B":"#d9a21b","L":"#fff0a8","D":"#8d6410","M":"#ffd45a","N":"#7a5208","Y":"#fffbe0","A":"#ff4a00","E":"#111111","W":"#ffffff","R":"#ff8a00","F":"#ffd23a","H":"#fffbe0"},{"K":"#1c0f3a","B":"#6a3dc8","L":"#e0c8ff","D":"#3b1f82","M":"#a56bff","N":"#2c1566","Y":"#ffffff","A":"#4de1ff","E":"#111111","W":"#ffffff","R":"#ff3ec8","F":"#4de1ff","H":"#ffffff"}],"stages":[[".3K5NK2.17|.2KNM4NM2K3.14|.3KNM4NM3NK.13|.3KN2M3NM3NK.2K.10|.4KN2M2NM3NK.KYK.K.7|.5KNM2N2M2NK.2KYKYK.6|.6KNM2NM2NK.3KYKYK2.4|.6KN2MNM2NK.2KB6K3.|.7KNMN3K.3KB3AEB2KBK|.8KNMN2K.3KB9K|.8KNK4.K2B10K|.7K3B3K2B5D2WDWDK.|.6KB13D6K.|.4K2B12K8.2|.3KB14K.9|.3KB14K.9|.3KB3L9B2K.9|.2KB4L10K.10|.2KB4L9K.11|.KB4K3Y2L2Y2K.12|.KB4K.KY2K2Y2K.12|.2KB4K.K2.2K2.13|.3KBKBK.20|.4K.K.21",".28|.28|.28|.17K.10|.16KYK.K.7|.17KYKYK.6|.18KYKYK2.4|K2.15KB6K3.|N2K2.13KB3AEB2KBK|KN3K3.10KB9K|KM3N3K2.K3.2K2B10K|KM5NK3B3K2B5D2WDWDK.|KM5KB13D6K.|KN3K2B12K8.2|.K3B14K.9|.3KB14K.9|.3KB3L9B2K.9|.2KB4L10K.10|.2KB4L9K.11|.KB4K3Y2L2Y2K.12|.KB4K.KY2K2Y2K.12|.2KB4K.K2.2K2.13|.3KBKBK.20|.4K.K.21",".28|.28|.28|.17K.10|.16KYK.K.7|.17KYKYK.6|.18KYKYK2.4|.17KB6K3.|.17KB3AEB2KBK|.17KB9K|.10K3.2K2B10K|.7K3B3K2B5D2WDWDK.|.6KB13D6K.|.4K2B12K8.2|.3KB14K.9|.3KB14K.9|.3KB3L9B2K.9|.2KB4L10K.10|.2KB4L9K.11|.KB4K3Y2L2Y2K.12|.KB4KMKY2K2Y2K.12|.2KB4KNK2M2K2.13|.3KBKBKNK5.14|.4K.K.K.19"],[".3K5NK2.17|.2KNM4NM2K3.14|.3KNM4NM3NK.13|.3KN2M3NM3NK.2K.10|.4KN2M2NM3NK.KYK.K.7|.5KNM2N2M2NK.2KYKYK.6|.6KNM2NM2NK.3KYKYK2.4|.6KN2MNM2HK.2KB6K3.|.7KNMHN2HFK.KB3AEB2KBK|.6KHKNHN2KRK.KB9K|.4K.KHFNFRK2RK2B10K|.3KHK.KRKBRBK2B5D2WDWDK.|.3KHK2BRB11D6K.|.4KRB12K8.2|.3KBRB12K.9|.3KB14K.9|.3KB3L9B2K.9|.2KB4L10K.10|.2KB4L9K.11|.KB4K3Y2L2Y2K.12|.KB4K.KY2K2Y2K.12|.2KB4K.K2.2K2.13|.3KBKBK.20|.4K.K.21",".28|.28|.28|.17K.10|.16KYK.K.7|.17KYKYK.6|.13K.4KYKYK2.4|K2.8K.KHK.2KB6K3.|N2K2.3K.KHK2HFK.KB3AEB2KBK|KN3K3HK2HK.KRK.KB9K|KM3N3HFKFRK2RK2B10K|KM3HMNKRKBRBK2B5D2WDWDK.|KM3HMKBRB11D6K.|KN3KRB12K8.2|.K3BRB12K.9|.3KB14K.9|.3KB3L9B2K.9|.2KB4L10K.10|.2KB4L9K.11|.KB4K3Y2L2Y2K.12|.KB4K.KY2K2Y2K.12|.2KB4K.K2.2K2.13|.3KBKBK.20|.4K.K.21",".28|.28|.28|.17K.10|.16KYK.K.7|.17KYKYK.6|.13K.4KYKYK2.4|.10K.KHK.2KB6K3.|.7K.KHK2HFK.KB3AEB2KBK|.6KHK2HK.KRK.KB9K|.4K.KHFKFRK2RK2B10K|.3KHK.KRKBRBK2B5D2WDWDK.|.3KHK2BRB11D6K.|.4KRB12K8.2|.3KBRB12K.9|.3KB14K.9|.3KB3L9B2K.9|.2KB4L10K.10|.2KB4L9K.11|.KB4K3Y2L2Y2K.12|.KB4KMKY2K2Y2K.12|.2KB4KNK2M2K2.13|.3KBKBKNK5.14|.4K.K.K.19"],[".3K5NK2.17|.2KNM4NM2K3.14|.3KNM4NM3NK.13|.3KN2M3NM3NK.2K.10|.4KN2M2NM3NK.KYK.K.7|.5KNM2N2M2NK.2KYKYK.6|.6KNM2NM2NK.3KYKYK2.4|.6KN2MNM2HK.2KB6K3.|.7KNMHN2HFK.KB3AEB2KBK|.6KHKNHN2KRK.KB9K|.4K.KHFNFRK2RK2B8FBK|.3KHK.KRKBRBK2B5D2WDWDFK|.3KHK2BRB11D4FDFK|.4KRB12K6FK2F|.3KBRB12K.5KFKH|.3KB14K.5KFK2|.3KB3L9B2K.6K.2|.2KB4L10K.10|.2KB4L9K.11|.KB4K3Y2L2Y2K.12|.KB4K.KY2K2Y2K.12|K2R2B3K.K2.2K2.13|H2FKBKBK.20|K3.K.K.21",".28|.28|.28|.17K.10|.16KYK.K.7|.17KYKYK.6|.13K.4KYKYK2.4|K2.8K.KHK.2KB6K3.|N2K2.3K.KHK2HFK.KB3AEB2KBK|KN3K3HK2HK.KRK.KB9K|KM3N3HFKFRK2RK2B8FBK|KM3HMNKRKBRBK2B5D2WDWDFK|KM3HMKBRB11D4FDFK|KN3KRB12K6FK2F|.K3BRB12K.5KFKH|.3KB14K.5KFK2|.3KB3L9B2K.6K.2|.2KB4L10K.10|.2KB4L9K.11|.KB4K3Y2L2Y2K.12|.KB4K.KY2K2Y2K.12|K2R2B3K.K2.2K2.13|H2FKBKBK.20|K3.K.K.21",".28|.28|.28|.17K.10|.16KYK.K.7|.17KYKYK.6|.13K.4KYKYK2.4|.10K.KHK.2KB6K3.|.7K.KHK2HFK.KB3AEB2KBK|.6KHK2HK.KRK.KB9K|.4K.KHFKFRK2RK2B8FBK|.3KHK.KRKBRBK2B5D2WDWDFK|.3KHK2BRB11D4FDFK|.4KRB12K6FK2F|.3KBRB12K.5KFKH|.3KB14K.5KFK2|.3KB3L9B2K.6K.2|.2KB4L10K.10|.2KB4L9K.11|.KB4K3Y2L2Y2K.12|.KB4KMKY2K2Y2K.12|K2R2B3KNK2M2K2.13|H2FKBKBKNK5.14|K3.K.K.K.19"],[".3K5NK2.4K.2KHK.7|.2KNM4NM2K4HK.KFK.7|.3KNM4NM3NKFK.KF2K.6|.3KN2M3NM3NK2FK.KFK.6|.4KN2M2NM3NK.KFK2FK.6|.5KNM2N2M2NK.2KFKF2K.5|.6KNM2NM2NK.3KFKFK2.4|.6KN2MNM2HK.2KB6K3.|.7KNMHN2HFK.KB3AEB2KBK|.6KHKNHN2KRK.KB9K|.4K.KHFNFRK2RK2B8FBK|.3KHK.KRKBRBK2B5D2WDWDFK|.3KHK2BRB11D4FDFK|.4KRB12K6FK2F|.3KBRB12K.5KFKH|.3KB14K.5KFK2|.3KB3L9B2K.6K.2|K.KB4L10K.10|HK2B4L9K.11|KFB4K3Y2L2Y2K.12|.KRB3K.KY2K2Y2K.12|K2R2B3K.K2.2K2.13|H2FKBKBK.20|K3.K.K.21",".15K.2KHK.7|.14KHK.KFK.7|.14KFK.KF2K.6|.15KFK.KFK.6|.16KFK2FK.6|.17KFKF2K.5|.13K.4KFKFK2.4|K2.8K.KHK.2KB6K3.|N2K2.3K.KHK2HFK.KB3AEB2KBK|KN3K3HK2HK.KRK.KB9K|KM3N3HFKFRK2RK2B8FBK|KM3HMNKRKBRBK2B5D2WDWDFK|KM3HMKBRB11D4FDFK|KN3KRB12K6FK2F|.K3BRB12K.5KFKH|.3KB14K.5KFK2|.3KB3L9B2K.6K.2|K.KB4L10K.10|HK2B4L9K.11|KFB4K3Y2L2Y2K.12|.KRB3K.KY2K2Y2K.12|K2R2B3K.K2.2K2.13|H2FKBKBK.20|K3.K.K.21",".15K.2KHK.7|.14KHK.KFK.7|.14KFK.KF2K.6|.15KFK.KFK.6|.16KFK2FK.6|.17KFKF2K.5|.13K.4KFKFK2.4|.10K.KHK.2KB6K3.|.7K.KHK2HFK.KB3AEB2KBK|.6KHK2HK.KRK.KB9K|.4K.KHFKFRK2RK2B8FBK|.3KHK.KRKBRBK2B5D2WDWDFK|.3KHK2BRB11D4FDFK|.4KRB12K6FK2F|.3KBRB12K.5KFKH|.3KB14K.5KFK2|.3KB3L9B2K.6K.2|K.KB4L10K.10|HK2B4L9K.11|KFB4K3Y2L2Y2K.12|.KRB3KMKY2K2Y2K.12|K2R2B3KNK2M2K2.13|H2FKBKBKNK5.14|K3.K.K.K.19"],[".3K5NK2.4K.2KHK.7|.2KNM4NM2K4HK.KFK.7|.3KNM4NM3NKFK.KF2K.3K.2|.3KN2M3NM3NK2FK.KFK.2KHK2|.4KN2M2NM3NK.KFK2FK.2KHKH|.5KNM2N2M2NK.2KFKF2K2FKHK|.6KNM2NM2HK.3KFKFKRKRFK|.6KN2MNM2H2K.KB5R2K2.|.7KNH2N2HF2K2B3AEB2KBK|.6KHKNHN2KR2K2B9K|.4K.KHFNF2K2RKRB8FBK|.3KHK.KRKBRBK2B5D2WDWDFK|.3KHK2BRB3RB7D4FDFK|.4KRB12K6FK2F|.3KBRB12K.5KFKH|.3KB14K.5KFK2|.3KB3L9B2K.6K.2|K.KB4L10K.10|HK2B4L9K.11|KFB4K3Y2L2Y2K.12|.KRB3K3Y2K2Y2K.12|K2R2B3R2K2.2K2.13|H2FKBKBKFH2K.16|K3.K.K.K3.17",".15K.2KHK.7|.14KHK.KFK.7|.14KFK.KF2K.3K.2|.15KFK.KFK.2KHK2|.16KFK2FK.2KHKH|.13K.3KFKF2K2FKHK|.12KHK.3KFKFKRKRFK|K2.7K2.KH2K.KB5R2K2.|N2K2.3K2H2K2HF2K2B3AEB2KBK|KN3K3HK2HK.KR2K2B9K|KM3N3HFKF2K2RKRB8FBK|KM3HMNKRKBRBK2B5D2WDWDFK|KM3HMKBRB3RB7D4FDFK|KN3KRB12K6FK2F|.K3BRB12K.5KFKH|.3KB14K.5KFK2|.3KB3L9B2K.6K.2|K.KB4L10K.10|HK2B4L9K.11|KFB4K3Y2L2Y2K.12|.KRB3K3Y2K2Y2K.12|K2R2B3R2K2.2K2.13|H2FKBKBKFH2K.16|K3.K.K.K3.17",".15K.2KHK.7|.14KHK.KFK.7|.14KFK.KF2K.3K.2|.15KFK.KFK.2KHK2|.16KFK2FK.2KHKH|.13K.3KFKF2K2FKHK|.12KHK.3KFKFKRKRFK|.9K2.KH2K.KB5R2K2.|.7K2H2K2HF2K2B3AEB2KBK|.6KHK2HK.KR2K2B9K|.4K.KHFKF2K2RKRB8FBK|.3KHK.KRKBRBK2B5D2WDWDFK|.3KHK2BRB3RB7D4FDFK|.4KRB12K6FK2F|.3KBRB12K.5KFKH|.3KB14K.5KFK2|.3KB3L9B2K.6K.2|K.KB4L10K.10|HK2B4L9K.11|KFB4K3Y2L2Y2K.12|.KRB3KMKY2K2Y2K.12|K2R2B3R2K2M2K2.13|H2FKBKBKFH2K3.14|K3.K.K.K3.17"]]}};
const decodeRow = s => { let o = "", m; const re = /([^0-9])(\d*)/g; while ((m = re.exec(s))) o += m[1].repeat(m[2] ? +m[2] : 1); return o; };
function buildCanvas(rows, pal) {
  const c = document.createElement("canvas"); c.width = rows[0].length; c.height = rows.length;
  const x = c.getContext("2d");
  rows.forEach((row, y) => [...row].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, y, 1, 1); } }));
  return c;
}
const FORMS = {};         // FORMS[char][stage][frame] = canvas
for (const cid in SPR) FORMS[cid] = SPR[cid].stages.map((frames, st) => frames.map(f => buildCanvas(f.split("|").map(decodeRow), SPR[cid].pal[st])));
function silhouette(src) {
  const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
  const x = c.getContext("2d"); x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "source-in"; x.fillStyle = "#101530"; x.fillRect(0, 0, c.width, c.height);
  return c;
}
const accent = (cid, st) => SPR[cid].pal[st].F, accent2 = (cid, st) => SPR[cid].pal[st].H;
$("eagleBig").getContext("2d").drawImage(FORMS.eagle[0][1], 0, 0);

/* Quả lê pixel-art (12×12) */
const PEAR = buildCanvas([
"......KB.G..","......KBGGK.",".....KKLLKK.","....KLLLLLK.","....KLHLLLK.","...KLLLLLLLK","..KLLHLLLLLK",
"..KLHLLLLLDK","..KLLLLLLLDK","..KLLLLLLDDK","...KLLLLDDK.","....KKDDKK.."].map(r => r.padEnd(12, ".")),
{ K: "#4d6a10", B: "#6b3f1f", G: "#3fae5a", L: "#b8e04a", H: "#f4ffa8", D: "#86b01e" });

/* ============ Trạng thái game ============ */
const g = { state: "menu", bird: null, pipes: [], pears: [], parts: [], score: 0, scroll: 0, wingT: 0, shake: 0, flash: 0, deadT: 0, hitGround: false,
            evo: 0, stage: 0, pearCount: 0, inv: 0, trailT: 0, morph: 0, slow: 0 };
let t = 0;
const birdR = () => RADII[g.stage];
const meta = () => SPR[charId];

function reset() {
  g.bird = { y: 320, vy: 0 };
  g.pipes = []; g.pears = []; g.parts = []; g.score = 0; g.scroll = 0; g.wingT = 0; g.shake = 0; g.flash = 0; g.deadT = 0; g.hitGround = false;
  g.evo = 0; g.stage = 0; g.pearCount = 0; g.inv = 0; g.trailT = 0; g.morph = 0; g.slow = 0;
  $("score").textContent = "0"; $("msg").textContent = "";
  updateEvoHud();
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
  if (prev && Math.random() < 0.8) {                    // quả lê lơ lửng giữa hai cột
    const y = clamp((prev.gapY + gapY) / 2 + rand(-70, 70), 95, GROUND_Y - 95);
    g.pears.push({ x: prev.x + SPACING / 2 + PIPE_W / 2, y, ph: rand(0, 6) });
  }
}

function say(txt, big) { const m = $("msg"); m.textContent = txt; m.classList.toggle("big", !!big); m.classList.remove("pop"); void m.offsetWidth; m.classList.add("pop"); }

/* ============ Tiến hóa ============ */
function updateEvoHud() {
  const m = meta();
  $("evoName").textContent = `${m.icon} ${m.names[g.stage]} · Cấp ${g.stage + 1}/${MAX_STAGE + 1}`;
  $("evoFill").style.width = (g.stage >= MAX_STAGE ? 100 : ((g.evo - g.stage * STAGE_AT) / STAGE_AT) * 100) + "%";
  $("evoPears").textContent = `🍐 ${g.pearCount}  ·  ` + (g.stage >= MAX_STAGE ? "TỐI ĐA" : `${g.evo - g.stage * STAGE_AT}/${STAGE_AT} tiến hóa`);
}
function burst(x, y, n, cols, sp = 220) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, 6.283), v = rand(sp * 0.3, sp);
    g.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.5, 1), max: 1, col: cols[(Math.random() * cols.length) | 0], s: rand(3, 6) });
  }
}
function addEvo(n) {
  g.evo += n;
  const ns = Math.min(MAX_STAGE, Math.floor(g.evo / STAGE_AT));
  if (ns > g.stage) {
    g.stage = ns; g.flash = 1; g.shake = 8; g.inv = 1.6; g.morph = 1.0; g.slow = 0.55;
    burst(BIRD_X, g.bird.y, 90, [accent(charId, ns), accent2(charId, ns), "#ffffff"], 380);
    say(`${meta().icon} TIẾN HÓA!  ${meta().names[ns]}`, true);
    [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.22, "triangle", 0.14, 0, i * 0.09));
    if (ns > store.get("maxStage:" + charId, 0)) store.set("maxStage:" + charId, ns);
  }
  updateEvoHud();
}

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
  const b = g.bird, r = birdR();
  const top = p.gapY - p.gapH / 2, bot = p.gapY + p.gapH / 2;
  const rects = [[p.x, -50, PIPE_W, top + 50], [p.x, bot, PIPE_W, H],
                 [p.x - 5, top - 22, PIPE_W + 10, 22], [p.x - 5, bot, PIPE_W + 10, 22]];
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
  burst(BIRD_X, g.bird.y, 18, ["#ffffff", accent(charId, g.stage)], 200);
  beep(200, 0.25, "sawtooth", 0.14, -120);
}

function update(dt) {
  if (g.slow > 0) { g.slow = Math.max(0, g.slow - dt); dt *= 0.35; }   // chậm lại khi tiến hóa
  t += dt;
  g.morph = Math.max(0, g.morph - dt);
  const target = THEMES[themeOf(g.score)];
  for (let i = 0; i < th.length; i++) th[i] += (target[i] - th[i]) * Math.min(1, dt * 2);
  g.shake = Math.max(0, g.shake - dt * 30);
  g.flash = Math.max(0, g.flash - dt * 4);
  g.wingT = Math.max(0, g.wingT - dt);
  g.inv = Math.max(0, g.inv - dt);

  for (const q of g.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 260 * dt; q.life -= dt; }
  g.parts = g.parts.filter(q => q.life > 0);

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
    const b = g.bird, r = birdR();
    b.vy = Math.min(MAX_FALL, b.vy + GRAV * dt);
    b.y += b.vy * dt;
    if (b.y < r) { b.y = r; b.vy = Math.max(0, b.vy); }

    for (const p of g.pipes) p.x -= sp * dt;
    for (const q of g.pears) q.x -= sp * dt;
    const last = g.pipes[g.pipes.length - 1];
    if (last && last.x <= W + 60 - SPACING) spawnPipe();
    while (g.pipes.length && g.pipes[0].x + PIPE_W < -20) g.pipes.shift();
    while (g.pears.length && g.pears[0].x < -30) g.pears.shift();

    // vệt bay theo hình thái
    g.trailT += dt;
    if (g.stage >= 1 && g.trailT > 0.035) {
      g.trailT = 0;
      g.parts.push({ x: BIRD_X - 14, y: b.y + rand(-4, 8), vx: -sp * rand(0.4, 0.8), vy: rand(-30, 30), life: rand(0.35, 0.6), max: 0.6,
                     col: Math.random() < 0.5 ? accent(charId, g.stage) : accent2(charId, g.stage), s: rand(3, 5) });
    }

    // ăn quả lê
    for (let i = g.pears.length - 1; i >= 0; i--) {
      const q = g.pears[i], qy = q.y + Math.sin(t * 3 + q.ph) * 5;
      if ((q.x - BIRD_X) ** 2 + (qy - b.y) ** 2 < (r + 16) ** 2) {
        g.pears.splice(i, 1); g.pearCount++;
        burst(q.x, qy, 14, ["#b8e04a", "#f4ffa8", "#ffe45e"], 180);
        beep(900, 0.1, "sine", 0.13, 500); beep(1300, 0.12, "sine", 0.1, 300, 0.07);
        if (g.stage < MAX_STAGE) say(`🍐 +${PEAR_EVO} tiến hóa`);
        addEvo(PEAR_EVO);
      }
    }

    for (const p of g.pipes) {
      if (!p.passed && p.x + PIPE_W < BIRD_X - r) {
        p.passed = true; g.score++; $("score").textContent = g.score;
        beep(g.score % 10 === 0 ? 1100 : 760, 0.14, "sine", 0.13);
        addEvo(1);
        if (g.score % 10 === 0 && !g.inv) say(`Tuyệt vời! ${g.score} cột`);
      }
      if (g.inv <= 0 && hitsPipe(p)) { die(false); break; }
    }
    if (g.state === "playing" && b.y > GROUND_Y - r) {
      if (g.inv > 0) { b.y = GROUND_Y - r; b.vy = FLAP * 0.7; }    // đang tiến hóa: nảy lên, không chết
      else { b.y = GROUND_Y - r; die(true); }
    }
  }
  else if (g.state === "dying") {
    g.deadT += dt;
    const b = g.bird;
    b.vy = Math.min(MAX_FALL + 200, b.vy + GRAV * 1.1 * dt);
    b.y += b.vy * dt;
    if (b.y >= GROUND_Y - 8) { b.y = GROUND_Y - 8; b.vy = 0; g.hitGround = true; }
    if (g.hitGround && g.deadT > 0.55) gameOver();
  }
}

/* ============ Vẽ ============ */
function drawPipe(p) {
  const top = p.gapY - p.gapH / 2, bot = p.gapY + p.gapH / 2;
  const body = rgb(th, 6), dark = rgb(th, 6, 0.72), light = rgb(th, 6, 1.18);
  const piece = (y, h, capTop) => {
    ctx.fillStyle = body; ctx.fillRect(p.x, y, PIPE_W, h);
    ctx.fillStyle = light; ctx.fillRect(p.x + 6, y, 8, h);
    ctx.fillStyle = dark; ctx.fillRect(p.x + PIPE_W - 12, y, 12, h);
    for (let k = 0; k < h; k += 34) { ctx.fillStyle = "rgba(0,0,0,.12)"; ctx.fillRect(p.x + 18, y + k + 10, 22, 4); }
    const cy = capTop ? y : y + h - 22;
    ctx.fillStyle = body; ctx.fillRect(p.x - 5, cy, PIPE_W + 10, 22);
    ctx.fillStyle = capTop ? "#5aa845" : dark; ctx.fillRect(p.x - 5, capTop ? cy : cy + 14, PIPE_W + 10, 8);
    ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(p.x - 5, cy, PIPE_W + 10, 3);
  };
  piece(-50, top + 50, false);
  piece(bot, H - bot, true);
}

function drawPear(q) {
  const y = q.y + Math.sin(t * 3 + q.ph) * 5;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.shadowColor = "rgba(220,255,120,.9)"; ctx.shadowBlur = 14;
  ctx.drawImage(PEAR, q.x - 14, y - 14, 28, 28);
  ctx.restore();
}

const whiteCache = new Map();
function whiteOf(c) {
  if (!whiteCache.has(c)) {
    const w = document.createElement("canvas"); w.width = c.width; w.height = c.height;
    const x = w.getContext("2d"); x.drawImage(c, 0, 0);
    x.globalCompositeOperation = "source-in"; x.fillStyle = "#fff"; x.fillRect(0, 0, w.width, w.height);
    whiteCache.set(c, w);
  }
  return whiteCache.get(c);
}
function drawBird() {
  const b = g.bird, st = g.stage;
  let frame = 1;
  if (g.wingT > 0) { const p = 1 - g.wingT / 0.3; frame = p < 0.34 ? 0 : p < 0.67 ? 1 : 2; }
  if (g.state === "dying") frame = 2;
  const ang = g.state === "ready" ? 0 : clamp(b.vy / 650, -0.45, 1.25);
  const mp = g.morph;                                   // 1 → 0 trong lúc tiến hóa
  const sc = SCALES[st] * (1 + 0.5 * Math.sin(Math.min(1, mp) * Math.PI));   // "phình" lên rồi co lại
  const col = accent(charId, st);
  ctx.save();
  ctx.translate(BIRD_X, b.y);

  // vòng sóng xung kích khi tiến hóa
  if (mp > 0) {
    ctx.save(); ctx.globalAlpha = mp * 0.9; ctx.strokeStyle = col; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, (1 - mp) * 260 + 20, 0, 7); ctx.stroke();
    ctx.globalAlpha = mp * 0.6; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, (1 - mp) * 180 + 10, 0, 7); ctx.stroke(); ctx.restore();
  }
  // hào quang quanh nhân vật từ cấp 2
  if (st >= 1) {
    const R = 26 + st * 9 + Math.sin(t * 6) * 2, gr = ctx.createRadialGradient(0, 0, 4, 0, 0, R);
    gr.addColorStop(0, col + "66"); gr.addColorStop(1, col + "00");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill();
  }
  ctx.rotate(ang);
  ctx.imageSmoothingEnabled = false;
  if (g.inv > 0 && mp <= 0) ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 34);
  ctx.shadowColor = col; ctx.shadowBlur = [0, 8, 12, 18, 26][st];
  const img = FORMS[charId][st][frame];
  ctx.drawImage(img, -13.5 * sc, -12.5 * sc, 28 * sc, 24 * sc);
  if (mp > 0.35) {                                      // lóe trắng trong khoảnh khắc biến hình
    ctx.shadowBlur = 0; ctx.globalAlpha = clamp((mp - 0.35) / 0.65, 0, 1);
    ctx.drawImage(whiteOf(img), -13.5 * sc, -12.5 * sc, 28 * sc, 24 * sc);
  }
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
  ctx.globalAlpha = 0.45;
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
  for (const q of g.pears) drawPear(q);

  ctx.fillStyle = rgb(th, 9); ctx.fillRect(-10, GROUND_Y, W + 20, H - GROUND_Y + 10);
  ctx.fillStyle = "#5aa845"; ctx.fillRect(-10, GROUND_Y, W + 20, 14);
  ctx.fillStyle = "#468a35";
  const off = -(g.scroll % 28);
  for (let x = off - 28; x < W + 28; x += 28) ctx.fillRect(x, GROUND_Y + 8, 14, 6);
  ctx.fillStyle = "rgba(0,0,0,.14)";
  for (let x = off - 40; x < W + 40; x += 40) ctx.fillRect(x, GROUND_Y + 34, 20, 5);
  ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(-10, GROUND_Y, W + 20, 2);

  for (const q of g.parts) { ctx.globalAlpha = clamp(q.life / q.max, 0, 1); ctx.fillStyle = q.col; ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s); }
  ctx.globalAlpha = 1;
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
  $("btnPick").textContent = `${meta().icon} Nhân vật: ${meta().label}`;
  $("btnSound").textContent = `${soundOn ? "🔊" : "🔇"} Âm thanh: ${soundOn ? "bật" : "tắt"}`;
}

function startGame() {
  hide("menu"); hide("over"); hide("login"); hide("pick"); show("hud"); show("hint"); $("hint").classList.remove("hidden");
  reset(); g.state = "ready";
}
function goHome() { hide("over"); hide("hud"); hide("hint"); hide("login"); hide("pick"); reset(); g.state = "menu"; show("menu"); refreshLabels(); }
function goLogin() {
  if (profile) { $("lgAcc").value = profile.acc; $("lgName").value = profile.name; }
  hide("menu"); hide("over"); hide("hud"); hide("hint"); hide("pick"); $("loginErr").textContent = ""; reset(); g.state = "menu"; show("login");
}

async function gameOver() {
  g.state = "over";
  plays++; if (profile) store.set("plays:" + profile.acc, plays);
  const isNew = g.score > best;
  if (isNew) { best = g.score; saveBest(); }
  $("overScore").textContent = g.score;
  $("overNew").textContent = isNew && g.score > 0 ? "🎉 Kỷ lục mới!" : "";
  $("overForm").textContent = `${meta().icon} ${meta().names[g.stage]} · 🍐 ${g.pearCount} quả lê`;
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

/* --- Chọn nhân vật --- */
let previewAll = false;                 // bật để xem thử mọi hình thái (không ảnh hưởng tiến trình)
function buildPick() {
  const list = $("pickList"); list.innerHTML = "";
  for (const cid of Object.keys(SPR)) {
    const m = SPR[cid], maxSt = previewAll ? MAX_STAGE : store.get("maxStage:" + cid, 0);
    const card = document.createElement("div"); card.className = "pcard" + (cid === charId ? " on" : "");
    const title = document.createElement("div"); title.className = "pt"; title.textContent = `${m.icon} ${m.label}` + (cid === charId ? "  ✓" : "");
    const big = document.createElement("canvas"); big.width = 28; big.height = 24; big.className = "pbig";
    big.getContext("2d").drawImage(FORMS[cid][maxSt][1], 0, 0);
    const name = document.createElement("div"); name.className = "pn"; name.textContent = `Cao nhất: ${m.names[maxSt]}`;
    const row = document.createElement("div"); row.className = "thumbs";
    for (let s = 0; s <= MAX_STAGE; s++) {
      const th2 = document.createElement("div"); th2.className = "th" + (s <= maxSt ? "" : " lock");
      const c = document.createElement("canvas"); c.width = 28; c.height = 24;
      c.getContext("2d").drawImage(s <= maxSt ? FORMS[cid][s][1] : silhouette(FORMS[cid][s][1]), 0, 0);
      const lb = document.createElement("span"); lb.textContent = s <= maxSt ? m.names[s] : "???";
      th2.append(c, lb); row.append(th2);
    }
    card.append(title, big, name, row);
    card.onclick = () => { charId = cid; store.set("char", cid); beep(660, 0.1); buildPick(); refreshLabels(); };
    list.append(card);
  }
}
$("btnPick").onclick = () => { buildPick(); hide("menu"); show("pick"); };
$("pickPreview").onclick = () => { previewAll = !previewAll; $("pickPreview").textContent = previewAll ? "👁 Đang xem thử tất cả (bấm để tắt)" : "👁 Xem thử mọi hình thái"; buildPick(); };
$("pickBack").onclick = () => { hide("pick"); show("menu"); refreshLabels(); };

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
if (!SPR[charId]) charId = "eagle";
reset(); refreshLabels();
if (profile) goHome();
requestAnimationFrame(loop);
window.__ibReady = true;
