// ============================================================
// Google Apps Script - 交流会ゲームプラットフォーム
// ============================================================
// 使い方:
//   1. このコードを Google Apps Script エディタに貼り付ける
//   2. SPREADSHEET_ID を実際のスプレッドシートIDに書き換える
//      (スプレッドシートのURLの /d/XXXXXXXXX/edit の部分)
//   3. 「デプロイ」→「新しいデプロイ」→「ウェブアプリ」
//      - 実行するユーザー: 自分
//      - アクセスできるユーザー: 全員
//   4. デプロイ後に表示されるURLをフロントエンドの app.js に設定する
// ============================================================

var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // ← ここを書き換える

// ──────────────────────────────────────────────────────────────
// エントリーポイント
//
// GET  : ゲームデータ取得 (action なし) / 回答一覧取得 (action=getAnswers)
// POST : 回答送信 (body の action=submitAnswer)
//        Content-Type: text/plain で送信することで preflight を回避
// ──────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';

    if (action === 'getAnswers') return handleGetAnswers(e.parameter);
    if (action === 'getVotes')   return handleGetVotes(e.parameter);

    // デフォルト: 全ゲームデータを返す（既存動作と互換）
    return handleGetGameData();

  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function doPost(e) {
  try {
    // Content-Type: text/plain で送られた JSON ボディをパース
    var body   = JSON.parse(e.postData.contents);
    var action = body.action || '';

    if (action === 'submitAnswer') return handleSubmitAnswer(body);
    if (action === 'joinRoom')     return handleJoinRoom(body);
    if (action === 'submitVote')   return handleSubmitVote(body);

    return jsonOut({ ok: false, error: '不明なアクション: ' + action });
  } catch (err) {
    return jsonOut({ ok: false, error: err.message });
  }
}

// ──────────────────────────────────────────────────────────────
// ゲームデータ取得（action なし / デフォルト）
// ──────────────────────────────────────────────────────────────

function handleGetGameData() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var english  = readSheet(ss, '英語限定',       ['お題', 'NGワード'],           ['topic', 'ngwords']);
  var turtle   = readSheet(ss, 'ウミガメ',       ['問題文', '真相'],             ['question', 'answer']);
  var wordwolf = readSheet(ss, 'ワードウルフ',   ['市民のお題', 'ウルフのお題'], ['citizen', 'wolf']);
  var asama    = readSheet(ss, '朝までそれ正解', ['お題'],                       ['question']);

  return jsonOut({ english: english, turtle: turtle, wordwolf: wordwolf, asama: asama });
}

// ──────────────────────────────────────────────────────────────
// 回答送信（action=submitAnswer）
// パラメータ: keyword, round, name, answer
// 同一 keyword+round+name なら上書き、なければ新規追加
// ──────────────────────────────────────────────────────────────

function handleSubmitAnswer(params) {
  var keyword = String(params.keyword || '').trim();
  var round   = String(params.round   || '1').trim();
  var name    = String(params.name    || '').trim();
  var answer  = String(params.answer  || '').trim();

  if (!keyword || !name || !answer) {
    return jsonOut({ ok: false, error: 'パラメータが不足しています' });
  }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getOrCreateAnswersSheet(ss);
  var data  = sheet.getDataRange().getValues();

  // 同じ keyword + round + name の行があれば上書き（1行目はヘッダー）
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === keyword &&
        String(data[i][1]) === round   &&
        String(data[i][2]) === name) {
      sheet.getRange(i + 1, 4).setValue(answer);
      sheet.getRange(i + 1, 5).setValue(new Date());
      return jsonOut({ ok: true, updated: true });
    }
  }

  // 新規追加
  sheet.appendRow([keyword, round, name, answer, new Date()]);
  return jsonOut({ ok: true, updated: false });
}

// ──────────────────────────────────────────────────────────────
// 回答一覧取得（action=getAnswers）
// パラメータ: keyword, round
// ──────────────────────────────────────────────────────────────

function handleGetAnswers(params) {
  var keyword = String(params.keyword || '').trim();
  var round   = String(params.round   || '1').trim();

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getOrCreateAnswersSheet(ss);
  var data  = sheet.getDataRange().getValues();

  var answers = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === keyword && String(data[i][1]) === round) {
      answers.push({ name: String(data[i][2]), answer: String(data[i][3]) });
    }
  }

  return jsonOut({ answers: answers, count: answers.length });
}

// ──────────────────────────────────────────────────────────────
// ワードウルフ: 入室登録（action=joinRoom）
// パラメータ: keyword, round, name, total
// 同一 keyword+round+name なら既存スロット番号を返す
// ──────────────────────────────────────────────────────────────

