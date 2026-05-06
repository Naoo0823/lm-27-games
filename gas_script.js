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
// GETパラメータ action で処理を振り分ける（POST CORS問題を回避）
// ──────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';

    if (action === 'submitAnswer') return handleSubmitAnswer(e.parameter);
    if (action === 'getAnswers')   return handleGetAnswers(e.parameter);

    // デフォルト: 全ゲームデータを返す（既存動作と互換）
    return handleGetGameData();

  } catch (err) {
    return jsonOut({ error: err.message });
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
// ユーティリティ
// ──────────────────────────────────────────────────────────────

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
