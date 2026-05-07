// ============================================================
// 交流会ゲームプラットフォーム - メインスクリプト
// ============================================================

// ============================================================
// ▼▼▼ GAS URL をここに設定する ▼▼▼
// GAS をデプロイして取得した「ウェブアプリURL」を貼り付けてください。
// 未設定のままでもダミーデータで動作します。
// ============================================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbx2sjDWooVq1x0u9WuWa2YHXpcyYR-iBNImn3en29b_MRpA7izwMYdSxSL59yNTuAVI/exec';
// ============================================================

// ---------- ダミーデータ（GAS未設定 or フェッチ失敗時に使用） ----------
const DUMMY_DATA = {
  english: [
    { topic: '富士山', ngwords: 'マウント,ボルケーノ,ジャパン,ヤマ' },
    { topic: '寿司', ngwords: 'ライス,フィッシュ,スシ,シーフード' },
    { topic: '新幹線', ngwords: 'トレイン,ブレット,スピード,レール' },
    { topic: '桜', ngwords: 'フラワー,ピンク,ツリー,チェリー' },
    { topic: '温泉', ngwords: 'ホット,ウォーター,バス,スパ' },
    { topic: '侍', ngwords: 'ソード,ジャパン,ウォーリアー,カタナ' },
  ],
  turtle: [
    {
      question: 'ある男が、海の見えないレストランでウミガメのスープを一口飲んだ。彼は涙を流して家に帰り、その夜自ら命を絶った。なぜ？',
      answer: '男はかつて漂流し、船の仲間が作ってくれたスープで生き延びた。そのスープを「ウミガメのスープ」だと思っていたが、レストランで本物を口にしたとき、あのスープが仲間の肉だったと悟った。'
    },
    {
      question: 'ある女性が、毎朝エレベーターで7階まで上がり、その後階段で10階の自室まで歩く。雨の日だけエレベーターで10階まで直行する。なぜ？',
      answer: '女性は背が低く、普段は傘の先でしか7階のボタンしか押せない。雨の日は傘を持っているので、それを使って10階のボタンを押せる。'
    },
    {
      question: '男が草原の真ん中で死んでいた。傍らには折れた棒がある。なぜ彼は死んだのか？',
      answer: '彼は盲目の綱渡り師だった。棒は長い棒（バランス棒）で、盲目の彼は棒の長さで自分が綱の上にいることを確認していた。棒が折れたとき、彼は自分がどこにいるかわからなくなり、転落した。'
    },
  ],
  wordwolf: [
    { citizen: '犬', wolf: '猫' },
    { citizen: 'コーヒー', wolf: '紅茶' },
    { citizen: '電車', wolf: 'バス' },
    { citizen: '夏', wolf: '冬' },
    { citizen: 'ラーメン', wolf: 'うどん' },
    { citizen: '映画館', wolf: 'カラオケ' },
  ],
  asama: [
    { question: '無人島に1つだけ持っていくなら？' },
    { question: '自分を動物に例えると？' },
    { question: '生まれ変わったら何になりたい？' },
    { question: '小学生の自分に一言アドバイスするなら？' },
    { question: '好きな季節とその理由は？' },
    { question: '人生で一番楽しかった思い出は？' },
  ]
};

// ---------- アプリケーション状態 ----------
const state = {
  data: null,         // { english, turtle, wordwolf } フェッチ後に格納
  loading: false,
  fetchError: false,
  usingDummy: false,
  activeTab: 'english',

  english: {
    current: null,    // { topic, ngwords }
    flipped: false,
  },

  turtle: {
    current: null,    // { question, answer }
    questionRevealed: false,
    answerRevealed: false,  // フリップ廃止→フェードイン展開
  },

  wordwolf: {
    flipped: false,
    result: null,       // { isWolf, myTopic, wolfPlayer, citizenTopic, wolfTopic }
    selectedVotee: null, // 選択中（未確定）の投票先名
    myVote: null,        // 確定済みの投票先名
    phase: 'setup',      // 'setup' | 'vote' | 'reveal' | 'result'
    myName: '',
    myNum: 0,            // GASが割り当てたスロット番号
    total: 0,
    keyword: '',
    round: 1,
    pollTimer: null,
    voteCount: 0,
    players: [],         // [{ slot, name }, ...]
    allVotes: [],        // [{ voter, votee }, ...]
  },

  asama: {
    phase: 'setup',   // 'setup' | 'answering' | 'waiting' | 'result'
    keyword: '',
    round: 1,
    playerName: '',
    myAnswer: '',
    topic: '',
    submitted: false,
    pollTimer: null,
    answerCount: 0,
    answers: [],
  }
};

// ============================================================
// ユーティリティ
// ============================================================

/**
 * djb2 ハッシュ関数 — 文字列から 32bit unsigned integer を生成
 * @param {string} str
 * @returns {number}
 */
function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash | 0; // 32bit 符号付き整数に丸める
  }
  return hash >>> 0; // 符号なし 32bit に変換
}

/**
 * Mulberry32 シード付き疑似乱数生成器
 * @param {number} seed - 初期シード値
 * @returns {function(): number} — 0以上1未満のfloatを返す関数
 */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ステータスメッセージを更新する
 * @param {string} elementId
 * @param {string} message
 * @param {'normal'|'loading'|'error'} type
 */
function setStatus(elementId, message, type = 'normal') {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = message;
  el.className = 'status-message'
    + (type === 'loading' ? ' is-loading' : '')
    + (type === 'error' ? ' is-error' : '');
}

// ============================================================
// GAS URLビルダー・XSSエスケープ
// ============================================================