function handleJoinRoom(params) {
  var keyword = String(params.keyword || '').trim();
  var round   = String(params.round   || '1').trim();
  var name    = String(params.name    || '').trim();
  var total   = parseInt(params.total || '0', 10);

  if (!keyword || !name) {
    return jsonOut({ ok: false, error: 'パラメータが不足しています' });
  }
  if (isNaN(total) || total < 2) {
    return jsonOut({ ok: false, error: '総人数が不正です' });
  }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getOrCreateVotesSheet(ss);
  var data  = sheet.getDataRange().getValues();

  // 同じ keyword+round+name がすでに存在すれば既存スロットを返す
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === keyword &&
        String(data[i][1]) === round   &&
        String(data[i][3]) === name) {
      return jsonOut({ ok: true, slotNumber: parseInt(data[i][2], 10) });
    }
  }

  // この keyword+round の登録数をカウント
  var count = 0;
  for (var j = 1; j < data.length; j++) {
    if (String(data[j][0]) === keyword && String(data[j][1]) === round) {
      count++;
    }
  }

  if (count >= total) {
    return jsonOut({ ok: false, error: '部屋が満員です（' + total + '人）' });
  }

  var slotNumber = count + 1;
  sheet.appendRow([keyword, round, slotNumber, name, '', '', new Date()]);
  return jsonOut({ ok: true, slotNumber: slotNumber });
}

// ──────────────────────────────────────────────────────────────
// ワードウルフ: 投票送信（action=submitVote）
// パラメータ: keyword, round, voter, votee, role
// ──────────────────────────────────────────────────────────────

function handleSubmitVote(params) {
  var keyword = String(params.keyword || '').trim();
  var round   = String(params.round   || '1').trim();
  var voter   = String(params.voter   || '').trim();
  var votee   = String(params.votee   || '').trim();
  var role    = String(params.role    || '').trim();

  if (!keyword || !voter || !votee) {
    return jsonOut({ ok: false, error: 'パラメータが不足しています' });
  }

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getOrCreateVotesSheet(ss);
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === keyword &&
        String(data[i][1]) === round   &&
        String(data[i][3]) === voter) {
      sheet.getRange(i + 1, 5).setValue(votee);
      sheet.getRange(i + 1, 6).setValue(role);
      sheet.getRange(i + 1, 7).setValue(new Date());
      return jsonOut({ ok: true });
    }
  }

  return jsonOut({ ok: false, error: '投票者が登録されていません。先に入室してください。' });
}

// ──────────────────────────────────────────────────────────────
// ワードウルフ: 投票状況取得（action=getVotes）
// パラメータ: keyword, round
// 戻り値: { players, votes, voteCount, totalCount }
// ──────────────────────────────────────────────────────────────

function handleGetVotes(params) {
  var keyword = String(params.keyword || '').trim();
  var round   = String(params.round   || '1').trim();

  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getOrCreateVotesSheet(ss);
  var data  = sheet.getDataRange().getValues();

  var players = [];
  var votes   = [];

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === keyword && String(data[i][1]) === round) {
      var slot  = parseInt(data[i][2], 10);
      var name  = String(data[i][3]);
      var votee = String(data[i][4]);

      players.push({ slot: slot, name: name });
      if (votee) {
        votes.push({ voter: name, votee: votee });
      }
    }
  }

  players.sort(function(a, b) { return a.slot - b.slot; });

  return jsonOut({
    players:    players,
    votes:      votes,
    voteCount:  votes.length,
    totalCount: players.length
  });
}

// ──────────────────────────────────────────────────────────────
// ユーティリティ
// ──────────────────────────────────────────────────────────────

/**
 * Votes シートを取得または新規作成する
 * 列構成: キーワード | 回戦数 | スロット | 名前 | 投票先名 | 役職 | タイムスタンプ
 */
function getOrCreateVotesSheet(ss) {
  var sheet = ss.getSheetByName('Votes');
  if (!sheet) {
    sheet = ss.insertSheet('Votes');
    sheet.appendRow(['キーワード', '回戦数', 'スロット', '名前', '投票先名', '役職', 'タイムスタンプ']);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(['キーワード', '回戦数', 'スロット', '名前', '投票先名', '役職', 'タイムスタンプ']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * Answers シートを取得または新規作成する
 * 初回 submitAnswer 時に自動的に作成される
 */
function getOrCreateAnswersSheet(ss) {
  var sheet = ss.getSheetByName('Answers');
  if (!sheet) {
    sheet = ss.insertSheet('Answers');
    sheet.appendRow(['キーワード', '回戦数', '名前', '回答', 'タイムスタンプ']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * 指定シートのデータを読み取ってオブジェクト配列で返す
 */
function readSheet(ss, sheetName, headers, keys) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    Logger.log('シートが見つかりません: ' + sheetName);
    return [];
  }

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var numCols = headers.length;
  var range   = sheet.getRange(2, 1, lastRow - 1, numCols);
  var values  = range.getValues();

  var result = [];
  values.forEach(function(row) {
    var isEmpty = row.every(function(cell) {
      return cell === '' || cell === null || cell === undefined;
    });
    if (isEmpty) return;

    var obj = {};
    keys.forEach(function(key, i) {
      obj[key] = String(row[i] !== null && row[i] !== undefined ? row[i] : '').trim();
    });
    result.push(obj);
  });

  return result;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ──────────────────────────────────────────────────────────────
// スプレッドシート構成（参考）
// ──────────────────────────────────────────────────────────────
// シート1「英語限定」      A:お題  B:NGワード
// シート2「ウミガメ」      A:問題文  B:真相
// シート3「ワードウルフ」  A:市民のお題  B:ウルフのお題
// シート4「朝までそれ正解」A:お題（例: 無人島に1つだけ持っていくなら？）
// シート5「Answers」       A:キーワード B:回戦数 C:名前 D:回答 E:タイムスタンプ
//   ※ Answers シートは初回 submitAnswer 時に自動作成されます
