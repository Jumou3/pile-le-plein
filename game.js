/* =====================================================================
   PILE LE PLEIN — logique du jeu
   Tout ce qui se règle (difficulté, textes) est en haut de fichier.
   L'objectif est un MONTANT EN EUROS : on regarde l'écran « Prix ».
   ===================================================================== */
(() => {
  'use strict';

  /* ------------------------- RÉGLAGES DIFFICULTÉ ------------------------- */
  const CFG = {
    ppl: 2.17,           // prix au litre (€/L), affiché « 2,170 » : SP95-E10, moyenne nationale au 1er octobre 2026
    tank: 70,            // capacité du réservoir (L) : on dépasse = raté
    startRate: 1.5,      // débit manche 1, en €/s (constant pendant tout un niveau)
    rateGrowth: 1.08,    // le débit est multiplié par ça à chaque niveau (+8 %)
    maxRate: 60,         // plafond de débit (€/s)
    startTol: 2.0,       // marge acceptée manche 1 (± €)
    tolDecay: 0.896,     // la marge est multipliée par ça à chaque niveau
    minTol: 0.03,        // marge minimale (± €)
    rampTime: 0.35,      // temps de montée en pression (s)
    durMin: 1.5,         // durée visée d'un plein, mini (s) : objectif mini = débit × durMin
    durMax: 4.5,         // durée visée d'un plein, maxi (s) : objectif maxi = débit × durMax
    targetFloor: 3,      // objectif minimal absolu (€)
    targetMaxCap: 110,   // plafond de l'objectif (€), doit rester < tank × ppl
    wobbleFrom: 10,       // à partir de ce niveau, le débit devient irrégulier
    resultDelay: 1500,   // pause entre deux manches (ms)
    maxLevel: 60,        // doit rester aligné avec supabase.sql
    speedMul: 1,         // multiplicateur de débit (mode test : ?vitesse=0.5)
    startLives: 0,       // vies de rechange au départ (0 = un raté et c'est fini)
    maxLives: 5,         // plafond de vies
    pileTol: 0,          // « Pile » = à ± ce montant de l'objectif (€) : +1 vie. 0 = au centime exact (rarissime)
  };

  // Mode test : ajoute ?vitesse=0.5 à l'adresse pour ralentir (0.5) ou accélérer (2) le jeu.
  // Dans ce mode, les scores ne sont jamais envoyés au classement en ligne.
  const TEST = (() => {
    const v = parseFloat(new URLSearchParams(location.search).get('vitesse'));
    if (!isFinite(v) || v <= 0 || v > 10) return null;
    CFG.speedMul = v;
    return v;
  })();

  /* ------------------------------ TEXTES ------------------------------ */
  const TEXTS = {
    pile: 'Pile ! +1 vie',
    pileMax: 'Pile ! (vies au max)',
    lifeLeft: (n) => (n > 0 ? `Il te reste ${n} vie${n > 1 ? 's' : ''}` : 'Plus aucune vie de rechange'),
    inMargin: (d) => `Dans la marge (${signed(d)} €)`,
    missOver: (d) => `Trop plein (${signed(d)} €)`,
    missUnder: (d) => `Pas assez (${signed(d)} €)`,
    overflow: 'Ça déborde !',
    overTitle: 'Raté',
    overOver: (d) => `Tu as dépassé de ${fmt(Math.abs(d))} €.`,
    overUnder: (d) => `Il manquait ${fmt(Math.abs(d))} €.`,
    overOverflow: 'Le réservoir a débordé.',
    tol: (t) => `Marge ± ${fmt(t)} €`,
    hintReady: "Reste appuyé, relâche pile sur l'objectif.",
    hintPump: 'Relâche !',
    submitOk: 'Score envoyé.',
    submitFail: "Envoi impossible. Réessaie dans un instant.",
    submitLocal: 'Score enregistré sur cet appareil.',
    boardEmpty: 'Aucun score pour le moment.',
    boardLocal: "Classement local : le classement en ligne n'est pas encore branché.",
    boardError: 'Classement indisponible pour le moment.',
    shareText: (n, p) => `J'ai réussi ${n} niveau${n > 1 ? 'x' : ''}${p ? ` et ${p} pile${p > 1 ? 's' : ''}` : ''} à Pile le plein. Tu fais mieux ?`,
    badPseudo: "Ce pseudo n'est pas accepté. Choisis-en un autre.",
    copied: 'Lien copié.',
  };

  /* ------------------------------ OUTILS ------------------------------ */
  const $ = (s) => document.querySelector(s);
  const fmt = (n) => n.toFixed(2).replace('.', ',');
  const signed = (n) => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const round2 = (n) => Math.round(n * 100) / 100;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } },
  };

  const el = {
    level: $('#level'), lives: $('#lives'), best: $('#best'), mute: $('#mute'),
    stage: $('#stage'),
    target: $('#target'),
    price: $('#price'), liters: $('#liters'), ppl: $('#ppl'),
    msg: $('#msg'), tol: $('#tol'), hint: $('#hint'),
    play: $('#play'), openBoard: $('#open-board'), openRules: $('#open-rules'),
    rules: $('#rules'), rulesPlay: $('#rules-play'), rulesControls: $('#rules-controls'),
    over: $('#over'), overTitle: $('#over-title'), overDetail: $('#over-detail'), overScore: $('#over-score'), overPiles: $('#over-piles'),
    submitZone: $('#submit-zone'), pseudo: $('#pseudo'), submit: $('#submit'), submitMsg: $('#submit-msg'),
    boardInline: $('#board-inline'), replay: $('#replay'), share: $('#share'),
    boardScreen: $('#board-screen'), board: $('#board'), boardStatus: $('#board-status'), closeBoard: $('#close-board'),
  };

  /* --------------------------- MODÉRATION PSEUDO ---------------------------
     Filtre de base (la base de données applique la même règle, voir supabase.sql). */
  const BAD_WORDS = ['connard', 'connasse', 'salope', 'enculer', 'encule', 'putain', 'batard', 'bougnoule',
    'youpin', 'nigger', 'nigga', 'pedophile', 'violeur', 'niquer', 'niquetamere', 'niquetoi',
    'nazi', 'hitler', 'siegheil', 'fdp', 'ntm', 'kkk'];
  const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i' };
  function pseudoOk(name) {
    const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[0134578@$!|]/g, (c) => LEET[c]).replace(/[^a-z]/g, '');
    return !BAD_WORDS.some((w) => n.includes(w));
  }

  /* ------------------------------ NIVEAUX ------------------------------ */
  function levelParams(lvl) {
    const rate = Math.min(CFG.maxRate, CFG.startRate * Math.pow(CFG.rateGrowth, lvl - 1)) * CFG.speedMul;   // €/s
    const speed = rate / CFG.ppl;                                                                           // L/s
    const tol = Math.max(CFG.minTol, round2(CFG.startTol * Math.pow(CFG.tolDecay, lvl - 1)));
    const base = rate / CFG.speedMul;                       // les objectifs ne dépendent pas du mode test
    const targetMax = Math.min(CFG.targetMaxCap, Math.max(CFG.targetFloor + 2, base * CFG.durMax));
    const targetMin = Math.max(CFG.targetFloor, Math.min(targetMax - 1, base * CFG.durMin));
    const target = round2(targetMin + Math.random() * (targetMax - targetMin));
    const wobbleAmp = lvl >= CFG.wobbleFrom ? Math.min(0.35, 0.05 * (lvl - CFG.wobbleFrom + 1)) : 0;
    return { speed, tol, target, wobbleAmp };
  }

  /* -------------------------------- SON --------------------------------
     Tout est synthétisé (WebAudio) : aucun fichier audio à charger.       */
  const Sound = {
    ctx: null, master: null, noiseBuf: null, pump: null,
    muted: store.get('pp_muted', false),

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    },
    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    setMuted(m) {
      this.muted = m;
      store.set('pp_muted', m);
      if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
    },

    // Essence qui coule + moteur de pompe qui monte en tours
    startPump() {
      if (!this.ctx || this.pump) return;
      const c = this.ctx, t = c.currentTime;
      const noise = c.createBufferSource();
      noise.buffer = this.noiseBuf; noise.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5; bp.frequency.value = 700;
      const gl = c.createGain(); gl.gain.value = 0;
      const lfo = c.createOscillator(); lfo.frequency.value = 9;
      const lfoG = c.createGain(); lfoG.gain.value = 260;
      lfo.connect(lfoG); lfoG.connect(bp.frequency);
      noise.connect(bp); bp.connect(gl); gl.connect(this.master);

      const eng = c.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 55;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      const ge = c.createGain(); ge.gain.value = 0;
      eng.connect(lp); lp.connect(ge); ge.connect(this.master);

      noise.start(t); lfo.start(t); eng.start(t);
      gl.gain.setTargetAtTime(0.32, t, 0.05);
      ge.gain.setTargetAtTime(0.09, t, 0.08);
      this.pump = { noise, lfo, eng, bp, gl, ge };
    },
    updatePump(fill, flowNorm) {
      if (!this.pump) return;
      const t = this.ctx.currentTime, p = this.pump;
      p.bp.frequency.setTargetAtTime(600 + 1700 * fill, t, 0.03);
      p.lfo.frequency.setTargetAtTime(7 + 8 * flowNorm, t, 0.05);
      p.eng.frequency.setTargetAtTime(52 + 130 * fill + 45 * flowNorm, t, 0.05);
    },
    stopPump() {
      if (!this.pump) return;
      const c = this.ctx, t = c.currentTime, p = this.pump;
      p.gl.gain.setTargetAtTime(0, t, 0.02);
      p.ge.gain.setTargetAtTime(0, t, 0.02);
      const stopAt = t + 0.12;
      p.noise.stop(stopAt); p.lfo.stop(stopAt); p.eng.stop(stopAt);
      this.pump = null;
    },
    tone(type, f0, f1, dur, vol, lp) {
      if (!this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      const o = c.createOscillator(); o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = o;
      if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); node = f; }
      node.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + dur + 0.02);
    },
    click() { this.tone('square', 1300, 900, 0.04, 0.05); },
    ok(exact) {
      this.tone('sine', 880, 880, 0.14, 0.16);
      setTimeout(() => this.tone('sine', 1320, 1320, 0.22, 0.16), 110);
      this.tone('sawtooth', 70, 280, 0.42, 0.14, 500);          // petit vroom de départ
      if (exact) setTimeout(() => this.tone('sine', 1760, 1760, 0.3, 0.14), 230);
    },
    ko() { this.tone('sawtooth', 130, 45, 0.55, 0.2, 700); },
    life() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone('sine', f, f, 0.18, 0.15), i * 90));
    },
  };

  /* ------------------------------ CLASSEMENT ------------------------------ */
  const Cloud = {
    client: null,
    init() {
      if (TEST) return;   // mode test : classement local uniquement
      const c = window.PUMP_CONFIG || {};
      if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient) {
        try { this.client = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY); }
        catch (e) { console.warn('Supabase indisponible', e); }
      }
    },
    get online() { return !!this.client; },
    async startRun() {
      if (!this.client) return null;
      try {
        const { data, error } = await this.client.rpc('start_run');
        if (error) throw error;
        return data;
      } catch (e) { console.warn(e); return null; }
    },
    async submit(runId, pseudo, score) {
      if (!this.client || !runId) throw new Error('hors ligne');
      const { error } = await this.client.rpc('submit_score', { p_run: runId, p_pseudo: pseudo, p_score: score });
      if (error) throw error;
    },
    async top(n = 20) {
      const { data, error } = await this.client
        .from('scores').select('pseudo,score,created_at')
        .order('score', { ascending: false }).order('created_at', { ascending: true }).limit(n);
      if (error) throw error;
      return data;
    },
  };

  const Local = {
    top() { return store.get('pp_scores', []); },
    add(pseudo, score) {
      const list = this.top();
      list.push({ pseudo, score, created_at: new Date().toISOString() });
      list.sort((a, b) => b.score - a.score || a.created_at.localeCompare(b.created_at));
      store.set('pp_scores', list.slice(0, 20));
    },
  };

  function renderBoard(ol, rows, me) {
    ol.textContent = '';
    let marked = false;
    rows.forEach((r) => {
      const li = document.createElement('li');
      const name = document.createElement('span'); name.className = 'name'; name.textContent = r.pseudo;
      const dots = document.createElement('span'); dots.className = 'dots';
      const sc = document.createElement('span'); sc.className = 'score'; sc.textContent = r.score;
      li.append(name, dots, sc);
      if (me && !marked && r.pseudo === me.pseudo && r.score === me.score) { li.className = 'me'; marked = true; }
      ol.append(li);
    });
  }

  async function loadBoard(ol, statusEl, me) {
    statusEl.textContent = '';
    try {
      let rows;
      if (Cloud.online) rows = await Cloud.top(20);
      else { rows = Local.top(); statusEl.textContent = TEXTS.boardLocal; }
      renderBoard(ol, rows, me);
      if (!rows.length) statusEl.textContent = TEXTS.boardEmpty;
    } catch (e) {
      console.warn(e);
      ol.textContent = '';
      statusEl.textContent = TEXTS.boardError;
    }
  }

  /* -------------------------------- ÉTAT -------------------------------- */
  const S = {
    phase: 'menu',        // menu | ready | pumping | result | over
    level: 1,
    lives: 1,
    piles: 0,
    params: null,
    liters: 0,
    price: 0,             // prix affiché (arrondi au centime)
    t: 0,                 // temps de pompage de la manche (s)
    phase0: 0,            // phase de l'oscillation du débit
    wobbleF: 2,
    last: 0,
    raf: 0,
    best: store.get('pp_best', 0),
    runPromise: null,
    lastScore: 0,
    submitted: false,
    nextTimer: 0,
  };

  function setMsg(text, cls) {
    el.msg.textContent = text || '';
    el.msg.className = 'msg' + (cls ? ' ' + cls : '');
  }

  function drawCounters() {
    S.price = round2(S.liters * CFG.ppl);
    el.price.textContent = fmt(S.price);
    el.liters.textContent = fmt(S.liters);
  }

  function nozzleOut(out) { document.body.classList.toggle('nozzle-out', out); }

  // Pastille LCD : met à jour la valeur et déclenche un petit flash (gain / perte)
  function setChip(node, value, kind) {
    node.textContent = value;
    if (!kind) return;
    node.classList.remove('gain', 'loss');
    void node.offsetWidth;
    node.classList.add(kind);
    setTimeout(() => node.classList.remove(kind), 450);
  }

  function setupRound() {
    S.params = levelParams(S.level);
    S.liters = 0; S.price = 0; S.t = 0;
    S.phase0 = Math.random() * Math.PI * 2;
    S.wobbleF = 1.5 + Math.random() * 1.5;
    el.level.textContent = S.level;
    el.lives.textContent = S.lives;
    el.target.textContent = fmt(S.params.target);
    el.tol.textContent = TEXTS.tol(S.params.tol);
    drawCounters();
    setMsg('');
    el.hint.textContent = TEXTS.hintReady;
    nozzleOut(false);            // la buse est rangée : on la prend en appuyant
    S.phase = 'ready';
  }

  function startGame() {
    clearTimeout(S.nextTimer);
    S.level = 1; S.lives = CFG.startLives; S.piles = 0; S.lastScore = 0;
    S.submitted = false; S.runPromise = null;
    el.over.hidden = true; el.boardScreen.hidden = true; el.rules.hidden = true;
    document.body.classList.remove('home');
    document.body.classList.add('playing');      // zoom léger sur le compteur
    setupRound();
  }

  /* ------------------------------ POMPAGE ------------------------------ */
  function pumpStart() {
    if (S.phase !== 'ready') return;
    Sound.init(); Sound.resume();
    if (!S.runPromise) S.runPromise = Cloud.startRun();
    S.phase = 'pumping';
    S.last = performance.now();
    document.body.classList.add('pumping');
    nozzleOut(true);
    el.hint.textContent = TEXTS.hintPump;
    Sound.click();
    Sound.startPump();
    S.raf = requestAnimationFrame(tick);
  }

  function tick(now) {
    if (S.phase !== 'pumping') return;
    const dt = Math.min(0.05, (now - S.last) / 1000);
    S.last = now;
    S.t += dt;
    const p = S.params;
    const ramp = Math.min(1, S.t / CFG.rampTime);
    const ease = ramp * ramp * (3 - 2 * ramp);
    const wobble = 1 + p.wobbleAmp * Math.sin(S.phase0 + S.t * S.wobbleF * Math.PI * 2);
    const flow = p.speed * ease * wobble;
    S.liters += flow * dt;

    if (S.liters >= CFG.tank) { S.liters = CFG.tank; drawCounters(); return pumpStop(true); }

    drawCounters();
    Sound.updatePump(S.liters / CFG.tank, Math.min(1, (p.speed * CFG.ppl) / CFG.maxRate));
    S.raf = requestAnimationFrame(tick);
  }

  function pumpStop(overflow) {
    if (S.phase !== 'pumping') return;
    cancelAnimationFrame(S.raf);
    S.phase = 'result';
    document.body.classList.remove('pumping');
    Sound.stopPump();
    if (navigator.vibrate) navigator.vibrate(12);

    drawCounters();
    el.hint.textContent = '';
    const delta = round2(S.price - S.params.target);

    const passed = !overflow && Math.abs(delta) <= S.params.tol + 1e-9;
    if (passed) {
      const pile = Math.abs(delta) <= CFG.pileTol + 1e-9;
      let gained = false;
      let text = TEXTS.inMargin(delta);
      if (pile) {
        S.piles += 1;
        if (S.lives < CFG.maxLives) { S.lives += 1; gained = true; text = TEXTS.pile; }
        else text = TEXTS.pileMax;
      }
      Sound.ok(pile);
      if (pile) {
        document.body.classList.add('pile');
        setTimeout(() => document.body.classList.remove('pile'), 1400);
        if (navigator.vibrate) navigator.vibrate([40, 30, 40, 30, 120]);
      }
      if (gained) setTimeout(() => Sound.life(), 380);
      setMsg(text, 'ok');
      setChip(el.lives, S.lives, gained ? 'gain' : null);
      S.lastScore = S.level;
      if (S.level > S.best) { S.best = S.level; store.set('pp_best', S.best); el.best.textContent = S.best; }
      if (S.level >= CFG.maxLevel) { S.nextTimer = setTimeout(() => gameOver({ win: true }), CFG.resultDelay); return; }
      S.nextTimer = setTimeout(() => { S.level += 1; setupRound(); }, CFG.resultDelay);
    } else {
      Sound.ko();
      if (navigator.vibrate) navigator.vibrate([60, 40, 90]);
      const text = overflow ? TEXTS.overflow : (delta > 0 ? TEXTS.missOver(delta) : TEXTS.missUnder(delta));
      setMsg(text, 'ko');
      document.body.classList.add('shake');
      setTimeout(() => document.body.classList.remove('shake'), 420);
      if (S.lives > 0) {
        S.lives -= 1;                                   // une vie de rechange est consommée
        setChip(el.lives, S.lives, 'loss');
        el.tol.textContent = TEXTS.lifeLeft(S.lives);   // même niveau, nouvel objectif
        S.nextTimer = setTimeout(() => setupRound(), CFG.resultDelay);
      } else {
        S.lastScore = S.level - 1;
        S.nextTimer = setTimeout(() => gameOver({ overflow, delta }), 1300);
      }
    }
  }

  /* ---------------------------- FIN DE PARTIE ---------------------------- */
  function gameOver(info) {
    S.phase = 'over';
    el.hint.textContent = '';
    const score = S.lastScore;
    el.overScore.textContent = score;
    el.overPiles.textContent = S.piles;
    if (info.win) { el.overTitle.textContent = 'Réservoir maître'; el.overDetail.textContent = `${CFG.maxLevel} niveaux. Impossible d'aller plus loin.`; }
    else {
      el.overTitle.textContent = TEXTS.overTitle;
      el.overDetail.textContent = info.overflow ? TEXTS.overOverflow : (info.delta > 0 ? TEXTS.overOver(info.delta) : TEXTS.overUnder(info.delta));
    }
    el.pseudo.value = store.get('pp_pseudo', '');
    el.submitMsg.textContent = '';
    el.submit.disabled = false;
    el.submitZone.hidden = score < 1;
    S.submitted = false;
    el.boardInline.textContent = '';
    el.over.hidden = false;
    loadBoard(el.boardInline, el.submitMsg, null);
  }

  async function submitScore() {
    if (S.submitted) return;
    const pseudo = el.pseudo.value.trim().slice(0, 16);
    if (!pseudo) { el.pseudo.focus(); return; }
    if (!pseudoOk(pseudo)) { el.submitMsg.textContent = TEXTS.badPseudo; el.pseudo.focus(); return; }
    store.set('pp_pseudo', pseudo);
    el.submit.disabled = true;
    const me = { pseudo, score: S.lastScore };
    try {
      if (Cloud.online) {
        const runId = await S.runPromise;
        await Cloud.submit(runId, pseudo, S.lastScore);
        el.submitMsg.textContent = TEXTS.submitOk;
      } else {
        Local.add(pseudo, S.lastScore);
        el.submitMsg.textContent = TEXTS.submitLocal;
      }
      S.submitted = true;
      const rows = Cloud.online ? await Cloud.top(20) : Local.top();
      renderBoard(el.boardInline, rows, me);
    } catch (e) {
      console.warn(e);
      el.submit.disabled = false;
      el.submitMsg.textContent = /pseudo/i.test((e && e.message) || '') ? TEXTS.badPseudo : TEXTS.submitFail;
    }
  }

  async function share() {
    const url = location.href.split('#')[0];
    const text = TEXTS.shareText(S.lastScore, S.piles);
    try {
      if (navigator.share) { await navigator.share({ text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      el.submitMsg.textContent = TEXTS.copied;
    } catch { /* partage annulé */ }
  }

  /* ------------------------------ ENTRÉES ------------------------------ */
  el.stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    if (S.phase === 'menu') { Sound.init(); Sound.resume(); Sound.click(); startGame(); return; }   // appuyer sur la pompe = jouer
    try { el.stage.setPointerCapture(e.pointerId); } catch { /* ignoré */ }
    pumpStart();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) =>
    el.stage.addEventListener(ev, () => pumpStop(false)));
  window.addEventListener('blur', () => pumpStop(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) pumpStop(false); });
  el.stage.addEventListener('contextmenu', (e) => e.preventDefault());

  let spaceDown = false;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || e.repeat) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
    e.preventDefault();
    if (S.phase === 'menu') { Sound.init(); Sound.resume(); startGame(); return; }
    if (!spaceDown) { spaceDown = true; pumpStart(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    spaceDown = false;
    pumpStop(false);
  });

  el.play.addEventListener('click', () => { Sound.init(); Sound.resume(); Sound.click(); startGame(); });
  el.replay.addEventListener('click', () => { Sound.init(); Sound.resume(); startGame(); });
  el.openRules.addEventListener('click', () => { el.rules.hidden = false; });
  el.rulesPlay.addEventListener('click', () => { store.set('pp_rules_seen', true); Sound.init(); Sound.resume(); Sound.click(); startGame(); });
  el.submit.addEventListener('click', submitScore);
  el.pseudo.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitScore(); });
  el.share.addEventListener('click', share);
  el.openBoard.addEventListener('click', () => { el.boardScreen.hidden = false; loadBoard(el.board, el.boardStatus, null); });
  el.closeBoard.addEventListener('click', () => { el.boardScreen.hidden = true; });
  el.mute.addEventListener('click', () => { Sound.init(); Sound.setMuted(!Sound.muted); syncMute(); });

  function syncMute() {
    el.mute.textContent = Sound.muted ? 'Son : non' : 'Son : oui';
    el.mute.setAttribute('aria-pressed', String(Sound.muted));
  }

  /* ------------------------------ DÉMARRAGE ------------------------------ */
  window.addEventListener('load', () => {
    Cloud.init();
    syncMute();
    el.best.textContent = S.best;
    el.ppl.textContent = CFG.ppl.toFixed(3).replace('.', ',');
    if (TEST) {
      const b = $('#test-badge');
      b.textContent = `Mode test · vitesse ×${String(TEST).replace('.', ',')} · scores non envoyés`;
      b.hidden = false;
    }
    S.params = { target: 0, tol: 0, speed: 0, wobbleAmp: 0 };
    el.lives.textContent = CFG.startLives;
    // Consigne adaptée à l'appareil
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    el.rulesControls.textContent = touch ? 'Garde le doigt appuyé sur la pompe.' : 'Clique et reste appuyé, ou maintiens la barre espace.';
    // Première visite : on explique les règles avant tout
    if (!store.get('pp_rules_seen', false)) el.rules.hidden = false;
  });
})();