function buildGasUrl(action, params) {
  if (isDummyMode()) return null;
  const qs = Object.entries(params)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
  return GAS_URL + '?action=' + encodeURIComponent(action) + '&' + qs;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// データ取得
// ============================================================

function isDummyMode() {
  return !GAS_URL || GAS_URL.trim() === '' || GAS_URL === 'YOUR_GAS_URL_HERE';
}

async function loadData() {
  if (isDummyMode()) {
    state.data = DUMMY_DATA;
    state.usingDummy = true;
    state.fetchError = false;
    return;
  }

  state.loading = true;
  try {
    const res = await fetch(GAS_URL, { redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!json.english || !json.turtle || !json.wordwolf) {
      throw new Error('レスポンスの形式が不正です');
    }
    if (!json.asama) json.asama = DUMMY_DATA.asama; // 旧GASとの後方互換
    state.data = json;
    state.usingDummy = false;
    state.fetchError = false;
  } catch (err) {
    console.warn('[GAS fetch 失敗] ダミーデータを使用します:', err.message);
    state.data = DUMMY_DATA;
    state.usingDummy = true;
    state.fetchError = true;
  } finally {
    state.loading = false;
  }
}

// ============================================================
// データソースバッジ
// ============================================================

function renderDataSourceBadge() {
  const container = document.getElementById('data-source-badge-container');
  if (!container) return;

  if (state.usingDummy) {
    const label = state.fetchError
      ? '⚠ GAS取得失敗 — ダミーデータ使用中'
      : '● ダミーデータ使用中（GAS URL 未設定）';
    container.innerHTML = `<span class="data-source-badge is-dummy">${label}</span>`;
  } else {
    container.innerHTML = `<span class="data-source-badge is-live">● GAS データ取得済み</span>`;
  }
}

// ============================================================
// カードフリップ
// ============================================================

/**
 * カードをフリップする（.is-flipped を追加）
 */
function flipCard(cardId) {
  const card = document.getElementById(cardId);
  if (card) card.classList.add('is-flipped');
}

/**
 * カードをアニメーションなしでリセットする
 */
function resetCard(cardId) {
  const card = document.getElementById(cardId);
  if (!card) return;
  card.style.transition = 'none';
  card.classList.remove('is-flipped');
  void card.offsetWidth; // 強制リフロー
  card.style.transition = '';
}

/**
 * すでにフリップ済みのカードを一度リセットしてから再フリップする
 * @param {string} cardId
 * @param {Function} onBeforeFlip - フリップ前に中身を書き換えるコールバック
 */
function reflipCard(cardId, onBeforeFlip) {
  resetCard(cardId);
  if (typeof onBeforeFlip === 'function') onBeforeFlip();
  setTimeout(() => flipCard(cardId), 50);
}

// ============================================================
// モーダル
// ============================================================

const modal = {
  overlay: null,
  confirmBtn: null,
  cancelBtn: null,
  onConfirm: null,

  init() {
    this.overlay = document.getElementById('modal-overlay');
    this.confirmBtn = document.getElementById('modal-confirm');
    this.cancelBtn = document.getElementById('modal-cancel');

    this.confirmBtn.addEventListener('click', () => {
      if (typeof this.onConfirm === 'function') this.onConfirm();
      this.hide();
    });

    this.cancelBtn.addEventListener('click', () => this.hide());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.hide();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('is-visible')) {
        this.hide();
      }
    });
  },

  show(message, onConfirm) {
    document.getElementById('modal-message').textContent = message;
    this.onConfirm = onConfirm;
    this.overlay.classList.add('is-visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    // フォーカスを確認ボタンへ
    setTimeout(() => this.confirmBtn.focus(), 50);
  },

  hide() {
    this.overlay.classList.remove('is-visible');
    this.overlay.setAttribute('aria-hidden', 'true');
    this.onConfirm = null;
  }
};

// ============================================================
// タブ切り替え
// ============================================================

