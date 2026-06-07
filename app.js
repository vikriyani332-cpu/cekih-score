/* ===== SCORE CEKIH V7 — APP.JS ===== */
'use strict';

// ============================================================
// STATE
// ============================================================
const STATE = {
  screen: 'setup',       // setup | game | newround
  ronde: 1,
  puteran: 0,
  target: 1000,
  players: [],           // [{id, name, score, stars, burns, burned, tripleBurn, highestScore, isInRecoveryMode, recoveryStartPuteran, burnedBy, rank, prevRank}]
  history: [],           // [{ronde, puteran, scores:[{id,delta,total}], burns:[{pelaku,korban}]}]
  burnCandidates: [],    // [{pelakuId, korbanId}]
  achievements: {},      // {playerId: [achName]}
  archive: {},           // {name: {stars,burns,burned,tripleBurn,highestScore}}
  graphData: {},         // {playerId: [score per puteran]}
  aiComment: '',
  undoStack: [],         // snapshots
  roundEnded: false,
  // tracking for burn system
  trackerHistory: [],    // per puteran ranking states
};

// ============================================================
// AUDIO SYSTEM
// ============================================================
let currentAudio = null;
let audioQueue = [];
let audioRunning = false;

function playAudio(src) {
  return new Promise(resolve => {
    try {
      const audio = new Audio(src);
      currentAudio = audio;
      audio.volume = 1.0;
      audio.onended = () => { currentAudio = null; resolve(); };
      audio.onerror = () => { currentAudio = null; resolve(); };
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => { currentAudio = null; resolve(); });
      }
    } catch(e) { resolve(); }
  });
}

async function playSequence(files) {
  audioRunning = true;
  for (const file of files) {
    if (!audioRunning) break;
    if (file) await playAudio(file);
  }
  audioRunning = false;
}

function stopAllAudio() {
  audioRunning = false;
  if (currentAudio) {
    try { currentAudio.pause(); currentAudio.currentTime = 0; } catch(e){}
    currentAudio = null;
  }
  audioQueue = [];
}

function numberToMP3Files(n) {
  const files = [];
  let num = Math.abs(n);
  if (n < 0) files.push('audio/angka/minus.mp3');
  if (num === 0) { return files; } // 0 = skip file (no audio needed for zero)
  if (num >= 1000) {
    files.push('audio/angka/1000.mp3');
    num -= 1000;
    if (num === 0) return files;
  }
  const ratus = Math.floor(num / 100);
  const sisa = num % 100;
  if (ratus > 0) files.push(`audio/angka/${ratus * 100}.mp3`);
  if (sisa > 0) {
    if (sisa <= 19) {
      files.push(`audio/angka/${sisa}.mp3`);
    } else {
      const puluhan = Math.floor(sisa / 10);
      const satuan = sisa % 10;
      if (puluhan > 0) files.push(`audio/angka/${puluhan * 10}.mp3`);
      if (satuan > 0) files.push(`audio/angka/${satuan}.mp3`);
    }
  }
  return files;
}

const NAME_AUDIO_MAP = {
  'pak budi': 'audio/nama/pak_budi.mp3',
  'pak agus': 'audio/nama/pak_agus.mp3',
  'mang aceng': 'audio/nama/mang_aceng.mp3',
  'mang wandy': 'audio/nama/mang_wandy.mp3',
  'a yudi': 'audio/nama/a_yudi.mp3',
  'a erwin': 'audio/nama/a_erwin.mp3',
  'bah nanang': 'audio/nama/bah_nanang.mp3',
  'wildan': 'audio/nama/wildan.mp3',
};

function getNameAudioFile(name) {
  if (!name) return null;
  return NAME_AUDIO_MAP[name.toLowerCase().trim()] || null;
}

async function playBurnAudio(pelakuName, korbanName) {
  const files = [];
  const pAudio = getNameAudioFile(pelakuName);
  const kAudio = getNameAudioFile(korbanName);
  if (pAudio) files.push(pAudio);
  files.push('audio/kata/membakar.mp3');
  if (kAudio) files.push(kAudio);
  await playSequence(files);
}

async function playKocokKartuAudio(name) {
  const files = [];
  const nAudio = getNameAudioFile(name);
  if (nAudio) files.push(nAudio);
  files.push('audio/kata/tolong.mp3');
  files.push('audio/kata/kocok.mp3');
  files.push('audio/kata/kartunya_ya.mp3');
  await playSequence(files);
}

async function playTotalScoreAudio(name, score) {
  const files = [];
  const nAudio = getNameAudioFile(name);
  if (nAudio) files.push(nAudio);
  files.push('audio/kata/mendapatkan.mp3');
  const numFiles = numberToMP3Files(score);
  files.push(...numFiles);
  files.push('audio/kata/poin.mp3');
  await playSequence(files);
}

async function playStarAudio(name) {
  const files = [];
  files.push('audio/kata/selamat_ya.mp3');
  const nAudio = getNameAudioFile(name);
  if (nAudio) files.push(nAudio);
  files.push('audio/kata/dapat.mp3');
  files.push('audio/kata/bintang.mp3');
  files.push('audio/angka/1.mp3');
  await playSequence(files);
}

async function playRondeSelesaiAudio() {
  await playSequence(['audio/kata/ronde_selesai.mp3','audio/kata/selamat_berjuang_dan_fokus.mp3']);
}

function determineKocokPlayer() {
  const ps = STATE.players;
  // jika ada minus, pilih yang paling minus
  const minusPlayers = ps.filter(p => p.score < 0);
  if (minusPlayers.length > 0) {
    return minusPlayers.reduce((a,b) => a.score < b.score ? a : b);
  }
  // Tidak ada minus — pilih skor terkecil
  return ps.reduce((a,b) => a.score < b.score ? a : b);
}

// ============================================================
// NUMBER TO BAHASA INDONESIA (teks)
// ============================================================
function numberToBahasaIndonesia(n) {
  if (n === 0) return 'nol';
  const neg = n < 0;
  let num = Math.abs(n);
  const satuan = ['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan',
    'sepuluh','sebelas','dua belas','tiga belas','empat belas','lima belas','enam belas',
    'tujuh belas','delapan belas','sembilan belas'];
  const puluhan = ['','','dua puluh','tiga puluh','empat puluh','lima puluh',
    'enam puluh','tujuh puluh','delapan puluh','sembilan puluh'];
  let result = '';
  if (num >= 1000) { result += 'seribu '; num %= 1000; }
  if (num >= 100) {
    const r = Math.floor(num/100);
    result += (r===1?'seratus':`${satuan[r]} ratus`) + ' ';
    num %= 100;
  }
  if (num >= 20) {
    result += puluhan[Math.floor(num/10)] + ' ';
    num %= 10;
    if (num > 0) result += satuan[num];
  } else if (num > 0) {
    result += satuan[num];
  }
  return (neg ? 'minus ' : '') + result.trim();
}