function resetTabState(tab) {
  if (tab === 'english') {
    state.english.current = null;
    state.english.flipped = false;
    resetCard('english-card');
    const topicEl = document.getElementById('english-topic');
    const ngEl = document.getElementById('english-ngwords');
    if (topicEl) topicEl.textContent = '';
    if (ngEl) ngEl.innerHTML = '';
    setStatus('english-status', '');
  }

  if (tab === 'turtle') {
    state.turtle.current = null;
    state.turtle.questionRevealed = false;
    state.turtle.answerRevealed = false;

    const qEl = document.getElementById('turtle-question-display');
    if (qEl) {
      qEl.textContent = '「問題を引く」を押すと、ここに問題文が表示されます。';
      qEl.classList.add('is-empty');
    }

    const wrapperEl = document.getElementById('turtle-answer-wrapper');
    if (wrapperEl) {
      wrapperEl.classList.remove('is-revealed');
      wrapperEl.setAttribute('aria-hidden', 'true');
    }
    const aEl = document.getElementById('turtle-answer');
    if (aEl) aEl.textContent = '';

    const revealBtn = document.getElementById('btn-reveal-turtle');
    if (revealBtn) revealBtn.disabled = true;

    setStatus('turtle-status', '');
  }

  if (tab === 'wordwolf') {
    stopWolfPolling();

    state.wordwolf.flipped = false;
    state.wordwolf.result = null;
    state.wordwolf.selectedVotee = null;
    state.wordwolf.myVote = null;
    state.wordwolf.phase = 'setup';
    state.wordwolf.myName = '';
    state.wordwolf.myNum = 0;
    state.wordwolf.total = 0;
    state.wordwolf.keyword = '';
    state.wordwolf.round = 1;
    state.wordwolf.voteCount = 0;
    state.wordwolf.players = [];
    state.wordwolf.allVotes = [];

    resetCard('wordwolf-card');

    // フェーズセクションをリセット
    const ids = ['ww-setup', 'ww-vote-section', 'ww-reveal-section',
      'ww-reversal-section', 'ww-nonwolf-section', 'ww-final-section'];
    ids.forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.hidden = (i !== 0); // ww-setup だけ表示
    });

    // ボタン状態リセット
    const btnCheck = document.getElementById('btn-check-wordwolf');
    const btnVote = document.getElementById('btn-start-vote');
    const btnRevealWolf = document.getElementById('btn-reveal-wolf');
    const btnVoteConfirmR = document.getElementById('btn-vote-confirm');
    if (btnCheck) btnCheck.disabled = false;
    if (btnVote) btnVote.disabled = true;
    if (btnRevealWolf) btnRevealWolf.disabled = true;
    if (btnVoteConfirmR) {
      btnVoteConfirmR.disabled = true;
      btnVoteConfirmR.textContent = 'この人に投票する';
    }

    // 準備完了セクションをリセット
    const readySection = document.getElementById('ww-ready-section');
    const readyBtn = document.getElementById('btn-ww-ready');
    const waitingMsg = document.getElementById('ww-waiting-msg');
    if (readySection) readySection.hidden = true;
    if (readyBtn) readyBtn.hidden = false;
    if (waitingMsg) waitingMsg.hidden = true;

    // 入力・表示をクリア
    const nameInput = document.getElementById('ww-name');
    const topicEl = document.getElementById('ww-topic');
    const voteButtons = document.getElementById('ww-vote-buttons');
    const voteStatus = document.getElementById('ww-vote-status');
    const syncStatus = document.getElementById('ww-sync-status');
    const reversalInput = document.getElementById('ww-reversal-input');
    const voteListEl = document.getElementById('ww-vote-list');
    const topVotedEl = document.getElementById('ww-top-voted');
    if (nameInput) nameInput.value = '';
    if (topicEl) topicEl.textContent = '';
    if (voteButtons) voteButtons.innerHTML = '';
    if (voteStatus) voteStatus.textContent = '';
    if (syncStatus) syncStatus.textContent = '';
    if (reversalInput) reversalInput.value = '';
    if (voteListEl) { voteListEl.hidden = true; voteListEl.innerHTML = ''; }
    if (topVotedEl) { topVotedEl.hidden = true; topVotedEl.innerHTML = ''; }

    setStatus('wordwolf-status', '');
  }

  if (tab === 'asama') {
    stopAsamaPolling();

    state.asama.phase = 'setup';
    state.asama.keyword = '';
    state.asama.round = 1;
    state.asama.playerName = '';
    state.asama.myAnswer = '';
    state.asama.topic = '';
    state.asama.submitted = false;
    state.asama.answerCount = 0;
    state.asama.answers = [];

    const setupEl = document.getElementById('am-setup');
    const waitEl = document.getElementById('am-waiting');
    const resultEl = document.getElementById('am-result');
    if (setupEl) setupEl.hidden = false;
    if (waitEl) waitEl.hidden = true;
    if (resultEl) resultEl.hidden = true;

    const topicSection = document.getElementById('am-topic-section');
    if (topicSection) topicSection.hidden = true;

    const enterBtn = document.getElementById('btn-am-enter');
    if (enterBtn) enterBtn.disabled = false;

    const submitBtn = document.getElementById('btn-am-submit');
    if (submitBtn) submitBtn.disabled = false;

    const answerInput = document.getElementById('am-answer-input');
    if (answerInput) answerInput.value = '';

    const countStatus = document.getElementById('am-count-status');
    if (countStatus) countStatus.textContent = '回答数を確認中...';

    const myAnswerNote = document.getElementById('am-my-answer-note');
    if (myAnswerNote) myAnswerNote.textContent = '';

    setStatus('asama-status', '');
  }
}

function initTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      if (targetTab === state.activeTab) return;

      // 離れるタブの状態をリセット（揮発性）
      resetTabState(state.activeTab);

      // タブボタンの active 切り替え
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      // パネルの表示切り替え
      document.querySelectorAll('.game-panel').forEach(p => {
        p.classList.remove('active');
        p.hidden = true;
      });
      const targetPanel = document.getElementById('panel-' + targetTab);
      if (targetPanel) {
        targetPanel.classList.add('active');
        targetPanel.hidden = false;
      }

      state.activeTab = targetTab;
    });
  });
}

// ============================================================
// ゲームA: エイゴダーケ
// ============================================================

function initEnglishGame() {
  const btn = document.getElementById('btn-draw-english');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const topics = state.data?.english;
    if (!topics || topics.length === 0) {
      setStatus('english-status', 'お題データがありません', 'error');
      return;
    }

    const picked = topics[Math.floor(Math.random() * topics.length)];

    const doFlip = () => {
      document.getElementById('english-topic').textContent = picked.topic;
      // NGワードを個別バッジとして描画
      const container = document.getElementById('english-ngwords');
      container.innerHTML = '';
      picked.ngwords.split(',').forEach(word => {
        const badge = document.createElement('span');
        badge.className = 'ng-badge';
        badge.style.color = '#e74c3c';
        badge.style.fontWeight = '800';
        badge.textContent = word.trim();
        container.appendChild(badge);
      });
    };

    if (state.english.flipped) {
      reflipCard('english-card', doFlip);
    } else {
      doFlip();
      flipCard('english-card');
    }

    state.english.current = picked;
    state.english.flipped = true;
    setStatus('english-status', '');
  });
}

// ============================================================
// ゲームB: ウミガメのスープ
// ============================================================