// ============================================================
// RANKING SYSTEM
// ============================================================
function computeRankings(players) {
  // Return array of {id, rank} without mutating
  const sorted = [...players].sort((a,b) => {
    if (b.score !== a.score) return b.score - a.score;
    // stable sort: maintain original order for ties
    return players.findIndex(p=>p.id===a.id) - players.findIndex(p=>p.id===b.id);
  });
  return sorted.map((p,i) => ({ id: p.id, rank: i+1 }));
}

function updateRankings() {
  const ranked = computeRankings(STATE.players);
  STATE.players.forEach(p => {
    const found = ranked.find(r => r.id === p.id);
    if (found) p.rank = found.rank;
  });
}

// ============================================================
// DANGER STATUS
// ============================================================
function getDangerStatus(player) {
  const t = STATE.target;
  const s = player.score;
  if (s < 0) return {level:'critical', label:'🔴 Kritis', cls:'danger-critical'};
  const ratio = s / t;
  if (ratio >= 0.8) return {level:'danger', label:'🟠 Bahaya', cls:'danger-danger'};
  if (ratio >= 0.6) return {level:'waspada', label:'🟡 Waspada', cls:'danger-waspada'};
  return {level:'safe', label:'🟢 Aman', cls:'danger-safe'};
}

// ============================================================
// BURN SYSTEM V7
// ============================================================
function checkBurnCandidates(prevStates, currStates) {
  // prevStates & currStates: [{id, score, rank}]
  const candidates = [];

  for (const curr of currStates) {
    const prev = prevStates.find(p=>p.id===curr.id);
    if (!prev) continue;
    const currPlayer = STATE.players.find(p=>p.id===curr.id);

    // Pelaku: rank naik (rank number turun = posisi lebih baik)
    if (curr.rank >= prev.rank) continue; // rank tidak naik

    // Cari pemain yang dilewati
    for (const otherCurr of currStates) {
      if (otherCurr.id === curr.id) continue;
      const otherPrev = prevStates.find(p=>p.id===otherCurr.id);
      if (!otherPrev) continue;

      // Syarat: other SEBELUM di atas pelaku, SESUDAH di bawah pelaku
      if (otherPrev.rank >= prev.rank) continue; // other sebelum tidak di atas pelaku
      if (otherCurr.rank <= curr.rank) continue; // other sesudah tidak di bawah pelaku

      // Validasi korban
      const korbanPlayer = STATE.players.find(p=>p.id===otherCurr.id);
      if (!korbanPlayer) continue;

      // Skor korban sesudah > 0
      if (korbanPlayer.score <= 0) continue;

      // Korban tidak sedang Recovery
      if (korbanPlayer.isInRecoveryMode) continue;

      // Cek sesama ex-recovery: jika pelaku baru keluar recovery DAN korban juga baru keluar recovery di puteran ini
      // mereka tidak bisa saling membakar di puteran ini
      const pelakuJustExitedRecovery = currPlayer.justExitedRecovery;
      const korbanJustExitedRecovery = korbanPlayer.justExitedRecovery;
      if (pelakuJustExitedRecovery && korbanJustExitedRecovery) continue;

      // Tidak duplikat
      const dup = candidates.find(c=>c.pelakuId===curr.id && c.korbanId===otherCurr.id);
      if (!dup) {
        candidates.push({ pelakuId: curr.id, korbanId: otherCurr.id });
      }
    }
  }
  return candidates;
}

function applyBurn(pelakuId, korbanId) {
  const korban = STATE.players.find(p=>p.id===korbanId);
  const pelaku = STATE.players.find(p=>p.id===pelakuId);
  if (!korban || !pelaku) return;

  korban.score = 0;
  korban.burned += 1;
  korban.burnedBy = pelakuId;
  korban.isInRecoveryMode = true;
  korban.recoveryStartPuteran = STATE.puteran;
  pelaku.burns += 1;

  // update highestScore in archive
  updateArchivePlayer(pelaku);
  updateArchivePlayer(korban);
}

function applyAllBurns() {
  // Check triple burn per pelaku
  const pelakuBurns = {};
  STATE.burnCandidates.forEach(c => {
    pelakuBurns[c.pelakuId] = (pelakuBurns[c.pelakuId]||0)+1;
  });

  STATE.burnCandidates.forEach(c => {
    applyBurn(c.pelakuId, c.korbanId);
  });

  // Triple burn check
  Object.entries(pelakuBurns).forEach(([pid, count]) => {
    if (count >= 3) {
      const p = STATE.players.find(pl=>pl.id==pid);
      if (p) {
        p.tripleBurn += 1;
        updateArchivePlayer(p);
      }
    }
  });
}

// ============================================================
// MODE RECOVERY UPDATE
// ============================================================
function updateRecoveryModes() {
  // Reset justExitedRecovery flag before update
  STATE.players.forEach(p => { p.justExitedRecovery = false; });

  // nextPuteran is STATE.puteran + 1 (we call this before incrementing)
  const nextPuteran = STATE.puteran + 1;

  STATE.players.forEach(p => {
    if (p.isInRecoveryMode && p.recoveryStartPuteran !== null) {
      // Recovery berlangsung 1 puteran penuh setelah terbakar
      // Masuk recovery di puteran X → dilindungi di puteran X+1 → normal mulai puteran X+2
      // saat nextPuteran > recoveryStartPuteran + 1 artinya X+2 > X+1 yaitu sudah 2 puteran berlalu
      if (nextPuteran > p.recoveryStartPuteran + 1) {
        p.isInRecoveryMode = false;
        p.recoveryStartPuteran = null;
        p.justExitedRecovery = true;
      }
    }
  });
}

// ============================================================
// GRAPH DATA
// ============================================================
function initGraphData() {
  STATE.players.forEach(p => {
    if (!STATE.graphData[p.id]) STATE.graphData[p.id] = [];
  });
}

function recordGraphPoint() {
  STATE.players.forEach(p => {
    if (!STATE.graphData[p.id]) STATE.graphData[p.id] = [];
    STATE.graphData[p.id].push(p.score);
  });
}

// ============================================================
// ACHIEVEMENT CHECK
// ============================================================
const ACHIEVEMENTS = [
  { id:'tukang_ngocok', name:'Tukang Ngocok Kartu', icon:'🃏', desc:'score < 0', check: p => p.score < 0 },
  { id:'tukang_bakar', name:'Tukang Bakar', icon:'🔥', desc:'burns >= 3', check: p => p.burns >= 3 },
  { id:'hari_apes', name:'Hari Apes Gak Ada Yang Tau', icon:'😭', desc:'burned >= 5', check: p => p.burned >= 5 },
  { id:'dewa_kartu', name:'Dewa Kartu', icon:'👑', desc:'highestScore >= 500', check: p => p.highestScore >= 500 },
  { id:'dewa_dewa', name:'Dewa Dari Segala Dewa', icon:'🌟', desc:'stars > 1', check: p => p.stars > 1 },
  { id:'triple_burn', name:'Triple Burn', icon:'💥', desc:'tripleBurn > 0', check: p => p.tripleBurn > 0 },
];

function checkAchievements() {
  STATE.players.forEach(p => {
    if (!STATE.achievements[p.id]) STATE.achievements[p.id] = [];
    ACHIEVEMENTS.forEach(ach => {
      if (ach.check(p) && !STATE.achievements[p.id].includes(ach.id)) {
        STATE.achievements[p.id].push(ach.id);
      }
    });
  });
}

// ============================================================
// ARCHIVE / STATISTIK PERMANEN
// ============================================================
function updateArchivePlayer(p) {
  const key = p.name.toLowerCase().trim();
  if (!STATE.archive[key]) {
    STATE.archive[key] = { name: p.name, stars:0, burns:0, burned:0, tripleBurn:0, highestScore:0 };
  }
  const arc = STATE.archive[key];
  arc.name = p.name;
  arc.stars = Math.max(arc.stars, p.stars);
  arc.burns = Math.max(arc.burns, p.burns);
  arc.burned = Math.max(arc.burned, p.burned);
  arc.tripleBurn = Math.max(arc.tripleBurn, p.tripleBurn);
  arc.highestScore = Math.max(arc.highestScore, p.score);
}

function loadStatFromArchive(name) {
  const key = name.toLowerCase().trim();
  return STATE.archive[key] || null;
}

// ============================================================
// LOCAL STORAGE
// ============================================================
const LS_KEY = 'score_cekih_v7';

function saveToLS() {
  try {
    const data = {
      screen: STATE.screen,
      ronde: STATE.ronde,
      puteran: STATE.puteran,
      target: STATE.target,
      players: STATE.players,
      history: STATE.history,
      burnCandidates: STATE.burnCandidates,
      achievements: STATE.achievements,
      archive: STATE.archive,
      graphData: STATE.graphData,
      aiComment: STATE.aiComment,
      undoStack: STATE.undoStack.slice(-20), // max 20 undo
      roundEnded: STATE.roundEnded,
      trackerHistory: STATE.trackerHistory,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch(e) { console.error('LS save error', e); }
}

function loadFromLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    Object.assign(STATE, data);
    return true;
  } catch(e) { return false; }
}

// ============================================================
// SNAPSHOT / UNDO
// ============================================================
function takeSnapshot() {
  const snap = JSON.parse(JSON.stringify({
    screen: STATE.screen,
    ronde: STATE.ronde,
    puteran: STATE.puteran,
    target: STATE.target,
    players: STATE.players,
    history: STATE.history,
    burnCandidates: STATE.burnCandidates,
    achievements: STATE.achievements,
    archive: STATE.archive,
    graphData: STATE.graphData,
    aiComment: STATE.aiComment,
    roundEnded: STATE.roundEnded,
    trackerHistory: STATE.trackerHistory,
  }));
  STATE.undoStack.push(snap);
  if (STATE.undoStack.length > 30) STATE.undoStack.shift();
}

function applyUndo() {
  if (STATE.undoStack.length === 0) return false;
  const snap = STATE.undoStack.pop();
  Object.assign(STATE, snap);
  return true;
}

// ============================================================
// AI COMMENTATOR
// ============================================================
function generateAIComment() {
  const players = STATE.players;
  const sorted = [...players].sort((a,b)=>b.score-a.score);
  const leader = sorted[0];
  const last = sorted[sorted.length-1];
  const comments = [];

  // Puteran info
  if (STATE.puteran === 1) {
    comments.push(`Puteran pertama dimulai! ${leader.name} memimpin dengan ${numberToBahasaIndonesia(leader.score)} poin.`);
  }

  // Approaching star
  players.forEach(p => {
    const gap = STATE.target - p.score;
    if (gap > 0 && gap <= 100) {
      comments.push(`⚠️ Waspada! ${p.name} hanya butuh ${numberToBahasaIndonesia(gap)} poin lagi untuk bintang!`);
    }
  });

  // Negative score
  players.forEach(p => {
    if (p.score < 0) {
      const roasts = [
        `${p.name} lagi di zona bahaya dengan ${numberToBahasaIndonesia(Math.abs(p.score))} poin minus. Kalau gabisa maen tidur aja sana!`,
        `Aduh ${p.name}... minus ${numberToBahasaIndonesia(Math.abs(p.score))} poin. Fokus dong fokus!`,
        `${p.name} lagi susah banget nih, ${numberToBahasaIndonesia(Math.abs(p.score))} poin di bawah nol.`
      ];
      comments.push(roasts[Math.floor(Math.random()*roasts.length)]);
    }
  });

  // Recovery mode
  players.forEach(p => {
    if (p.isInRecoveryMode) {
      comments.push(`🔄 ${p.name} sedang dalam mode recovery — dilindungi satu putaran penuh!`);
    }
  });

  // Burn candidates
  if (STATE.burnCandidates.length > 0) {
    const bc = STATE.burnCandidates[0];
    const pel = players.find(p=>p.id===bc.pelakuId);
    const kor = players.find(p=>p.id===bc.korbanId);
    if (pel && kor) {
      comments.push(`🔥 Dramatis! ${pel.name} berhasil menyalip ${kor.name} dan berhak membakar!`);
    }
  }

  // Gap analysis
  if (STATE.puteran > 1) {
    const gap = leader.score - sorted[1].score;
    if (gap > 200) {
      comments.push(`${leader.name} unggul jauh ${numberToBahasaIndonesia(gap)} poin dari posisi kedua. Mantap jiwa!`);
    } else if (gap < 30 && gap >= 0) {
      comments.push(`Persaingan super ketat! Selisih ${numberToBahasaIndonesia(gap)} poin antara ${leader.name} dan ${sorted[1].name}!`);
    }
  }

  // Comeback
  players.forEach(p => {
    if (p.score > 0 && p.burnedBy) {
      comments.push(`💪 ${p.name} comeback dengan ${numberToBahasaIndonesia(p.score)} poin setelah terbakar!`);
    }
  });

  if (comments.length === 0) {
    comments.push(`Puteran ${STATE.puteran} selesai. ${leader.name} masih memimpin dengan ${numberToBahasaIndonesia(leader.score)} poin.`);
  }

  STATE.aiComment = comments[Math.floor(Math.random()*comments.length)];
}

// ============================================================
// CHART
// ============================================================
const CHART_COLORS = ['#c9a84c','#a8a8b3','#e74c3c','#27ae60'];