function initTurtleGame() {
  const btnDraw = document.getElementById('btn-draw-turtle');
  const btnReveal = document.getElementById('btn-reveal-turtle');
  if (!btnDraw || !btnReveal) return;

  btnDraw.addEventListener('click', () => {
    const questions = state.data?.turtle;
    if (!questions || questions.length === 0) {
      setStatus('turtle-status', '問題データがありません', 'error');
      return;
    }

    const picked = questions[Math.floor(Math.random() * questions.length)];
    state.turtle.current = picked;
    state.turtle.questionRevealed = true;

    // 問題文エリアを更新
    const qEl = document.getElementById('turtle-question-display');
    if (qEl) {
      qEl.textContent = picked.question;
      qEl.classList.remove('is-empty');
    }

    // 真相テキストをセット（まだ非表示）
    const aEl = document.getElementById('turtle-answer');
    if (aEl) aEl.textContent = picked.answer;

    // 真相エリアが開いていれば閉じる
    if (state.turtle.answerRevealed) {
      const wrapperEl = document.getElementById('turtle-answer-wrapper');
      if (wrapperEl) {
        wrapperEl.classList.remove('is-revealed');
        wrapperEl.setAttribute('aria-hidden', 'true');
      }
      state.turtle.answerRevealed = false;
    }

    btnReveal.disabled = false;
    setStatus('turtle-status', '問題を引きました。出題者は「答えを見る」で真相を確認できます。');
  });

  btnReveal.addEventListener('click', () => {
    if (!state.turtle.current || state.turtle.answerRevealed) return;

    modal.show(
      '出題者として真相を確認します。\n他のプレイヤーから画面を隠してから「確認・表示する」を押してください。',
      () => {
        // フェードイン＋スライド展開
        const wrapperEl = document.getElementById('turtle-answer-wrapper');
        if (wrapperEl) {
          wrapperEl.classList.add('is-revealed');
          wrapperEl.setAttribute('aria-hidden', 'false');
        }
        state.turtle.answerRevealed = true;
        btnReveal.disabled = true;
        setStatus('turtle-status', '真相を表示しています。ゲーム終了後にタブを切り替えるとリセットされます。');
      }
    );
  });
}

// ============================================================
// ゲームC: ワードウルフ（シード付き乱数で同期）
// ============================================================

/** 投票ボタンを名前ベースで動的生成する（選択→確定の2ステップ） */
function renderVoteButtonsByName(players, myName) {
  const container = document.getElementById('ww-vote-buttons');
  const confirmBtn = document.getElementById('btn-vote-confirm');
  if (!container) return;
  container.innerHTML = '';

  if (!players || players.length === 0) {
    container.innerHTML =
      '<p style="color:var(--text-secondary);font-size:0.9rem">他のプレイヤーが見つかりません。' +
      'しばらく待ってから再度お試しください。</p>';
    return;
  }

  players.forEach(player => {
    const name = typeof player === 'string' ? player : player.name;
    const btn = document.createElement('button');
    btn.className = 'ww-vote-btn';
    btn.textContent = name;
    btn.dataset.voteName = name;

    if (name === myName) {
      btn.disabled = true;
      btn.classList.add('is-self');
      btn.setAttribute('aria-label', `${name}（自分）`);
    } else {
      btn.setAttribute('aria-label', `${name}を選択`);
      btn.addEventListener('click', () => {
        if (state.wordwolf.myVote !== null) return; // 確定済みなら無視

        // 選択状態を更新
        state.wordwolf.selectedVotee = name;

        // 全ボタンの選択クラスをリセットして、押したボタンに付与
        container.querySelectorAll('.ww-vote-btn').forEach(b => {
          b.classList.remove('is-selected-vote');
        });
        btn.classList.add('is-selected-vote');

        // 選択状態を表示
        const voteStatus = document.getElementById('ww-vote-status');
        if (voteStatus) {
          voteStatus.textContent =
            `${name}さんを選択中。よければ「この人に投票する」を押してください。`;
        }

        // 確定ボタンを有効化
        if (confirmBtn) confirmBtn.disabled = false;
      });
    }
    container.appendChild(btn);
  });
}

// ── ワードウルフ オンライン同期ユーティリティ ─────────────────────

function stopWolfPolling() {
  if (state.wordwolf.pollTimer !== null) {
    clearInterval(state.wordwolf.pollTimer);
    state.wordwolf.pollTimer = null;
  }
}

function startWolfPolling() {
  pollWolfVotes();
  state.wordwolf.pollTimer = setInterval(pollWolfVotes, 3000);
}

async function pollWolfVotes() {
  const syncEl = document.getElementById('ww-sync-status');
  if (!syncEl) return;

  const total = state.wordwolf.total;

  if (isDummyMode()) {
    const voted = state.wordwolf.myVote !== null ? 1 : 0;
    syncEl.textContent = `（ダミーモード）現在 ${voted} / ${total} 人が投票済み`;
    if (state.wordwolf.myVote !== null) {
      const revealBtn = document.getElementById('btn-reveal-wolf');
      if (revealBtn) revealBtn.disabled = false;
    }
    return;
  }

  try {
    const url = buildGasUrl('getVotes', {
      keyword: state.wordwolf.keyword,
      round: String(state.wordwolf.round),
    });
    const res = await fetch(url, { redirect: 'follow' });
    const json = await res.json();

    state.wordwolf.voteCount = json.voteCount || 0;
    if (json.players) state.wordwolf.players = json.players;
    if (json.votes) state.wordwolf.allVotes = json.votes;

    const voteCount = state.wordwolf.voteCount;
    syncEl.textContent = `現在 ${voteCount} / ${total} 人が投票済み`;

    const revealBtn = document.getElementById('btn-reveal-wolf');
    if (revealBtn) revealBtn.disabled = (voteCount < total);
  } catch {
    syncEl.textContent = '投票状況の取得に失敗しました';
  }
}

async function joinRoomWolf(keyword, round, name, total) {
  if (isDummyMode()) return { ok: true, slotNumber: 1 };
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'joinRoom',
        keyword,
        round: String(round),
        name,
        total: String(total),
      }),
      redirect: 'follow',
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: '通信エラー: ' + err.message };
  }
}

async function submitWolfVote(keyword, round, voter, votee, role) {
  if (isDummyMode()) return { ok: true };
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'submitVote',
        keyword,
        round: String(round),
        voter,
        votee,
        role,
      }),
      redirect: 'follow',
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: '通信エラー: ' + err.message };
  }
}

async function fetchAndShowVoteResult() {
  if (!isDummyMode()) {
    try {
      const url = buildGasUrl('getVotes', {
        keyword: state.wordwolf.keyword,
        round: String(state.wordwolf.round),
      });
      const res = await fetch(url, { redirect: 'follow' });
      const json = await res.json();
      if (json.players) state.wordwolf.players = json.players;
      if (json.votes) state.wordwolf.allVotes = json.votes;
    } catch { /* use cached data */ }
  }

  // 投票リスト表示
  const voteListEl = document.getElementById('ww-vote-list');
  if (voteListEl) {
    const votes = state.wordwolf.allVotes;
    if (votes.length === 0) {
      voteListEl.hidden = true;
    } else {
      const items = votes.map(v =>
        `<li><strong>${escapeHtml(v.voter)}</strong> → ${escapeHtml(v.votee)}</li>`
      ).join('');
      voteListEl.hidden = false;
      voteListEl.innerHTML =
        `<h4 class="ww-vote-list-title">誰が誰に投票したか</h4>` +
        `<ul class="ww-vote-list-items">${items}</ul>`;
    }
  }

  // 最多得票者表示
  const topVotedEl = document.getElementById('ww-top-voted');
  if (topVotedEl && state.wordwolf.allVotes.length > 0) {
    const counts = {};
    state.wordwolf.allVotes.forEach(v => {
      if (v.votee) counts[v.votee] = (counts[v.votee] || 0) + 1;
    });
    const maxVotes = Math.max(...Object.values(counts));
    const topNames = Object.keys(counts).filter(k => counts[k] === maxVotes);

    const wolfPlayer = state.wordwolf.result.wolfPlayer;
    const wolfObj = state.wordwolf.players.find(p => p.slot === wolfPlayer);
    const wolfName = wolfObj?.name;
    const topIsWolf = wolfName && topNames.includes(wolfName);

    const nameStr = topNames.map(escapeHtml).join('・');
    const roleText = topIsWolf
      ? `${nameStr}さんは【ウルフ】でした！`
      : `${nameStr}さんは【市民】でした。ウルフの逃げ切り勝利！`;

    topVotedEl.hidden = false;
    topVotedEl.innerHTML =
      `<div class="ww-top-voted-content">` +
      `<p class="ww-top-voted-label">最多得票 (${maxVotes}票)</p>` +
      `<p class="ww-top-voted-role">${roleText}</p>` +
      `</div>`;
  }
}

/** 最終結果を表示する（'wolf-win' | 'citizen-win' | 'reveal'） */
function showWolfFinalResult(type) {
  const { wolfPlayer, citizenTopic, wolfTopic } = state.wordwolf.result;

  // ウルフプレイヤー名を特定
  const wolfObj = state.wordwolf.players.find(p => p.slot === wolfPlayer);
  const wolfName = wolfObj?.name || `プレイヤー${wolfPlayer}`;

  // ヘッドライン組み立て
  const headlineEl = document.getElementById('ww-final-headline');
  if (headlineEl) {
    if (type === 'wolf-win') {
      headlineEl.innerHTML =
        `<p class="ww-final-title ww-final-wolf-win">ウルフの逆転勝利！</p>` +
        `<p class="ww-final-outcome-sub">お題を見破られました</p>`;
    } else if (type === 'citizen-win') {
      headlineEl.innerHTML =
        `<p class="ww-final-title ww-final-citizen-win">市民の勝利！</p>` +
        `<p class="ww-final-outcome-sub">逃げ切り成功！</p>`;
    } else {
      headlineEl.innerHTML =
        `<p class="ww-final-title ww-final-reveal">実は ${escapeHtml(wolfName)} がウルフでした</p>`;
    }
  }

  // 詳細セット
  const el = (id) => document.getElementById(id);
  if (el('ww-final-wolf-num')) el('ww-final-wolf-num').textContent = wolfName;
  if (el('ww-final-citizen')) el('ww-final-citizen').textContent = citizenTopic;
  if (el('ww-final-wolf-topic')) el('ww-final-wolf-topic').textContent = wolfTopic;

  // reveal セクションを隠して final を表示
  const revealEl = document.getElementById('ww-reveal-section');
  const finalEl = document.getElementById('ww-final-section');
  if (revealEl) revealEl.hidden = true;
  if (finalEl) finalEl.hidden = false;

  state.wordwolf.phase = 'result';
}