function drawChart() {
  const canvas = document.getElementById('score-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth;
  const H = 200;
  canvas.width = W;
  canvas.height = H;

  ctx.clearRect(0,0,W,H);

  // Background
  ctx.fillStyle = 'rgba(20,20,20,0.5)';
  ctx.fillRect(0,0,W,H);

  const pad = {top:20, right:20, bottom:30, left:45};
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;

  // find data range
  let allScores = [];
  STATE.players.forEach(p => {
    if (STATE.graphData[p.id]) allScores.push(...STATE.graphData[p.id]);
  });
  if (allScores.length === 0) return;

  const minScore = Math.min(...allScores, 0);
  const maxScore = Math.max(...allScores, 100);
  const scoreRange = maxScore - minScore || 1;

  const maxPut = Math.max(...STATE.players.map(p=>(STATE.graphData[p.id]||[]).length));
  if (maxPut < 2) return;

  // Grid lines
  ctx.strokeStyle = 'rgba(201,168,76,0.1)';
  ctx.lineWidth = 1;
  for (let i=0;i<=4;i++) {
    const y = pad.top + (chartH/4)*i;
    ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(W-pad.right,y); ctx.stroke();
    // label
    const val = Math.round(maxScore - (scoreRange/4)*i);
    ctx.fillStyle = 'rgba(168,168,179,0.7)';
    ctx.font = '9px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(val, pad.left-4, y+3);
  }

  // Zero line
  if (minScore < 0 && maxScore > 0) {
    const zeroY = pad.top + chartH * (1-(0-minScore)/scoreRange);
    ctx.strokeStyle = 'rgba(201,168,76,0.3)';
    ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(pad.left,zeroY); ctx.lineTo(W-pad.right,zeroY); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Plot each player
  STATE.players.forEach((player, idx) => {
    const data = STATE.graphData[player.id] || [];
    if (data.length < 1) return;
    const color = CHART_COLORS[idx % CHART_COLORS.length];

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.beginPath();

    data.forEach((score, i) => {
      const x = pad.left + (i/(maxPut-1||1))*chartW;
      const y = pad.top + chartH*(1-(score-minScore)/scoreRange);
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Dots
    data.forEach((score, i) => {
      const x = pad.left + (i/(maxPut-1||1))*chartW;
      const y = pad.top + chartH*(1-(score-minScore)/scoreRange);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
    });
  });

  // X axis labels
  ctx.fillStyle = 'rgba(168,168,179,0.6)';
  ctx.font = '9px Arial';
  ctx.textAlign = 'center';
  for (let i=0;i<maxPut;i++) {
    const x = pad.left + (i/(maxPut-1||1))*chartW;
    ctx.fillText(i+1, x, H-pad.bottom+12);
  }
}

// ============================================================
// UI RENDERING
// ============================================================
function renderPlayerCards() {
  const grid = document.getElementById('players-grid');
  if (!grid) return;
  const sorted = [...STATE.players].sort((a,b)=>a.rank-b.rank);

  grid.innerHTML = sorted.map(p => {
    const danger = getDangerStatus(p);
    const starsStr = p.stars > 0 ? '⭐'.repeat(p.stars) : '';
    const isNeg = p.score < 0;

    let dangerBadge = '';
    if (danger.level === 'critical') dangerBadge = `<span class="badge badge-critical">${danger.label}</span>`;
    else if (danger.level === 'danger') dangerBadge = `<span class="badge badge-danger">${danger.label}</span>`;
    else if (danger.level === 'waspada') dangerBadge = `<span class="badge badge-waspada">${danger.label}</span>`;
    else dangerBadge = `<span class="badge badge-safe">${danger.label}</span>`;

    const recovBadge = p.isInRecoveryMode ? `<span class="badge badge-recovery">🔄 Recovery</span>` : '';
    const negEmoji = isNeg ? `<span class="minus-emoji">👎</span>` : '';
    const scoreClass = isNeg ? 'score-negative' : (p.score === 0 ? 'score-zero' : 'score-positive');
    const rankBadgeClass = `rank-badge-${p.rank}`;
    const cardClass = `player-card ${p.rank<=2?`rank-${p.rank}`:''} ${danger.cls}`;

    return `
      <div class="${cardClass}" data-player-id="${p.id}" id="card-${p.id}">
        <div class="card-rank-badge ${rankBadgeClass}">#${p.rank}</div>
        <div class="card-player-name">${escHtml(p.name)}</div>
        <div class="card-score ${scoreClass}">${p.score}${negEmoji}</div>
        <div class="card-stars">${starsStr}</div>
        <div class="card-badges">
          ${dangerBadge}
          ${recovBadge}
        </div>
      </div>
    `;
  }).join('');
}

function renderBurnCandidates() {
  const box = document.getElementById('burn-candidates-box');
  if (!box) return;

  if (STATE.burnCandidates.length === 0) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  const list = STATE.burnCandidates.map(c => {
    const pel = STATE.players.find(p=>p.id===c.pelakuId);
    const kor = STATE.players.find(p=>p.id===c.korbanId);
    return `<div class="burn-candidate-item">🔥 ${escHtml(pel?pel.name:'?')} membakar ${escHtml(kor?kor.name:'?')}</div>`;
  }).join('');

  const btnLabel = STATE.burnCandidates.length > 1 ? '🔥 KONFIRMASI SEMUA' : '🔥 KONFIRMASI BAKAR';

  box.innerHTML = `
    <div class="burn-candidates-title">🔥 Kandidat Bakaran</div>
    ${list}
    <div style="display:flex;gap:8px;margin-top:10px;">
      <button class="btn btn-fire" style="flex:1;" onclick="confirmBurn()">${btnLabel}</button>
      <button class="btn btn-undo" style="flex:0 0 auto;padding:10px 14px;" onclick="cancelBurn()">❌ Batal</button>
    </div>
  `;
}

function renderAIComment() {
  const el = document.getElementById('ai-comment-text');
  if (el && STATE.aiComment) el.textContent = STATE.aiComment;
}

function renderRoundInfo() {
  const rondeEl = document.getElementById('display-ronde');
  const puteranEl = document.getElementById('display-puteran');
  const targetEl = document.getElementById('display-target');
  if (rondeEl) rondeEl.textContent = STATE.ronde;
  if (puteranEl) puteranEl.textContent = STATE.puteran;
  if (targetEl) targetEl.innerHTML = `Target: <span>${STATE.target}</span>`;
}

function renderHistory() {
  const el = document.getElementById('history-list');
  if (!el) return;
  if (STATE.history.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📋</div>Belum ada history</div>`;
    return;
  }
  // newest first
  el.innerHTML = [...STATE.history].reverse().map(h => {
    const scoresHtml = h.scores.map(s => {
      const p = STATE.players.find(pl=>pl.id===s.id);
      const name = p ? p.name : s.id;
      const sign = s.delta > 0 ? '+' : '';
      const col = s.delta < 0 ? 'color:#e74c3c' : (s.delta > 0 ? 'color:#c9a84c' : '');
      return `<span class="history-score-item" style="${col}">${escHtml(name)}: ${sign}${s.delta} (${s.total})</span>`;
    }).join('');

    const burnsHtml = h.burns && h.burns.length > 0
      ? h.burns.map(b => {
          const pel = STATE.players.find(p=>p.id===b.pelakuId);
          const kor = STATE.players.find(p=>p.id===b.korbanId);
          return `<div class="history-fire">🔥 ${escHtml(pel?pel.name:'?')} membakar ${escHtml(kor?kor.name:'?')}</div>`;
        }).join('')
      : '';

    return `
      <div class="history-item">
        <div class="history-puteran">RONDE ${h.ronde} — PUTERAN ${h.puteran}</div>
        <div class="history-scores">${scoresHtml}</div>
        ${burnsHtml}
      </div>
    `;
  }).join('');
}

function renderRankingTab() {
  const el = document.getElementById('ranking-list');
  if (!el) return;
  const sorted = [...STATE.players].sort((a,b)=>b.score-a.score);
  el.innerHTML = sorted.map((p,i) => {
    const starsStr = p.stars > 0 ? ' ' + '⭐'.repeat(p.stars) : '';
    return `
      <div class="ranking-item">
        <div class="ranking-pos pos-${i+1}">${i+1}</div>
        <div class="ranking-name">${escHtml(p.name)}${p.isInRecoveryMode?'<span class="badge badge-recovery" style="margin-left:6px">🔄</span>':''}</div>
        <div>
          <div class="ranking-score">${p.score}</div>
          <div class="ranking-stars">${starsStr}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderAchievements() {
  const el = document.getElementById('achievement-grid');
  if (!el) return;

  // All players' achievements combined
  const allUnlocked = new Set();
  Object.values(STATE.achievements).forEach(arr => arr.forEach(a => allUnlocked.add(a)));

  el.innerHTML = ACHIEVEMENTS.map(ach => {
    const unlocked = allUnlocked.has(ach.id);
    // Find who unlocked it
    let unlocker = '';
    if (unlocked) {
      Object.entries(STATE.achievements).forEach(([pid, arr]) => {
        if (arr.includes(ach.id)) {
          const p = STATE.players.find(pl=>pl.id==pid);
          if (p) unlocker = p.name;
        }
      });
    }
    return `
      <div class="achievement-card ${unlocked?'unlocked':''}">
        <div class="achievement-icon">${ach.icon}</div>
        <div class="achievement-name">${ach.name}</div>
        <div class="achievement-desc">${ach.desc}</div>
        ${unlocked && unlocker ? `<div style="font-size:10px;color:#c9a84c;margin-top:4px;">${escHtml(unlocker)}</div>` : ''}
      </div>
    `;
  }).join('');
}

function renderStatistik() {
  const el = document.getElementById('statistik-list');
  if (!el) return;
  el.innerHTML = STATE.players.map(p => `
    <div class="stat-card">
      <div class="stat-player-name">${escHtml(p.name)}</div>
      <div class="stat-grid">
        <div class="stat-item"><div class="stat-value">${p.stars}</div><div class="stat-label">⭐ Bintang</div></div>
        <div class="stat-item"><div class="stat-value">${p.burns}</div><div class="stat-label">🔥 Burns</div></div>
        <div class="stat-item"><div class="stat-value">${p.burned}</div><div class="stat-label">💀 Burned</div></div>
        <div class="stat-item"><div class="stat-value">${p.tripleBurn}</div><div class="stat-label">💥 Triple</div></div>
        <div class="stat-item"><div class="stat-value">${p.highestScore}</div><div class="stat-label">🏆 Best</div></div>
        <div class="stat-item"><div class="stat-value">${p.score}</div><div class="stat-label">📊 Skor</div></div>
      </div>
    </div>
  `).join('');
}

function renderArchive() {
  const el = document.getElementById('archive-list');
  if (!el) return;
  const entries = Object.values(STATE.archive);
  if (entries.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🗄️</div>Belum ada data arsip</div>`;
    return;
  }
  el.innerHTML = entries.map(arc => `
    <div class="archive-item">
      <div class="archive-avatar">${arc.name.charAt(0).toUpperCase()}</div>
      <div class="archive-info">
        <div class="archive-name">${escHtml(arc.name)}</div>
        <div class="archive-stats">⭐${arc.stars} 🔥${arc.burns} 💀${arc.burned} 💥${arc.tripleBurn} 🏆${arc.highestScore}</div>
      </div>
    </div>
  `).join('');
}

function renderGrafik() {
  drawChart();
  const legend = document.getElementById('chart-legend');
  if (legend) {
    legend.innerHTML = STATE.players.map((p,i) => `
      <div class="legend-item">
        <div class="legend-dot" style="background:${CHART_COLORS[i%4]}"></div>
        <span>${escHtml(p.name)}</span>
      </div>
    `).join('');
  }
}

function renderAll() {
  renderRoundInfo();
  renderPlayerCards();
  renderBurnCandidates();
  renderAIComment();
  renderHistory();
  renderRankingTab();
  renderAchievements();
  renderStatistik();
  renderArchive();
  renderGrafik();
  saveToLS();
}

// ============================================================
// SHOW SCREEN
// ============================================================
function showScreen(name) {
  STATE.screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(`${name}-screen`);
  if (el) el.classList.add('active');

  // Show/hide header
  const header = document.getElementById('app-header');
  if (header) {
    header.style.display = name === 'setup' ? 'none' : 'flex';
  }

  // New round: populate
  if (name === 'newround') renderNewRoundScreen();
  saveToLS();
}

// ============================================================
// SETUP SCREEN
// ============================================================
function initSetupScreen() {
  // Target buttons
  document.querySelectorAll('.target-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.target-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const v = btn.dataset.value;
      if (v === 'custom') {
        const custom = document.getElementById('target-custom');
        if (custom) custom.style.display = 'block';
      } else {
        const custom = document.getElementById('target-custom');
        if (custom) custom.style.display = 'none';
        document.getElementById('target-custom-input').value = '';
        STATE.target = parseInt(v);
      }
    });
  });

  document.getElementById('btn-start-game').addEventListener('click', startGame);
}

function startGame() {
  const nameInputs = ['player-a-name','player-b-name','player-c-name','player-d-name'];
  const names = nameInputs.map(id => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  });

  if (names.some(n=>!n)) {
    alert('Harap isi semua nama pemain!');
    return;
  }

  // Custom target
  const customTargetEl = document.getElementById('target-custom-input');
  if (customTargetEl && customTargetEl.value) {
    const cv = parseInt(customTargetEl.value);
    if (!isNaN(cv) && cv > 0) STATE.target = cv;
  }

  // Build players
  STATE.players = names.map((name, i) => {
    const key = name.toLowerCase().trim();
    const arc = STATE.archive[key];
    return {
      id: i+1,
      name: name,
      score: 0,
      stars: arc ? arc.stars : 0,
      burns: arc ? arc.burns : 0,
      burned: arc ? arc.burned : 0,
      tripleBurn: arc ? arc.tripleBurn : 0,
      highestScore: arc ? arc.highestScore : 0,
      isInRecoveryMode: false,
      recoveryStartPuteran: null,
      justExitedRecovery: false,
      burnedBy: null,
      rank: i+1,
      prevRank: i+1,
    };
  });

  STATE.ronde = 1;
  STATE.puteran = 0;
  STATE.history = [];
  STATE.burnCandidates = [];
  STATE.graphData = {};
  STATE.trackerHistory = [];
  STATE.roundEnded = false;
  STATE.aiComment = '';
  STATE.undoStack = [];

  initGraphData();
  updateRankings();
  showScreen('game');
  renderAll();

  // Play permainan dimulai audio
  setTimeout(() => {
    playSequence(['audio/kata/permainan_dimulai.mp3']);
  }, 500);
}

// ============================================================
// SCORE INPUT MODAL
// ============================================================
function openScoreInputModal() {
  if (STATE.roundEnded) return;
  if (STATE.burnCandidates.length > 0) {
    alert('Harap konfirmasi atau batalkan bakaran terlebih dahulu!');
    return;
  }

  const modal = document.getElementById('score-input-modal');
  if (!modal) return;

  const form = document.getElementById('score-input-form');
  form.innerHTML = STATE.players.map(p => `
    <div class="score-input-row">
      <div class="score-input-name">${escHtml(p.name)}</div>
      <div class="score-input-current">Skor: ${p.score}</div>
      <input
        class="score-input-field"
        type="number"
        id="input-score-${p.id}"
        placeholder="0"
        min="-9999"
        max="1000"
        value=""
        oninput="onScoreInputChange(this)"
        data-player-id="${p.id}"
      />
    </div>
  `).join('');

  modal.classList.remove('hidden');
  // Focus first input
  setTimeout(() => {
    const first = form.querySelector('.score-input-field');
    if (first) first.focus();
  }, 100);
}

function onScoreInputChange(input) {
  const val = parseInt(input.value)||0;
  if (val < 0) input.classList.add('negative');
  else input.classList.remove('negative');
  // clamp max
  if (val > 1000) input.value = 1000;
}

function closeScoreInputModal() {
  const modal = document.getElementById('score-input-modal');
  if (modal) modal.classList.add('hidden');
}

function saveScores() {
  const inputs = document.querySelectorAll('.score-input-field');
  const deltas = {};
  let valid = true;

  inputs.forEach(inp => {
    const pid = parseInt(inp.dataset.playerId);
    const val = inp.value.trim();
    if (val === '') { valid = false; return; }
    const num = parseInt(val);
    if (isNaN(num)) { valid = false; return; }
    deltas[pid] = Math.min(num, 1000); // max positive 1000
  });

  if (!valid || Object.keys(deltas).length !== STATE.players.length) {
    alert('Harap isi semua nilai skor!');
    return;
  }

  closeScoreInputModal();
  takeSnapshot();

  // Save prev ranks & scores (BEFORE any update)
  const prevStates = STATE.players.map(p => ({id:p.id, score:p.score, rank:p.rank}));

  // Update recovery modes BEFORE applying scores
  // This uses the current puteran number (before incrementing) to check expiry
  updateRecoveryModes();

  STATE.puteran += 1;

  // Apply scores
  const histScores = [];
  STATE.players.forEach(p => {
    const delta = deltas[p.id] || 0;
    p.score += delta;
    // Update highestScore
    if (p.score > p.highestScore) {
      p.highestScore = p.score;
      updateArchivePlayer(p);
    }
    histScores.push({ id: p.id, delta: delta, total: p.score });
  });

  // Update rankings (save prevRank first)
  STATE.players.forEach(p => { p.prevRank = p.rank; });
  const newRanks = computeRankings(STATE.players);
  newRanks.forEach(r => {
    const p = STATE.players.find(pl => pl.id === r.id);
    if (p) p.rank = r.rank;
  });

  const currStates = STATE.players.map(p => ({id:p.id, score:p.score, rank:p.rank}));

  // Check burns
  STATE.burnCandidates = checkBurnCandidates(prevStates, currStates);

  // Record graph point
  recordGraphPoint();

  // History entry (burns will be added after confirm)
  const histEntry = { ronde:STATE.ronde, puteran:STATE.puteran, scores:histScores, burns:[] };
  STATE.history.push(histEntry);

  // Track
  STATE.trackerHistory.push({ puteran:STATE.puteran, prevStates, currStates });

  // Check achievements
  checkAchievements();

  // Update archive
  STATE.players.forEach(p => updateArchivePlayer(p));

  // AI comment
  generateAIComment();

  // Check for star/win
  let winnerFound = false;
  STATE.players.forEach(p => {
    if (p.score >= STATE.target && !winnerFound) {
      winnerFound = true;
      handleWin(p);
    }
  });

  renderAll();

  // If no win and no burn candidates → play kocok + total score audio
  if (!winnerFound && STATE.burnCandidates.length === 0) {
    triggerAudioSequenceNoBurn();
  }

  saveToLS();
}

async function triggerAudioSequenceNoBurn() {
  stopAllAudio();
  // Kocok kartu
  const kocokPlayer = determineKocokPlayer();
  await playKocokKartuAudio(kocokPlayer.name);
  // Total skor semua pemain
  for (const p of STATE.players) {
    await playTotalScoreAudio(p.name, p.score);
  }
  // Jika ada yang minus → kalau gabisa maen
  const anyMinus = STATE.players.some(p=>p.score<0);
  if (anyMinus) {
    await playSequence(['audio/kata/kalau_gabisa_maen_tidur_aja_sana.mp3']);
  }
}

// ============================================================
// BURN CONFIRM
// ============================================================
async function confirmBurn() {
  if (STATE.burnCandidates.length === 0) return;
  if (STATE.roundEnded) {
    STATE.burnCandidates = [];
    renderBurnCandidates();
    return;
  }
  takeSnapshot();

  // Fire animation on burned players
  STATE.burnCandidates.forEach(c => {
    const card = document.getElementById(`card-${c.korbanId}`);
    if (card) {
      const fire = document.createElement('div');
      fire.className = 'card-burned-fire';
      card.appendChild(fire);
      setTimeout(()=>fire.remove(), 800);
    }
  });

  // Apply all burns
  const burns = [...STATE.burnCandidates];
  applyAllBurns();

  // Add to history
  const lastHist = STATE.history[STATE.history.length-1];
  if (lastHist) lastHist.burns = burns.map(b=>({pelakuId:b.pelakuId,korbanId:b.korbanId}));

  STATE.burnCandidates = [];

  updateRankings();
  checkAchievements();
  STATE.players.forEach(p => updateArchivePlayer(p));
  generateAIComment();
  renderAll();

  // Audio sequence: burns → kocok → total score
  stopAllAudio();

  for (const b of burns) {
    const pel = STATE.players.find(p=>p.id===b.pelakuId);
    const kor = STATE.players.find(p=>p.id===b.korbanId);
    if (pel && kor) {
      await playBurnAudio(pel.name, kor.name);
    }
  }

  // Kocok kartu
  const kocokPlayer = determineKocokPlayer();
  await playKocokKartuAudio(kocokPlayer.name);

  // Total skor
  for (const p of STATE.players) {
    await playTotalScoreAudio(p.name, p.score);
  }

  // Mulai dari 0 ya bapak (if someone was burned multiple times)
  const burnedMany = STATE.players.find(p => p.burned >= 2 && p.score === 0);
  if (burnedMany) {
    await playSequence(['audio/kata/mulai_dari_0_ya_bapak.mp3']);
  }

  saveToLS();
}

function cancelBurn() {
  STATE.burnCandidates = [];
  renderBurnCandidates();
  saveToLS();
}

// ============================================================
// WIN / STAR
// ============================================================
async function handleWin(player) {
  player.stars += 1;
  player.score = 0; // reset skor untuk ronde baru
  updateArchivePlayer(player);
  checkAchievements();

  STATE.roundEnded = true;
  STATE.burnCandidates = []; // batalkan semua kandidat bakaran

  // Star fall animation
  triggerStarAnimation();

  // Show win banner
  showWinBanner(player);

  renderAll();

  // Audio: selamat ya [nama] dapat bintang 1 → ronde selesai
  stopAllAudio();
  await playStarAudio(player.name);
  await playRondeSelesaiAudio();

  // Show new round button after delay
  setTimeout(() => {
    document.getElementById('btn-new-round-prompt').classList.remove('hidden');
  }, 3000);

  saveToLS();
}

function triggerStarAnimation() {
  const overlay = document.getElementById('star-overlay');
  if (!overlay) return;
  overlay.innerHTML = '';
  for (let i=0;i<20;i++) {
    const star = document.createElement('div');
    star.className = 'falling-star';
    star.textContent = '⭐';
    star.style.left = Math.random()*100 + 'vw';
    star.style.animationDelay = Math.random()*2 + 's';
    star.style.fontSize = (20 + Math.random()*20) + 'px';
    overlay.appendChild(star);
  }
  setTimeout(() => { overlay.innerHTML = ''; }, 5000);
}

function showWinBanner(player) {
  const area = document.getElementById('win-banner-area');
  if (!area) return;
  area.innerHTML = `
    <div class="win-banner">
      <div class="win-banner-stars">⭐</div>
      <div class="win-banner-title">🏆 BINTANG DIDAPAT!</div>
      <div class="win-banner-name">${escHtml(player.name)}</div>
      <div style="font-size:13px;color:var(--silver);margin-top:8px;">Mencapai target ${STATE.target} poin!</div>
      <div style="margin-top:12px;">
        <div style="font-size:11px;color:var(--gold);letter-spacing:1px;">TOTAL BINTANG</div>
        <div style="font-size:30px;">${'⭐'.repeat(player.stars)}</div>
      </div>
    </div>
  `;
}

// ============================================================
// NEW ROUND
// ============================================================
function renderNewRoundScreen() {
  const el = document.getElementById('new-round-content');
  if (!el) return;

  const starsDisplay = STATE.players.map(p=>
    `<div style="display:flex;justify-content:space-between;padding:8px 12px;background:rgba(201,168,76,0.08);border-radius:8px;margin-bottom:6px;">
      <span style="font-weight:700;color:var(--gold-light);">${escHtml(p.name)}</span>
      <span>${p.stars > 0 ? '⭐'.repeat(p.stars) : '—'}</span>
    </div>`
  ).join('');

  el.innerHTML = `
    <div class="new-round-header">
      <div class="new-round-title">RONDE ${STATE.ronde} SELESAI</div>
      <div class="new-round-stars-summary" style="font-size:14px;color:var(--silver);margin-top:8px;">Ronde berikutnya: ${STATE.ronde+1}</div>
    </div>
    <div class="setup-card">
      <div class="section-title">📊 Rekap Bintang</div>
      ${starsDisplay}
    </div>
    <div class="setup-card">
      <div class="section-title">👥 Pemain</div>
      ${STATE.players.map((p,i) => `
        <div class="input-group">
          <label class="input-label">Pemain ${String.fromCharCode(65+i)}</label>
          <input class="input-field" type="text" id="nr-player-${p.id}" value="${escHtml(p.name)}" placeholder="Nama Pemain">
        </div>
      `).join('')}
    </div>
    <div class="setup-card">
      <div class="section-title">🎯 Target Kemenangan</div>
      <div class="target-options">
        <button class="target-btn ${STATE.target===500?'active':''}" data-value="500" onclick="setNRTarget(500,this)">500</button>
        <button class="target-btn ${STATE.target===750?'active':''}" data-value="750" onclick="setNRTarget(750,this)">750</button>
        <button class="target-btn ${STATE.target===1000?'active':''}" data-value="1000" onclick="setNRTarget(1000,this)">1000</button>
        <button class="target-btn ${STATE.target===1500?'active':''}" data-value="1500" onclick="setNRTarget(1500,this)">1500</button>
      </div>
      <input class="input-field mt-8" type="number" id="nr-target-custom" placeholder="Target Custom..." style="text-align:center;">
    </div>
    <button class="btn-primary" onclick="startNewRound()" style="margin-top:16px;">▶ MULAI RONDE ${STATE.ronde+1}</button>
  `;
}

function setNRTarget(val, btn) {
  document.querySelectorAll('#new-round-content .target-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  STATE.target = val;
}

function startNewRound() {
  STATE.ronde += 1;
  STATE.puteran = 0;
  STATE.history = [];
  STATE.burnCandidates = [];
  STATE.graphData = {};
  STATE.trackerHistory = [];
  STATE.roundEnded = false;
  STATE.aiComment = '';
  STATE.undoStack = [];

  // Custom target
  const customEl = document.getElementById('nr-target-custom');
  if (customEl && customEl.value) {
    const cv = parseInt(customEl.value);
    if (!isNaN(cv) && cv > 0) STATE.target = cv;
  }

  // Update player names & reset scores
  STATE.players.forEach(p => {
    const nameEl = document.getElementById(`nr-player-${p.id}`);
    if (nameEl && nameEl.value.trim()) {
      p.name = nameEl.value.trim();
    }
    p.score = 0;
    p.isInRecoveryMode = false;
    p.recoveryStartPuteran = null;
    p.justExitedRecovery = false;
    p.burnedBy = null;
    // Keep stars, burns, burned, tripleBurn, highestScore
  });

  initGraphData();
  updateRankings();
  showScreen('game');

  // Hide new round prompt & win banner
  const bnr = document.getElementById('btn-new-round-prompt');
  if (bnr) bnr.classList.add('hidden');
  const wb = document.getElementById('win-banner-area');
  if (wb) wb.innerHTML = '';

  renderAll();

  // Audio
  setTimeout(() => {
    playSequence(['audio/kata/permainan_dimulai.mp3']);
  }, 300);

  saveToLS();
}

// ============================================================
// EDIT NAME
// ============================================================
function openEditName() {
  const modal = document.getElementById('edit-name-modal');
  if (!modal) return;

  const form = document.getElementById('edit-name-form-inner');
  form.innerHTML = STATE.players.map(p => `
    <div class="input-group">
      <label class="input-label">${escHtml(p.name)}</label>
      <input class="input-field" type="text" id="edit-name-${p.id}" value="${escHtml(p.name)}" placeholder="Nama baru">
    </div>
  `).join('');

  modal.classList.remove('hidden');
}

function closeEditName() {
  const modal = document.getElementById('edit-name-modal');
  if (modal) modal.classList.add('hidden');
}

function saveEditName() {
  STATE.players.forEach(p => {
    const inp = document.getElementById(`edit-name-${p.id}`);
    if (inp && inp.value.trim()) {
      p.name = inp.value.trim();
      updateArchivePlayer(p);
    }
  });
  closeEditName();
  renderAll();
  saveToLS();
}

// ============================================================
// UNDO
// ============================================================
function doUndo() {
  stopAllAudio();
  if (STATE.undoStack.length === 0) {
    alert('Tidak ada yang bisa di-undo!');
    return;
  }
  if (!applyUndo()) return;

  // Hide win banner
  const wb = document.getElementById('win-banner-area');
  if (wb) wb.innerHTML = '';
  const bnr = document.getElementById('btn-new-round-prompt');
  if (bnr) bnr.classList.add('hidden');

  renderAll();
  saveToLS();
}

// ============================================================
// RESET GAME
// ============================================================
function showResetConfirm() {
  const popup = document.getElementById('reset-popup');
  if (popup) popup.classList.remove('hidden');
}

function hideResetConfirm() {
  const popup = document.getElementById('reset-popup');
  if (popup) popup.classList.add('hidden');
}

function doResetGame() {
  stopAllAudio();
  hideResetConfirm();

  // Reset only active game - keep permanent stats
  STATE.screen = 'setup';
  STATE.ronde = 1;
  STATE.puteran = 0;
  STATE.history = [];
  STATE.burnCandidates = [];
  STATE.graphData = {};
  STATE.trackerHistory = [];
  STATE.roundEnded = false;
  STATE.aiComment = '';
  STATE.undoStack = [];
  STATE.players = [];

  // Show setup screen
  showScreen('setup');

  // Clear setup inputs
  ['player-a-name','player-b-name','player-c-name','player-d-name'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Reset win banner & new round btn
  const wb = document.getElementById('win-banner-area');
  if (wb) wb.innerHTML = '';
  const bnr = document.getElementById('btn-new-round-prompt');
  if (bnr) bnr.classList.add('hidden');

  saveToLS();
}

// ============================================================
// SCREENSHOT
// ============================================================
async function doScreenshot() {
  try {
    const el = document.getElementById('game-screen');
    if (!el) return;

    // Simple canvas screenshot approach
    if (typeof html2canvas !== 'undefined') {
      const canvas = await html2canvas(el, { backgroundColor: '#0a0a0a', scale: 2 });
      const link = document.createElement('a');
      link.download = `score-cekih-ronde${STATE.ronde}-puteran${STATE.puteran}.png`;
      link.href = canvas.toDataURL();
      link.click();
    } else {
      // Fallback: use native share if available
      if (navigator.share) {
        navigator.share({ title: 'Score Cekih', text: `Ronde ${STATE.ronde} Puteran ${STATE.puteran}` });
      } else {
        alert('Screenshot: Gunakan fitur screenshot perangkat Anda (Power + Volume Down)');
      }
    }
  } catch(e) {
    alert('Screenshot: Gunakan fitur screenshot perangkat Anda');
  }
}

// ============================================================
// FULLSCREEN
// ============================================================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(()=>{});
  } else {
    document.exitFullscreen().catch(()=>{});
  }
}

// ============================================================
// LIGHT / DARK MODE
// ============================================================
function toggleTheme() {
  document.body.classList.toggle('light-mode');
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = document.body.classList.contains('light-mode') ? '🌙' : '☀️';
  localStorage.setItem('sc_theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
}

// ============================================================
// TABS
// ============================================================
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
      btn.classList.add('active');
      const content = document.getElementById(`tab-${target}`);
      if (content) {
        content.classList.add('active');
        if (target === 'grafik') setTimeout(drawChart, 100);
      }
    });
  });
}

// ============================================================
// HELPER
// ============================================================
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// LOADING SCREEN
// ============================================================
function runLoadingScreen() {
  const bar = document.getElementById('loading-bar');
  const status = document.getElementById('loading-status');
  const messages = ['Memuat aplikasi...','Membaca LocalStorage...','Memulihkan data...','Siap!'];
  let progress = 0;
  let msgIdx = 0;

  const interval = setInterval(() => {
    progress += Math.random() * 25 + 10;
    if (progress > 100) progress = 100;
    if (bar) bar.style.width = progress + '%';
    if (status && msgIdx < messages.length) {
      status.textContent = messages[Math.floor((progress/100)*messages.length)] || messages[messages.length-1];
    }
    if (progress >= 100) {
      clearInterval(interval);
      setTimeout(hideLoadingScreen, 500);
    }
  }, 300);
}

function hideLoadingScreen() {
  const ls = document.getElementById('loading-screen');
  if (ls) {
    ls.classList.add('fade-out');
    setTimeout(() => { ls.style.display = 'none'; }, 800);
  }
}

// ============================================================
// INIT
// ============================================================
function init() {
  // Register SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }

  // Theme
  const savedTheme = localStorage.getItem('sc_theme');
  if (savedTheme === 'light') document.body.classList.add('light-mode');
  const themeBtn = document.getElementById('btn-theme');
  if (themeBtn) themeBtn.textContent = savedTheme === 'light' ? '🌙' : '☀️';

  // Load state
  const loaded = loadFromLS();

  // Init tabs
  initTabs();

  // Init setup screen
  initSetupScreen();

  // Event listeners
  document.getElementById('btn-input-skor').addEventListener('click', openScoreInputModal);
  document.getElementById('btn-simpan-skor').addEventListener('click', saveScores);
  document.getElementById('btn-close-score-modal').addEventListener('click', closeScoreInputModal);
  document.getElementById('btn-undo').addEventListener('click', doUndo);
  document.getElementById('btn-edit-name').addEventListener('click', openEditName);
  document.getElementById('btn-save-edit-name').addEventListener('click', saveEditName);
  document.getElementById('btn-close-edit-name').addEventListener('click', closeEditName);
  document.getElementById('btn-screenshot').addEventListener('click', doScreenshot);
  document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-reset-game').addEventListener('click', showResetConfirm);
  document.getElementById('reset-popup-confirm').addEventListener('click', doResetGame);
  document.getElementById('reset-popup-cancel').addEventListener('click', hideResetConfirm);
  document.getElementById('btn-new-round').addEventListener('click', () => showScreen('newround'));

  // Modal overlay close
  document.getElementById('score-input-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('score-input-modal')) closeScoreInputModal();
  });

  // Restore screen
  if (loaded && STATE.screen === 'game' && STATE.players.length > 0) {
    showScreen('game');
    renderAll();
  } else if (loaded && STATE.screen === 'newround' && STATE.players.length > 0) {
    showScreen('newround');
  } else {
    showScreen('setup');
  }

  // Loading screen
  runLoadingScreen();
}

// DOM Ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