function initWordWolfGame() {
  const btnCheck = document.getElementById('btn-check-wordwolf');
  const btnVote = document.getElementById('btn-start-vote');
  const btnVoteConfirm = document.getElementById('btn-vote-confirm');
  const btnReveal = document.getElementById('btn-reveal-wolf');
  const btnReversal = document.getElementById('btn-submit-reversal');
  const btnFinal = document.getElementById('btn-show-final');
  const btnReset = document.getElementById('btn-ww-reset');
  if (!btnCheck) return;

  // ── 役割を確認する（GASに入室登録 → スロット番号取得 → お題決定）──
  btnCheck.addEventListener('click', async () => {
    const topics = state.data?.wordwolf;
    if (!topics || topics.length === 0) {
      setStatus('wordwolf-status', 'お題データがありません', 'error'); return;
    }

    const keyword = document.getElementById('ww-keyword').value.trim();
    const round = parseInt(document.getElementById('ww-round').value, 10);
    const name = document.getElementById('ww-name').value.trim();
    const total = parseInt(document.getElementById('ww-total').value, 10);

    if (!keyword) {
      setStatus('wordwolf-status', '合言葉を入力してください', 'error'); return;
    }
    if (isNaN(round) || round < 1) {
      setStatus('wordwolf-status', '回戦数は1以上の整数を入力してください', 'error'); return;
    }
    if (!name) {
      setStatus('wordwolf-status', '名前を入力してください', 'error'); return;
    }
    if (isNaN(total) || total < 2) {
      setStatus('wordwolf-status', '総人数は2以上の整数を入力してください', 'error'); return;
    }

    btnCheck.disabled = true;
    setStatus('wordwolf-status', '入室中...', 'loading');

    // GASに入室登録してスロット番号を取得
    const joinResult = await joinRoomWolf(keyword, round, name, total);
    if (!joinResult.ok) {
      setStatus('wordwolf-status', joinResult.error || '入室に失敗しました', 'error');
      btnCheck.disabled = false;
      return;
    }

    const myNum = joinResult.slotNumber;

    // ─── シード付き乱数（全員が同じお題・ウルフ番号を計算）───
    const seed = djb2Hash(keyword + String(round));
    const random = mulberry32(seed);
    const topicIndex = Math.floor(random() * topics.length);
    const wolfPlayer = Math.floor(random() * total) + 1;
    // ───────────────────────────────────────────────────────

    const picked = topics[topicIndex];
    const isWolf = (myNum === wolfPlayer);
    const myTopic = isWolf ? picked.wolf : picked.citizen;

    state.wordwolf.result = {
      isWolf,
      myTopic,
      wolfPlayer,
      citizenTopic: picked.citizen,
      wolfTopic: picked.wolf,
    };
    state.wordwolf.myName = name;
    state.wordwolf.myNum = myNum;
    state.wordwolf.total = total;
    state.wordwolf.keyword = keyword;
    state.wordwolf.round = round;

    setStatus('wordwolf-status', '');

    // モーダル確認 → カードフリップ
    modal.show(
      '周りのプレイヤーから画面を隠してから\n「確認・表示する」を押してください。',
      () => {
        const doFlip = () => {
          const topicEl = document.getElementById('ww-topic');
          if (topicEl) topicEl.textContent = myTopic;
        };
        if (state.wordwolf.flipped) {
          reflipCard('wordwolf-card', doFlip);
        } else {
          doFlip();
          flipCard('wordwolf-card');
        }
        state.wordwolf.flipped = true;
        btnCheck.disabled = true;
        const readySection = document.getElementById('ww-ready-section');
        if (readySection) readySection.hidden = false;
      }
    );
  });

  // ── 確認しました（準備完了） ────────────────────────────────
  const btnReady = document.getElementById('btn-ww-ready');
  if (btnReady) {
    btnReady.addEventListener('click', () => {
      btnReady.hidden = true;
      const waitingMsg = document.getElementById('ww-waiting-msg');
      if (waitingMsg) waitingMsg.hidden = false;
      if (btnVote) btnVote.disabled = false;
    });
  }

  // ── 投票する ────────────────────────────────────────────────
  if (btnVote) {
    btnVote.addEventListener('click', async () => {
      if (!state.wordwolf.result) {
        setStatus('wordwolf-status', '先に「役割を確認する」を押してください', 'error'); return;
      }
      document.getElementById('ww-setup').hidden = true;
      document.getElementById('ww-vote-section').hidden = false;
      state.wordwolf.phase = 'vote';

      // 確認ボタンをロック（全員投票完了まで）
      if (btnReveal) btnReveal.disabled = true;

      // 参加プレイヤー一覧を取得して投票ボタン生成
      let players = [];
      if (isDummyMode()) {
        players = Array.from({ length: state.wordwolf.total }, (_, i) => ({
          slot: i + 1,
          name: (i + 1 === state.wordwolf.myNum)
            ? state.wordwolf.myName
            : `デモ${i + 1}番`,
        }));
      } else {
        try {
          const url = buildGasUrl('getVotes', {
            keyword: state.wordwolf.keyword,
            round: String(state.wordwolf.round),
          });
          const res = await fetch(url, { redirect: 'follow' });
          const json = await res.json();
          players = json.players || [];
        } catch { /* 空のまま */ }

        // 自分が未登録の場合に補完
        if (!players.some(p => p.name === state.wordwolf.myName)) {
          players.push({ slot: state.wordwolf.myNum, name: state.wordwolf.myName });
          players.sort((a, b) => a.slot - b.slot);
        }
      }

      state.wordwolf.players = players;
      renderVoteButtonsByName(players, state.wordwolf.myName);
      startWolfPolling();
      setStatus('wordwolf-status', '');
    });
  }

  // ── この人に投票する（GAS送信・確定）──────────────────────────
  if (btnVoteConfirm) {
    btnVoteConfirm.addEventListener('click', async () => {
      const name = state.wordwolf.selectedVotee;
      if (!name || state.wordwolf.myVote !== null) return;

      // 投票を確定
      state.wordwolf.myVote = name;

      // 全ボタンをロック。選択ボタンだけ is-voted に変更
      const container = document.getElementById('ww-vote-buttons');
      if (container) {
        container.querySelectorAll('.ww-vote-btn').forEach(b => {
          b.classList.remove('is-selected-vote');
          b.disabled = true;
          if (b.dataset.voteName === name) {
            b.classList.add('is-voted');
            b.disabled = false; // 視覚的に投票先を明示するため opacity を維持
          }
        });
      }

      // 確定ボタンを投票済み状態に
      btnVoteConfirm.disabled = true;
      btnVoteConfirm.textContent = '投票済み ✓';

      const voteStatus = document.getElementById('ww-vote-status');
      if (voteStatus) {
        voteStatus.textContent =
          `${name}さんに投票しました。全員の投票が揃うまでお待ちください。`;
      }

      // GASに送信
      const role = state.wordwolf.result.isWolf ? 'wolf' : 'citizen';
      await submitWolfVote(
        state.wordwolf.keyword,
        state.wordwolf.round,
        state.wordwolf.myName,
        name,
        role
      );
    });
  }

  // ── 正解を確認する ──────────────────────────────────────────
  if (btnReveal) {
    btnReveal.addEventListener('click', async () => {
      stopWolfPolling();

      document.getElementById('ww-vote-section').hidden = true;
      document.getElementById('ww-reveal-section').hidden = false;

      // 投票データ取得＆リスト・最多得票表示
      await fetchAndShowVoteResult();

      // ウルフ名を全員に表示
      const { wolfPlayer, isWolf } = state.wordwolf.result;
      const wolfObj = state.wordwolf.players.find(p => p.slot === wolfPlayer);
      const wolfName = wolfObj?.name || `プレイヤー${wolfPlayer}`;
      const numEl = document.getElementById('ww-announce-wolf-num');
      if (numEl) numEl.textContent = wolfName;

      // ウルフ本人 → 逆転チャレンジ  /  市民 → 最終結果ボタン
      if (isWolf) {
        document.getElementById('ww-reversal-section').hidden = false;
      } else {
        document.getElementById('ww-nonwolf-section').hidden = false;
      }
      state.wordwolf.phase = 'reveal';
      setStatus('wordwolf-status', '');
    });
  }

  // ── 回答する（ウルフ逆転チャレンジ）────────────────────────
  if (btnReversal) {
    btnReversal.addEventListener('click', () => {
      const input = document.getElementById('ww-reversal-input');
      const answer = input ? input.value.trim() : '';
      if (!answer) {
        setStatus('wordwolf-status', '回答を入力してください', 'error'); return;
      }
      const correct = (answer === state.wordwolf.result.citizenTopic.trim());
      showWolfFinalResult(correct ? 'wolf-win' : 'citizen-win');
    });
  }

  // ── 最終結果を見る（市民）──────────────────────────────────
  if (btnFinal) {
    btnFinal.addEventListener('click', () => {
      showWolfFinalResult('reveal');
    });
  }

  // ── もう一回プレイ ─────────────────────────────────────────
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      const nextRound = state.wordwolf.round + 1;
      const savedKeyword = state.wordwolf.keyword;
      const savedName = state.wordwolf.myName;
      const savedTotal = state.wordwolf.total;

      resetTabState('wordwolf');

      const keywordInput = document.getElementById('ww-keyword');
      const roundInput = document.getElementById('ww-round');
      const nameInput = document.getElementById('ww-name');
      const totalInput = document.getElementById('ww-total');
      if (keywordInput && savedKeyword) keywordInput.value = savedKeyword;
      if (roundInput) roundInput.value = nextRound;
      if (nameInput && savedName) nameInput.value = savedName;
      if (totalInput && savedTotal) totalInput.value = savedTotal;
    });
  }
}

// ============================================================
// ゲームD: 朝までそれ正解（リアルタイム同期）
// ============================================================

function stopAsamaPolling() {
  if (state.asama.pollTimer !== null) {
    clearInterval(state.asama.pollTimer);
    state.asama.pollTimer = null;
  }
}

function startAsamaPolling() {
  pollAsamaCount();
  state.asama.pollTimer = setInterval(pollAsamaCount, 3000);
}

async function pollAsamaCount() {
  const el = document.getElementById('am-count-status');
  if (!el) return;

  if (isDummyMode()) {
    el.textContent = '（ダミーモード）現在 1 人が回答済み';
    return;
  }

  try {
    const url = buildGasUrl('getAnswers', {
      keyword: state.asama.keyword,
      round: String(state.asama.round),
    });
    const res = await fetch(url, { redirect: 'follow' });
    const json = await res.json();
    state.asama.answerCount = json.count || 0;
    el.textContent = `現在 ${state.asama.answerCount} 人が回答済み`;
  } catch (err) {
    el.textContent = '回答数の取得に失敗しました';
  }
}

async function fetchAndShowAnswers() {
  setStatus('asama-status', '回答を取得中...', 'loading');

  let answers = [];

  if (isDummyMode()) {
    answers = [
      { name: state.asama.playerName || '自分', answer: state.asama.myAnswer || '（未送信）' },
      { name: 'デモA', answer: 'これはデモ回答です' },
      { name: 'デモB', answer: '別のデモ回答' },
    ];
  } else {
    try {
      const url = buildGasUrl('getAnswers', {
        keyword: state.asama.keyword,
        round: String(state.asama.round),
      });
      const res = await fetch(url, { redirect: 'follow' });
      const json = await res.json();
      answers = json.answers || [];
    } catch (err) {
      setStatus('asama-status', '回答の取得に失敗しました', 'error');
      return;
    }
  }

  state.asama.answers = answers;
  state.asama.phase = 'result';

  document.getElementById('am-waiting').hidden = true;
  document.getElementById('am-result').hidden = false;

  const topicEl = document.getElementById('am-result-topic');
  if (topicEl) topicEl.textContent = `お題: ${state.asama.topic}`;

  const listEl = document.getElementById('am-answers-list');
  if (listEl) {
    listEl.innerHTML = '';
    if (answers.length === 0) {
      listEl.innerHTML =
        '<p style="color:var(--text-secondary);text-align:center;padding:24px 0">まだ回答がありません</p>';
    } else {
      // ウミガメのスープ「問題文エリア」と同じ question-display カードを再利用
      answers.forEach(({ name, answer }) => {
        const card = document.createElement('div');
        card.className = 'question-display';
        card.innerHTML =
          `<span class="answer-label">${escapeHtml(name)}</span>` +
          `<p class="answer-value">${escapeHtml(answer)}</p>`;
        listEl.appendChild(card);
      });
    }
  }

  setStatus('asama-status', '');
}

function initAsamaGame() {
  const btnEnter = document.getElementById('btn-am-enter');
  const btnSubmit = document.getElementById('btn-am-submit');
  const btnReveal = document.getElementById('btn-am-reveal');
  const btnReset = document.getElementById('btn-am-reset');
  if (!btnEnter) return;

  // ── 入室する ─────────────────────────────────────────────────
  btnEnter.addEventListener('click', () => {
    const keyword = document.getElementById('am-keyword').value.trim();
    const round = parseInt(document.getElementById('am-round').value, 10);
    const name = document.getElementById('am-name').value.trim();

    if (!keyword) {
      setStatus('asama-status', '合言葉を入力してください', 'error'); return;
    }
    if (isNaN(round) || round < 1) {
      setStatus('asama-status', '回戦数は1以上の整数を入力してください', 'error'); return;
    }
    if (!name) {
      setStatus('asama-status', '名前を入力してください', 'error'); return;
    }

    const topics = state.data?.asama;
    if (!topics || topics.length === 0) {
      setStatus('asama-status', 'お題データがありません', 'error'); return;
    }

    // ワードウルフと同じシード付き乱数でお題を決定（全員が同じお題になる）
    const seed = djb2Hash(keyword + String(round));
    const random = mulberry32(seed);
    const index = Math.floor(random() * topics.length);
    const topic = topics[index].question;

    state.asama.keyword = keyword;
    state.asama.round = round;
    state.asama.playerName = name;
    state.asama.topic = topic;
    state.asama.phase = 'answering';

    document.getElementById('am-topic-text').textContent = topic;
    document.getElementById('am-topic-section').hidden = false;
    btnEnter.disabled = true;
    setStatus('asama-status', '');
  });

  // ── 回答を送信する ───────────────────────────────────────────
  if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
      const answer = document.getElementById('am-answer-input').value.trim();
      if (!answer) {
        setStatus('asama-status', '回答を入力してください', 'error'); return;
      }

      btnSubmit.disabled = true;
      setStatus('asama-status', '送信中...', 'loading');

      if (!isDummyMode()) {
        try {
          // POST + Content-Type: text/plain で preflight を発生させずに送信
          // GAS 側は doPost で e.postData.contents を JSON.parse して受け取る
          const res = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
              action: 'submitAnswer',
              keyword: state.asama.keyword,
              round: String(state.asama.round),
              name: state.asama.playerName,
              answer: answer,
            }),
            redirect: 'follow',
          });
          const json = await res.json();
          if (!json.ok) {
            setStatus('asama-status', '送信エラー: ' + (json.error || ''), 'error');
            btnSubmit.disabled = false;
            return;
          }
        } catch (err) {
          setStatus('asama-status', '送信に失敗しました（通信エラー）', 'error');
          btnSubmit.disabled = false;
          return;
        }
      }

      state.asama.myAnswer = answer;
      state.asama.submitted = true;
      state.asama.phase = 'waiting';

      document.getElementById('am-setup').hidden = true;
      document.getElementById('am-waiting').hidden = false;

      const noteEl = document.getElementById('am-my-answer-note');
      if (noteEl) noteEl.textContent = `あなたの回答: ${answer}`;

      setStatus('asama-status', '');
      startAsamaPolling();
    });
  }

  // ── 全員の回答を見る ─────────────────────────────────────────
  if (btnReveal) {
    btnReveal.addEventListener('click', async () => {
      stopAsamaPolling();
      await fetchAndShowAnswers();
    });
  }

  // ── もう一回プレイ ────────────────────────────────────────────
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      const nextRound = state.asama.round + 1;
      resetTabState('asama');

      const roundInput = document.getElementById('am-round');
      if (roundInput) roundInput.value = nextRound;

      // 合言葉・名前が入力済みなら自動入室（既存の入室ハンドラをそのまま呼ぶ）
      const keyword = document.getElementById('am-keyword').value.trim();
      const name = document.getElementById('am-name').value.trim();
      if (keyword && name) btnEnter.click();
    });
  }
}

// ============================================================
// 初期化
// ============================================================

async function init() {
  // モーダルとタブを先に初期化
  modal.init();
  initTabs();

  // ローディング表示
  ['english', 'turtle', 'wordwolf', 'asama'].forEach(tab => {
    setStatus(tab + '-status', 'データを読み込み中...', 'loading');
  });

  // データ取得
  await loadData();

  // ローディング解除
  ['english', 'turtle', 'wordwolf', 'asama'].forEach(tab => {
    setStatus(tab + '-status', '');
  });

  // データソースバッジ更新
  renderDataSourceBadge();

  // 各ゲーム初期化
  initEnglishGame();
  initTurtleGame();
  initWordWolfGame();
  initAsamaGame();
}

document.addEventListener('DOMContentLoaded', init);
