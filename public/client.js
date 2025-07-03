import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, addDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebaseの設定
const firebaseConfig = {
    apiKey: "AIzaSyAhp18MW5xJb0Tuo8cdvc088AnJav97LJM",
    authDomain: "shutomei-shiritori-online.firebaseapp.com",
    projectId: "shutomei-shiritori-online",
    storageBucket: "shutomei-shiritori-online.appspot.com",
    messagingSenderId: "575818967632",
    appId: "1:575818967632:web:0858cd98f20d8f9915ff55"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Socket.IOの初期化
const socket = io();

// ゲーム状態変数
let questions = [];
let current = 0; // 現在の問題番号 (現在は1問固定なのでほぼ使われない)
let startTime; // 自分のゲーム開始時間
let intervalId;
let correctCount = 0; // そのラウンドの正解数（1問固定なので0か1）
let selectedQuizSet = "";
let selectedQuizTitle = "";
let romajiBuffer = ""; // ローマ字変換用バッファ

// 部屋・プレイヤー状態変数
let currentRoomId = null;
let isHost = false;
let myNickname = ""; // 自分のニックネーム
let isReady = false;
let gameStartTimeOffset = 0; // ゲーム中に入室した際の時間オフセット
let mySelectedInputMethod = null; // 自分の選択した入力方法 (flick または keyboard)

// ===============================================
// === DOM要素の取得 ===
// ===============================================
const mainTitle = document.getElementById("main-title");
const roomSelectionScreen = document.getElementById('room-selection-screen');
const roomListUl = document.getElementById('room-list-ul');
const answerEl = document.getElementById("answer"); // answerInputと同一IDなので、こちらを使用
const createRoomNameInput = document.getElementById('create-room-name');
const createNicknameInput = document.getElementById('create-nickname');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomIdInput = document.getElementById('join-room-id');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomLobby = document.getElementById('room-lobby');
const lobbyRoomName = document.getElementById('lobby-room-name');
const lobbyRoomId = document.getElementById('lobby-room-id');
const playersInRoomList = document.getElementById('players-in-room');
const hostControls = document.getElementById('host-controls');
const selectKokumeiBtn = document.getElementById('select-kokumei');
const selectShutomeiBtn = document.getElementById('select-shutomei');
const selectedQuizDisplay = document.getElementById('selected-quiz-display');
const toggleVisibilityBtn = document.getElementById('toggle-visibility-btn');
const startGameBtn = document.getElementById('start-game-btn');
const setReadyBtn = document.getElementById('set-ready-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');
const quizBox = document.getElementById("quiz-box");
const questionEl = document.getElementById("question");
const timerEl = document.getElementById("timer");
const feedbackEl = document.getElementById("feedback");
const submitBtn = document.getElementById("submit-btn");
const questionNumberEl = document.getElementById("question-number");
const resultBox = document.getElementById("result-box");
const finalScoresList = document.getElementById('final-scores');
const returnToLobbyBtn = document.getElementById('return-to-lobby-btn');
const flickGrid = document.getElementById("flick-grid");
const controlRow = document.getElementById("control-row"); // フリック入力コントロール用

// 入力方法選択のためのDOM要素とラジオボタン
const playerInputMethodSelection = document.getElementById('playerInputMethodSelection');
const myInputMethodRadios = document.querySelectorAll('input[name="myInputMethod"]');

// ===============================================
// === ローマ字変換ロジック (物理キーボード入力用) ===
// ===============================================
const VOWELS = new Set(['a', 'i', 'u', 'e', 'o']);
const romajiToKanaMap = {
    "kya": "キャ","kyi": "キィ", "kyu": "キュ","kye": "キェ", "kyo": "キョ",
    "sha": "シャ", "shu": "シュ", "she": "シェ","sho": "ショ",
    "sya": "シャ", "syu": "シュ", "sye": "シェ","syo": "ショ",
    "cha": "チャ","chi": "チ", "chu": "チュ", "che": "チェ","cho": "チョ",
    "tya": "チャ", "tyi": "チィ","tyu": "チュ","tye": "チェ", "tyo": "チョ",
    "nya": "ニャ", "nyi": "ニィ","nyu": "ニュ","nye": "ニェ", "nyo": "ニョ",
    "hya": "ヒャ", "hyi": "ヒィ","hyu": "ヒュ", "hye": "ヒェ","hyo": "ヒョ",
    "mya": "ミャ", "myi": "ミィ","myu": "ミュ","mye": "ミェ", "myo": "ミョ",
    "rya": "リャ", "ryi": "リィ","ryu": "リュ","rye": "リェ", "ryo": "リョ",
    "gya": "ギャ","gyi": "ギィ", "gyu": "ギュ","gye": "ギェ", "gyo": "ギョ",
    "ja": "ジャ", "ju": "ジュ", "je": "ジェ","jo": "ジョ",
    "jya": "ジャ","jyi": "ジィ","jyu": "ジュ","jye": "ジェ","jyo": "ジョ",
    "zya": "ジャ","zyi": "ジィ", "zyu": "ジュ", "zye": "ゼ","zyo": "ゾ",
    "bya": "ビャ", "byi": "ビィ","byu": "ビュ","bye": "ビェ", "byo": "ビョ",
    "pya": "ピャ", "pyi": "ピィ","pyu": "ピュ","pye": "ピェ", "pyo": "ピョ",
    "dya": "ヂャ", "dyi": "ヂィ","dyu": "ヂュ","dye": "ヂェ", "dyo": "ヂョ",
    "cya": "チャ","cyi": "チィ", "cyu": "チュ","cye": "チェ", "cyo": "チョ",
    "fya": "ファ", "fyu": "フュ", "fyo": "フォ",
    "tsa": "ツァ", "tsi": "ツィ", "tse": "ツェ", "tso": "ツォ",
    "tha": "テャ", "thi": "ティ", "thu": "テュ", "the": "テェ", "tho": "テョ",
    "dha": "デャ", "dhi": "ディ", "dhu": "デュ", "dhe": "デェ","dho": "デョ",
    "dwu": "ドゥ","twu": "トゥ",
    "shi": "シ", "si": "シ",
    "chi": "チ", "ti": "チ",
    "tsu": "ツ", "tu": "ツ",
    "fu": "フ", "hu": "フ",
    "vu": "ヴ",
    "va": "ヴァ", "vi": "ヴィ", "ve": "ヴェ", "vo": "ヴォ",
    "vya": "ヴャ","vyi": "ヴィ","vyu": "ヴュ","vye": "ヴェ","vyo": "ヴョ",
    "fa": "ファ", "fi": "フィ", "fe": "フェ", "fo": "フォ",
    "fyi": "フィ","fye": "フェ",
    "qwa": "クァ","qa": "クァ", "qi": "クィ", "qe": "クェ", "qo": "クォ",
    "kwa": "クァ","qwi": "クィ","qwu": "クゥ","qwe": "クェ","qwo": "クォ",
    "gwa": "グァ", "gwi": "グィ", "gwu": "グゥ","gwe": "グェ","gwo": "グォ",
    "la": "ァ", "xa": "ァ",
    "li": "ィ", "xi": "ィ",
    "lu": "ゥ", "xu": "ゥ",
    "le": "ェ", "xe": "ェ",
    "lo": "ォ", "xo": "ォ",
    "lya": "ャ", "xya": "ャ",
    "lyu": "ュ", "xyu": "ュ",
    "lyo": "ョ", "xyo": "ョ",
    "lwa": "ヮ", "xwa": "ヮ",
    "a": "ア", "i": "イ", "u": "ウ", "e": "エ", "o": "オ",
    "ca": "カ","ka": "カ", "ki": "キ","cu": "ク","qu": "ク", "ku": "ク", "ke": "ケ", "ko": "コ","co": "コ",
    "sa": "サ", "su": "ス", "se": "セ", "so": "ソ",
    "ta": "タ", "te": "テ", "to": "ト",
    "na": "ナ", "ni": "ニ", "nu": "ヌ", "ne": "ネ", "no": "ノ",
    "ha": "ハ", "hi": "ヒ", "he": "ヘ","ho": "ホ",
    "ma": "マ", "mi": "ミ", "mu": "ム", "me": "メ", "mo": "モ",
    "ya": "ヤ", "yu": "ユ", "ye": "イェ","yo": "ヨ",
    "ra": "ラ", "ri": "リ", "ru": "ル", "re": "レ", "ro": "ロ",
    "wa": "ワ", "wo": "ヲ",
    "wi": "ウィ", "wu": "ウ", "we": "ウェ",
    "ga": "ガ", "gi": "ギ", "gu": "グ", "ge": "ゲ", "go": "ゴ",
    "za": "ザ", "ji": "ジ", "zi": "ジ", "zu": "ズ", "ze": "ゼ", "zo": "ゾ",
    "da": "ダ", "di": "ヂ", "du": "ヅ", "de": "デ", "do": "ド",
    "ba": "バ", "bi": "ビ", "bu": "ブ", "be": "ベ", "bo": "ボ", // baの変換に誤りがあったため修正
    "pa": "パ", "pi": "ピ", "pu": "プ", "pe": "ペ", "po": "ポ",
    "ltu": "ッ", "xtu": "ッ",
    "nn": "ン", // nn は ン に変換
    "n'": "ン", // n' も ン に変換 (例: shin'ei)
    "-": "ー",
    ".": "。",
    ",": "、",
};

/**
 * ローマ字バッファから確定したカナと残りのローマ字を分離する
 * @param {string} currentRomajiBuffer - 現在のローマ字バッファ
 * @returns {{committedKana: string, remainingRomaji: string}} - 確定カナと残りのローマ字
 */
function processRomajiInput(currentRomajiBuffer) {
    let committedKana = "";
    let remainingRomaji = currentRomajiBuffer;

    while (remainingRomaji.length > 0) {
        let matched = false;
        let bestMatchKana = "";
        let bestMatchLength = 0;

        // 最長一致でパターンを探す
        const sortedKeys = Object.keys(romajiToKanaMap).sort((a, b) => b.length - a.length);
        for (const romajiPattern of sortedKeys) {
            if (remainingRomaji.startsWith(romajiPattern)) {
                bestMatchKana = romajiToKanaMap[romajiPattern];
                bestMatchLength = romajiPattern.length;
                matched = true;
                break;
            }
        }

        // 'n' の特殊処理
        if (!matched && remainingRomaji.startsWith('n')) {
            if (remainingRomaji.length === 1) {
                // 最後の一文字が 'n' の場合は確定させない
                break;
            } else {
                const nextChar = remainingRomaji[1];
                // 'nn' または子音字が続く場合は 'ン'
                if (nextChar === 'n' || (!VOWELS.has(nextChar) && nextChar !== 'y')) {
                    bestMatchKana = "ン";
                    bestMatchLength = 1;
                    matched = true;
                } else {
                    // 母音や 'y' が続く場合はまだ確定できない
                    break;
                }
            }
        }

        // 促音 'ッ' の処理 (子音の重複)
        // 'n' 以外の同じ子音が2回連続した場合
        if (!matched && remainingRomaji.length >= 2 && remainingRomaji[0] === remainingRomaji[1] && !VOWELS.has(remainingRomaji[0])) {
            if (remainingRomaji[0] !== 'n') { // 'n' の重複は上記で処理
                const tempRemaining = remainingRomaji.substring(1); // 最初の1文字をスキップ
                let foundNextKanaForTsu = false;
                // スキップした残りの文字列で次のカナを確定できるか試す
                const sortedKeysForTsu = Object.keys(romajiToKanaMap).sort((a, b) => b.length - a.length);
                for (const romajiPattern of sortedKeysForTsu) {
                    // 'n', 'nn', "n'" は促音の対象外
                    if (tempRemaining.startsWith(romajiPattern) && !['n', 'nn', "n'"].includes(romajiPattern)) {
                        committedKana += "ッ" + romajiToKanaMap[romajiPattern];
                        remainingRomaji = tempRemaining.substring(romajiPattern.length);
                        matched = true;
                        foundNextKanaForTsu = true;
                        break;
                    }
                }
                if (foundNextKanaForTsu) {
                    continue; // 促音と次のカナが確定したので、次のループへ
                }
            }
        }

        if (matched && bestMatchLength > 0) {
            committedKana += bestMatchKana;
            remainingRomaji = remainingRomaji.substring(bestMatchLength);
        } else {
            // マッチしない場合は、ここでループを抜けて残りを確定しない
            break;
        }
    }
    return { committedKana, remainingRomaji };
}

/**
 * 物理キーボードのkeydownイベントハンドラ
 * @param {KeyboardEvent} event
 */
function physicalInputKeydownHandler(event) {
    if (romajiBuffer === undefined || romajiBuffer === null) {
        romajiBuffer = "";
    }
    const answerValue = answerEl.value || "";
    let currentKana = answerValue.substring(0, answerValue.length - romajiBuffer.length); // 確定済みのカナ部分

    // Enterキー処理
    if (event.key === "Enter") {
        event.preventDefault();
        // 未確定のローマ字を全て確定させる
        let finalConvertedKana = "";
        let tempFinalBuffer = romajiBuffer;
        while (tempFinalBuffer.length > 0) {
            let matched = false;
            let bestMatchKana = "";
            let bestMatchLength = 0;

            // 短いローマ字での促音 ('t' -> 'ッ')
            if (tempFinalBuffer.length === 1 && !VOWELS.has(tempFinalBuffer[0]) && tempFinalBuffer[0] !== 'n') {
                bestMatchKana = "ッ";
                bestMatchLength = 1;
                matched = true;
            } else {
                const sortedKeys = Object.keys(romajiToKanaMap).sort((a, b) => b.length - a.length);
                for (const romajiPattern of sortedKeys) {
                    if (tempFinalBuffer.startsWith(romajiPattern)) {
                        bestMatchKana = romajiToKanaMap[romajiPattern];
                        bestMatchLength = romajiPattern.length;
                        matched = true;
                        break;
                    }
                }
            }
            // 'n' の確定処理 (Enterで確定させる)
            if (!matched && tempFinalBuffer.startsWith('n')) {
                bestMatchKana = "ン";
                bestMatchLength = 1;
                matched = true;
            }

            if (matched && bestMatchLength > 0) {
                finalConvertedKana += bestMatchKana;
                tempFinalBuffer = tempFinalBuffer.substring(bestMatchLength);
            } else {
                // マッチしない場合はそのまま追加（エラー処理として）
                finalConvertedKana += tempFinalBuffer[0];
                tempFinalBuffer = tempFinalBuffer.substring(1);
            }
        }
        answerEl.value = currentKana + finalConvertedKana;
        romajiBuffer = ""; // バッファクリア

        // ゲーム中にEnterが押されたら解答送信
        if (quizBox.style.display === "block") {
            // 物理キーボード時は解答ボタンは非表示だが、Enterキーで送信されるため、
            // submitBtn.click() は引き続き呼び出す
            submitBtn.click();
        }
        return;
    }

    // Backspaceキー処理
    if (event.key === "Backspace") {
        event.preventDefault();
        if (romajiBuffer.length > 0) {
            romajiBuffer = romajiBuffer.slice(0, -1); // ローマ字バッファを削る
        } else if (currentKana.length > 0) {
            currentKana = currentKana.slice(0, -1); // 確定済みカナを削る
        }
        answerEl.value = currentKana + romajiBuffer;
        return;
    }

    // Ctrl/Alt/Metaキー、特殊キー（Shift, CapsLockなど）は無視
    if (event.ctrlKey || event.altKey || event.metaKey ||
        (event.key.length > 1 && event.key !== '-' && event.key !== ' ')) {
        return;
    }

    // 入力可能な文字（英数字、ハイフン、スペース、コンマ、アポストロフィ）
    if (/[a-zA-Z0-9\-\s',]/.test(event.key)) {
        if (event.key === ' ') {
            event.preventDefault(); // スペースキーのデフォルト挙動を抑制
            // スペースキーが押されたら、未確定のローマ字を全て確定し、スペースを追加
            let finalConvertedKana = "";
            let tempFinalBuffer = romajiBuffer;
            while (tempFinalBuffer.length > 0) {
                let matched = false;
                let bestMatchKana = "";
                let bestMatchLength = 0;

                if (tempFinalBuffer.length === 1 && !VOWELS.has(tempFinalBuffer[0]) && tempFinalBuffer[0] !== 'n') {
                    bestMatchKana = "ッ";
                    bestMatchLength = 1;
                    matched = true;
                } else {
                    const sortedKeys = Object.keys(romajiToKanaMap).sort((a, b) => b.length - a.length);
                    for (const romajiPattern of sortedKeys) {
                        if (tempFinalBuffer.startsWith(romajiPattern)) {
                            bestMatchKana = romajiToKanaMap[romajiPattern];
                            bestMatchLength = romajiPattern.length;
                            matched = true;
                            break;
                        }
                    }
                }
                if (!matched && tempFinalBuffer.startsWith('n')) {
                    bestMatchKana = "ン";
                    bestMatchLength = 1;
                    matched = true;
                }

                if (matched && bestMatchLength > 0) {
                    finalConvertedKana += bestMatchKana;
                    tempFinalBuffer = tempFinalBuffer.substring(bestMatchLength);
                } else {
                    finalConvertedKana += tempFinalBuffer[0];
                    tempFinalBuffer = tempFinalBuffer.substring(1);
                }
            }
            answerEl.value = currentKana + finalConvertedKana + " "; // 確定カナとスペースを追加
            romajiBuffer = ""; // バッファクリア
            return;
        }
        romajiBuffer += event.key.toLowerCase(); // 小文字に変換してバッファに追加
        event.preventDefault(); // デフォルトの文字入力を抑制
    } else {
        // console.log("Non-input key (or unhandled character):", event.key); // デバッグ用
    }

    // ローマ字バッファをカナに変換して表示を更新
    const { committedKana, remainingRomaji } = processRomajiInput(romajiBuffer);
    answerEl.value = currentKana + committedKana + remainingRomaji;
    romajiBuffer = remainingRomaji; // 確定できなかった分を次のバッファにする
}


// ===============================================
// === フリック入力関連 ===
// ===============================================
let startX = 0, startY = 0;
const flickData = {
    あ: ["ウ", "エ", "オ", "イ", "ア"],
    か: ["ク", "ケ", "コ", "キ", "カ"],
    さ: ["ス", "セ", "ソ", "シ", "サ"],
    た: ["ツ", "テ", "ト", "チ", "タ"],
    な: ["ヌ", "ネ", "ノ", "ニ", "ナ"],
    は: ["フ", "ヘ", "ホ", "ヒ", "ハ"],
    ま: ["ム", "メ", "モ", "ミ", "マ"],
    や: ["ユ", "", "ヨ", "", "ヤ"],
    ら: ["ル", "レ", "ロ", "リ", "ラ"],
    わ: ["ン", "ー", "", "ヲ", "ワ"]
};
const transformChainMap = {
    ツ: ["ツ", "ッ"],
    ハ: ["ハ", "バ", "パ"],
    ヒ: ["ヒ", "ビ", "ピ"],
    フ: ["フ", "ブ", "プ"],
    ヘ: ["ヘ", "ベ", "ペ"],
    ホ: ["ホ", "ボ", "ポ"],
    ア: ["ア", "ァ"],
    イ: ["イ", "ィ"],
    ウ: ["ウ", "ゥ"],
    エ: ["エ", "ェ"],
    オ: ["オ", "ォ"],
    カ: ["カ", "ガ"],
    キ: ["キ", "ギ"],
    ク: ["ク", "グ"],
    ケ: ["ケ", "ゲ"],
    コ: ["コ", "ゴ"],
    サ: ["サ", "ザ"],
    シ: ["シ", "ジ"],
    ス: ["ス", "ズ"],
    セ: ["セ", "ゼ"],
    ソ: ["ソ", "ゾ"],
    タ: ["タ", "ダ"],
    チ: ["チ", "ヂ"],
    テ: ["テ", "デ"],
    ト: ["ト", "ド"],
    ヤ: ["ヤ", "ャ"],
    ユ: ["ユ", "ュ"],
    ヨ: ["ヨ", "ョ"],
    ワ: ["ワ", "ヮ"]
};

/**
 * フリックボタンを生成し、イベントリスナーを設定する
 * @param {string} base - フリックの基となる文字（例: 'あ', 'か'）
 * @returns {HTMLButtonElement} 生成されたボタン要素
 */
function createAndAttachFlickBtn(base) {
    const [up, right, down, left, center] = flickData[base];
    const btn = document.createElement("button");
    btn.className = "flick-btn";
    btn.dataset.base = base;
    btn.innerHTML = `
        <span class="hint top">${up || ''}</span>
        <span class="hint right">${right || ''}</span>
        <span class="hint bottom">${down || ''}</span>
        <span class="hint left">${left || ''}</span>
        <span class="center">${center || ''}</span>
    `;

    // タッチイベントハンドラ
    const touchStartHandler = e => {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
    };
    const touchEndHandler = e => {
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const th = 30; // しきい値
        let dir = 4; // 0:上, 1:右, 2:下, 3:左, 4:中央

        if (Math.abs(dx) > th || Math.abs(dy) > th) {
            if (Math.abs(dx) > Math.abs(dy)) {
                if (dx > th) dir = 1; // 右
                else if (dx < -th) dir = 3; // 左
            } else {
                if (dy > th) dir = 2; // 下
                else if (dy < -th) dir = 0; // 上
            }
        }

        const kana = flickData[base][dir];
        if (kana) answerEl.value += kana;
    };
    const touchMoveHandler = e => e.preventDefault(); // スクロール防止

    // イベントハンドラをボタンのプロパティに保存しておき、enable/disableで参照できるようにする
    btn._eventHandlers = { touchStartHandler, touchEndHandler, touchMoveHandler };
    return btn;
}

const clearBtnClickHandler = () => {
    // 現在の入力モードが物理キーボードの場合とフリックの場合で処理を分ける
    if (mySelectedInputMethod === "keyboard") {
        if (romajiBuffer === undefined || romajiBuffer === null) {
            romajiBuffer = "";
        }
        const answerValue = answerEl.value || "";
        let currentKana = answerValue.substring(0, answerValue.length - romajiBuffer.length);

        if (romajiBuffer.length > 0) {
            romajiBuffer = romajiBuffer.slice(0, -1);
        } else if (currentKana.length > 0) {
            currentKana = currentKana.slice(0, -1);
        }
        answerEl.value = currentKana + romajiBuffer;
    } else { // flick mode
        answerEl.value = answerEl.value.slice(0, -1);
    }
};

const modifyBtnClickHandler = () => {
    const val = answerEl.value;
    if (!val) return; // 値がなければ何もしない

    const last = val.slice(-1); // 最後の文字
    const rest = val.slice(0, -1); // 最後の文字以外の部分

    // 変形マップから対応する変換チェーンを探す
    const chain = transformChainMap[last] || Object.entries(transformChainMap).find(([, arr]) => arr.includes(last))?.[1];

    if (!chain) return; // 変換チェーンが見つからなければ何もしない

    const idx = chain.indexOf(last); // 現在の文字がチェーンのどこにあるか
    const next = chain[(idx + 1) % chain.length]; // 次の文字（チェーンの最後なら最初に戻る）

    answerEl.value = rest + next; // 変換した文字で更新
};

// ===============================================
// === ヘルパー関数群 (UIの表示/非表示、入力モードの切り替えなどを担当) ===
// ここで既存の enableFlickInput / disableFlickInput を更新
// ===============================================

/**
 * 物理キーボード入力を有効にする
 */
function enablePhysicalInput() {
    answerEl.readOnly = true; // ブラウザIMEを避けるため
    answerEl.setAttribute("inputmode", "none"); // モバイルキーボードの表示を制御
    answerEl.setAttribute("autocapitalize", "off");
    answerEl.setAttribute("autocomplete", "off");
    answerEl.setAttribute("autocorrect", "off");
    answerEl.setAttribute("spellcheck", "false");
    answerEl.style.imeMode = "inactive"; // IE/Edge向けIME制御
    answerEl.style.display = 'block'; // 入力欄を表示
    submitBtn.style.display = 'none'; // 解答ボタンを非表示にする
    document.addEventListener("keydown", physicalInputKeydownHandler); // キーダウンイベントリスナーを追加
    answerEl.focus(); // フォーカス
}

/**
 * 物理キーボード入力を無効にする
 */
function disablePhysicalInput() {
    answerEl.style.display = 'none'; // 入力欄を非表示
    answerEl.readOnly = false; // 念のため解除
    answerEl.removeAttribute("inputmode");
    answerEl.removeAttribute("autocapitalize");
    answerEl.removeAttribute("autocomplete");
    answerEl.removeAttribute("autocorrect");
    answerEl.removeAttribute("spellcheck");
    answerEl.style.imeMode = ""; // リセット
    // submitBtn.style.display は toggleInputMethodUI で制御されるため、ここでは変更しない
    document.removeEventListener("keydown", physicalInputKeydownHandler); // キーダウンイベントリスナーを削除
}

/**
 * フリック入力を有効にする
 */function enableFlickInput() {
    flickGrid.style.display = "grid";
    controlRow.style.display = "flex"; // controlRow を flex コンテナにする
    submitBtn.style.display = "block";
    answerEl.readOnly = true;
    answerEl.removeAttribute("inputmode");
    answerEl.style.imeMode = "";
    answerEl.style.display = 'block';

    const allFlickBtns = document.querySelectorAll(".flick-btn");
    allFlickBtns.forEach(btn => {
        if (btn._eventHandlers) {
            btn.addEventListener("touchstart", btn._eventHandlers.touchStartHandler, { passive: false });
            btn.addEventListener("touchend", btn._eventHandlers.touchEndHandler);
            btn.addEventListener("touchmove", btn._eventHandlers.touchMoveHandler, { passive: false });
        }
    });
    const clearBtn = document.getElementById("clear-btn");
    const modifyBtn = document.getElementById("modify-btn");
    if (clearBtn) {
        clearBtn.addEventListener("click", clearBtnClickHandler);
        // clearBtn.style.display = 'block'; // この行を削除
    }
    if (modifyBtn) {
        modifyBtn.addEventListener("click", modifyBtnClickHandler);
        // modifyBtn.style.display = 'block'; // この行を削除
    }
}

// disableFlickInput 関数内 (修正後)
function disableFlickInput() {
    flickGrid.style.display = "none";
    controlRow.style.display = "none"; // controlRow ごと非表示にする
    // submitBtn.style.display は toggleInputMethodUI や disablePhysicalInput で制御されるため、ここでは変更しない

    const allFlickBtns = document.querySelectorAll(".flick-btn");
    allFlickBtns.forEach(btn => {
        if (btn._eventHandlers) {
            btn.removeEventListener("touchstart", btn._eventHandlers.touchStartHandler);
            btn.removeEventListener("touchend", btn._eventHandlers.touchEndHandler);
            btn.removeEventListener("touchmove", btn._eventHandlers.touchMoveHandler);
        }
    });
    const clearBtn = document.getElementById("clear-btn");
    const modifyBtn = document.getElementById("modify-btn");
    if (clearBtn) {
        clearBtn.removeEventListener("click", clearBtnClickHandler);
        // clearBtn.style.display = 'none'; // この行を削除
    }
    if (modifyBtn) {
        modifyBtn.removeEventListener("click", modifyBtnClickHandler);
        // modifyBtn.style.display = 'none'; // この行を削除
    }
}
/**
 * 選択された入力方法に応じてUIを切り替える
 * @param {string} method - 'flick' または 'keyboard'
 */
function toggleInputMethodUI(method) {
    if (method === 'flick') {
        enableFlickInput();
        disablePhysicalInput(); // 物理キーボード関連は非表示に
    } else if (method === 'keyboard') {
        enablePhysicalInput(); // 物理キーボード関連を表示に
        disableFlickInput(); // フリックキーボード関連は非表示に
    } else { // 選択されていない、またはデフォルト（ロビー初期表示など）
        // 両方とも非表示にして、ユーザーに選択を促す状態にする
        disablePhysicalInput();
        disableFlickInput();
        // submitBtn も非表示にする
        submitBtn.style.display = 'none';
    }
}

// ===============================================
// === 部屋選択・ロビー機能 ===
// ===============================================

// 部屋作成ボタン
createRoomBtn.addEventListener('click', () => {
    const roomName = createRoomNameInput.value.trim();
    myNickname = createNicknameInput.value.trim();
    if (!roomName) {
        alert('部屋の名前を入力してください。');
        return;
    }
    if (!myNickname) {
        alert('ニックネームを入力してください。');
        return;
    }
    socket.emit('createRoom', { roomName, nickname: myNickname });
});

// ルームIDで入室ボタン
joinRoomBtn.addEventListener('click', () => {
    const roomId = joinRoomIdInput.value.trim();
    if (!roomId) {
        alert('部屋IDを入力してください。');
        return;
    }

    const nicknamePrompt = prompt('参加するニックネームを入力してください:');
    if (nicknamePrompt === null) { // キャンセルされた場合
        return;
    }
    myNickname = nicknamePrompt.trim();
    if (!myNickname) {
        alert('ニックネームは必須です。');
        return;
    }

    console.log(`直接参加: 部屋 ${roomId} に ${myNickname} として参加を試みます。`);
    socket.emit('joinRoom', { roomId, nickname: myNickname });
});

// 準備完了ボタン
setReadyBtn.addEventListener('click', () => {
    isReady = !isReady;
    socket.emit('setReady', { roomId: currentRoomId, isReady: isReady });
    setReadyBtn.textContent = isReady ? '準備OK！ (解除)' : '準備完了';
    setReadyBtn.classList.toggle('ready', isReady);
});

// 部屋を退出ボタン
leaveRoomBtn.addEventListener('click', () => {
    socket.emit('leaveRoom', { roomId: currentRoomId });
    currentRoomId = null;
    isHost = false;
    isReady = false;
    mySelectedInputMethod = null; // 入力方法選択をリセット
    myInputMethodRadios.forEach(radio => radio.checked = false); // ラジオボタンのチェックを外す

    roomLobby.style.display = 'none';
    quizBox.style.display = 'none';
    resultBox.style.display = 'none';
    roomSelectionScreen.style.display = 'block'; // 部屋選択画面に戻る
    mainTitle.style.display = 'block'; // メインタイトルも表示に戻す
});

// クイズタイプ選択ボタン
selectKokumeiBtn.addEventListener('click', () => selectQuizType('kokumei'));
selectShutomeiBtn.addEventListener('click', () => selectQuizType('shutomei'));

/**
 * クイズタイプを選択し、サーバーに通知する
 * @param {string} type - 'kokumei' または 'shutomei'
 */
function selectQuizType(type) {
    let fileName = '';
    let displayName = '';
    let setName = '';
    if (type === 'kokumei') {
        fileName = 'kokumei.csv';
        displayName = '国名しりとり';
        setName = 'kokumei';
    } else if (type === 'shutomei') {
        fileName = 'shutomei.csv';
        displayName = '首都名しりとり';
        setName = 'shutomei';
    }
    selectedQuizSet = setName;
    selectedQuizTitle = displayName;
    selectedQuizDisplay.textContent = ` ${displayName}`;
    socket.emit('selectQuizType', { roomId: currentRoomId, quizFile: fileName, quizTitle: displayName, quizSet: setName });
}

// 部屋の公開/非公開切り替えボタン
toggleVisibilityBtn.addEventListener('click', () => {
    socket.emit('toggleRoomVisibility', { roomId: currentRoomId });
});

// ゲーム開始ボタン
startGameBtn.addEventListener('click', () => {
    if (!selectedQuizSet) {
        alert('クイズタイプを選択してください。');
        return;
    }
    // 問題数を1に固定してゲーム開始イベントを送信
    socket.emit('startGame', { roomId: currentRoomId, quizSet: selectedQuizSet, quizTitle: selectedQuizTitle, numQuestions: 1 });
});

// 入力方法ラジオボタンの変更イベントリスナー
myInputMethodRadios.forEach(radio => {
  radio.addEventListener('change', (event) => {
    mySelectedInputMethod = event.target.value;
    socket.emit('setPlayerInputMethod', {
      roomId: currentRoomId,
      method: mySelectedInputMethod
    });
    console.log(`My input method set to: ${mySelectedInputMethod}`);
    toggleInputMethodUI(mySelectedInputMethod); // 入力UIをフリック/キーボードに切り替え
  });
});

/**
 * ロビー画面を表示し、UIの状態を更新する
 * @param {Object} room - 部屋の最新の状態オブジェクト
 */
function showLobby(room) {
    roomSelectionScreen.style.display = 'none';
    mainTitle.style.display = 'none';
    quizBox.style.display = 'none';
    resultBox.style.display = 'none';
    roomLobby.style.display = 'block';

    // 自分の入力方法選択部分を常に表示
    playerInputMethodSelection.style.display = 'block';

    // ロビーに戻ったときに、現在の自分の選択を反映させる
    if (mySelectedInputMethod) {
        toggleInputMethodUI(mySelectedInputMethod);
    } else {
        // まだ選択されていない場合、デフォルトの 'keyboard' を適用
        toggleInputMethodUI('keyboard');
        // ラジオボタンも 'keyboard' をチェック状態にする
        document.querySelector('input[name="myInputMethod"][value="keyboard"]').checked = true;
        mySelectedInputMethod = 'keyboard'; // mySelectedInputMethodも更新
    }

    if (isHost) {
        selectKokumeiBtn.disabled = false;
        selectShutomeiBtn.disabled = false;
        setReadyBtn.style.display = 'none'; // ホストは「準備完了」ボタン不要
    } else {
        selectKokumeiBtn.disabled = true;
        selectShutomeiBtn.disabled = true;
        setReadyBtn.style.display = 'inline-block'; // 参加者は「準備完了」ボタンを表示
    }
    socket.emit('getRoomState', { roomId: room.id }); // 最新の部屋の状態を要求
}

// ニックネーム入力フィールドと部屋ID入力フィールドにフォーカスが当たった際の物理キーボードイベントリスナーの切り替え
createNicknameInput.addEventListener('focus', () => {
    // 入力中は物理キーボードのイベントリスナーを一時的に無効化
    document.removeEventListener("keydown", physicalInputKeydownHandler);
});
createNicknameInput.addEventListener('blur', () => {
    // 部屋に入ってゲームボックスが表示されていて、かつキーボード入力モードの場合のみ再有効化
    if (quizBox.style.display === "block" && mySelectedInputMethod === "keyboard") {
        document.addEventListener("keydown", physicalInputKeydownHandler);
    }
});
joinRoomIdInput.addEventListener('focus', () => {
    document.removeEventListener("keydown", physicalInputKeydownHandler);
});
joinRoomIdInput.addEventListener('blur', () => {
    if (quizBox.style.display === "block" && mySelectedInputMethod === "keyboard") {
        document.addEventListener("keydown", physicalInputKeydownHandler);
    }
});

// ===============================================
// === Socket.IOイベントハンドラ ===
// ===============================================

// サーバー接続時
socket.on('connect', () => {
    console.log('Connected to server');
});

// サーバー切断時
socket.on('disconnect', () => {
    console.log('Disconnected from server');
    currentRoomId = null;
    isHost = false;
    isReady = false;
    mySelectedInputMethod = null;
    myInputMethodRadios.forEach(radio => radio.checked = false); // ラジオボタンのチェックを外す

    roomLobby.style.display = 'none';
    quizBox.style.display = 'none';
    resultBox.style.display = 'none';
    roomSelectionScreen.style.display = 'block';
    mainTitle.style.display = 'block';
});

socket.on('quizModeSelected', (mode) => {
    const quizModeDisplay = document.getElementById('quiz-mode-display');
    let modeText = '';
    if (mode === 'kokumei') {
        modeText = '国名しりとり';
    } else if (mode === 'shutomei') {
        modeText = '首都名しりとり';
    } else {
        modeText = '未選択';
    }
    quizModeDisplay.textContent = `しりとり${modeText}`;
});

// 部屋リスト更新時
socket.on('roomList', (roomsData) => {
    console.log('--- roomList イベントを受信しました');
    console.log('受信した部屋リスト:', roomsData);

    // 現在の部屋にいる場合は、部屋リストの更新をスキップ
    if (currentRoomId) {
        console.log(`既に部屋にいます (Room ID: ${currentRoomId}). 部屋リストの更新をスキップします。`);
        return;
    }

    roomListUl.innerHTML = ''; // リストをクリア
    if (roomsData.length === 0) {
        roomListUl.innerHTML = '<li class="no-rooms">現在、公開されている部屋はありません。</li>';
        return;
    }

    roomsData.forEach(room => {
        const li = document.createElement('li');
        li.classList.add('room-item');
        if (room.isPlaying) { // ゲーム中の部屋は専用クラス
            li.classList.add('playing');
        }

        const playerCount = room.players ? room.players.length : 0;
        const playerNames = room.players ? room.players.map(p => p.nickname).join(', ') : '';
        const isGameInProgressText = room.isPlaying ? ' (ゲーム中)' : '' ;
        const hostName = room.hostName || '不明';

        li.innerHTML = `
            <div class="room-info">
                <span class="room-name"> ${room.name}</span>${isGameInProgressText}<br>
                <span class="room-host"> ${hostName}</span><br>
                <span class="room-players"> ${playerCount}人 (${playerNames})</span>
            </div>
            <div class="room-actions">
                <button class="join-room-from-list-btn button primary-button" data-room-id="${room.id}" ${room.isPlaying ? 'disabled' : ''}>入室</button>
            </div>
        `;
        roomListUl.appendChild(li);
    });

    // ここで「入室」ボタン（roomListUl内のボタン）にイベントリスナーを設定
    document.querySelectorAll('.join-room-from-list-btn').forEach(button => {
        button.onclick = (event) => {
            const roomIdToJoin = event.target.dataset.roomId;

            const nicknamePrompt = prompt('この部屋に参加するためのニックネームを入力してください:');

            if (nicknamePrompt === null) { // キャンセルされた場合
                return;
            }
            myNickname = nicknamePrompt.trim(); // グローバル変数に設定
            if (!myNickname) {
                alert('ニックネームは必須です。');
                return;
            }

            console.log(`部屋リストから参加: 部屋 ${roomIdToJoin} に ${myNickname} として参加を試みます。`);
            socket.emit('joinRoom', { roomId: roomIdToJoin, nickname: myNickname });
        };
    });
});

// 部屋作成成功時
socket.on('roomCreated', (room) => {
    console.log('Room created:', room);
    currentRoomId = room.id;
    isHost = true;
    showLobby(room);
    alert(`部屋 ${room.id} が作成されました。`); // 部屋作成の通知
});

// 部屋参加成功時
socket.on('joinedRoom', (room) => {
    console.log('Joined room:', room);
    currentRoomId = room.id;
    isHost = room.hostId === socket.id; // 再度ホストかどうか確認
    showLobby(room); // ロビー表示関数を呼び出し

    if (room.isPlaying && room.gameStartTime) {
        gameStartTimeOffset = performance.now() - (Date.now() - room.gameStartTime);
        console.log(`Joined game in progress. My time offset: ${gameStartTimeOffset}`);
    } else {
        gameStartTimeOffset = 0;
    }

    // 自分のプレイヤー情報から入力方法を初期設定（再接続時など）
    const myPlayer = room.players.find(p => p.id === socket.id);
    if (myPlayer && myPlayer.inputMethod) {
        mySelectedInputMethod = myPlayer.inputMethod;
        myInputMethodRadios.forEach(radio => {
            if (radio.value === mySelectedInputMethod) {
                radio.checked = true;
            }
        });
        // ロビーで自分の入力方法の設定部分を表示
        playerInputMethodSelection.style.display = 'block';
        toggleInputMethodUI(mySelectedInputMethod); // UIも更新
    } else {
        // まだ入力方法が設定されていない場合、ラジオボタンを初期化
        myInputMethodRadios.forEach(radio => radio.checked = false);
        // ロビーで自分の入力方法の設定部分を表示
        playerInputMethodSelection.style.display = 'block';
        // どちらも選択されていない状態なので、デフォルトで物理キーボードを表示
        toggleInputMethodUI('keyboard');
        mySelectedInputMethod = 'keyboard'; // 内部状態もデフォルトに設定
        document.querySelector('input[name="myInputMethod"][value="keyboard"]').checked = true; // デフォルトをチェック
    }
});

// 部屋関連のエラー発生時
socket.on('roomError', (message) => {
    alert('エラー: ' + message);
    if (!currentRoomId) { // エラーで部屋に入れなかった場合、部屋選択画面に戻す
        roomLobby.style.display = 'none';
        roomSelectionScreen.style.display = 'block';
        mainTitle.style.display = 'block';
    }
});

socket.on('roomStateUpdate', (room) => {
    console.log('Room state updated:', room);
    isHost = room.hostId === socket.id;

    // ★★★ ここから追加 ★★★
    // 自分のプレイヤー情報を見つけ、isReadyの状態をグローバル変数に同期する
    const myPlayer = room.players.find(p => p.id === socket.id);
    if (myPlayer) {
        isReady = myPlayer.isReady; // グローバル変数 isReady を更新
    }
    // ★★★ ここまで追加 ★★★

    playersInRoomList.innerHTML = '<h3></h3><ul></ul>';
    const ul = playersInRoomList.querySelector('ul');
    room.players.forEach(player => {
        const li = document.createElement('li');
        li.innerHTML = `
    <div class="player-info">
        <span class="player-name ${player.isHost ? 'host-name' : ''}">${player.nickname}</span>
        <span class="player-status ${player.isReady ? 'ready' : ''} ${player.isHost ? 'hidden' : ''}">
            ${player.isReady ? '準備OK' : '未準備'}
        </span>
    </div>
            <span class="player-score"> ${player.wins || 0}勝</span>
            <span class="player-input-method">${player.inputMethod ? (player.inputMethod === 'flick' ? 'フリック' : 'キーボード') : '未選択'}</span>
        `;
        ul.appendChild(li);
    });
    if (isHost) {
        hostControls.style.display = 'block';
        lobbyRoomName.textContent = ` ${room.name} `;
        lobbyRoomId.textContent = room.id;

        // ホストになった場合、部屋の現在のクイズ設定をクライアント側の変数に同期する
        selectedQuizSet = room.quizSet;
        selectedQuizTitle = room.quizTitle;

        // ★★★ ここから追加・修正 ★★★
        // クイズタイプ選択ボタンを有効にする
        selectKokumeiBtn.disabled = false;
        selectShutomeiBtn.disabled = false;
        // ★★★ ここまで追加・修正 ★★★

        selectKokumeiBtn.classList.remove('selected');
        selectShutomeiBtn.classList.remove('selected');

        if (room.quizFile === 'kokumei.csv') {
            selectKokumeiBtn.classList.add('selected');
        } else if (room.quizFile === 'shutomei.csv') {
            selectShutomeiBtn.classList.add('selected');
        }
        selectedQuizDisplay.textContent = room.quizFile ? ` ${room.quizTitle}` : 'クイズ未選択';

        const allReady = room.players.length > 0 && room.players.every(p => p.isReady || p.isHost);
        // ゲーム開始ボタンのdisabled状態を更新（room.quizFileが設定されていればdisabled解除されるはず）
        startGameBtn.disabled = !allReady || !room.quizFile;

        toggleVisibilityBtn.textContent = room.isVisible ? '部屋を非表示にする' : '部屋を公開する';
       setReadyBtn.style.display = 'none'; // ホストは準備ボタン不要
    } else { // ホストではない場合
        hostControls.style.display = 'none';
        lobbyRoomName.textContent = ` ${room.name}`;
        lobbyRoomId.textContent = room.id;

        // ★★★ ここから修正 ★★★
        // isReady グローバル変数が更新されたので、それに従ってボタンの表示を更新
        setReadyBtn.textContent = isReady ? '準備OK！ (解除)' : '準備完了';
        setReadyBtn.classList.toggle('ready', isReady);
        // ★★★ ここまで修正 ★★★

        setReadyBtn.style.display = 'inline-block'; // 参加者は準備ボタンを表示
        selectedQuizDisplay.textContent = room.quizFile ? `${room.quizTitle}` : 'クイズ未選択';
        playerInputMethodSelection.style.display = 'block';

        selectKokumeiBtn.disabled = true;
        selectShutomeiBtn.disabled = true;
    }
});
// ===============================================
// === ゲーム進行ロジック ===
// ===============================================

// ゲーム開始イベント
socket.on('gameStarted', (gameData) => {
    console.log('Game started! Initial data:', gameData);
    questions = gameData.questions;
    selectedQuizSet = gameData.quizSet;
    selectedQuizTitle = gameData.quizTitle;

    // mySelectedInputMethod がまだ設定されていなければ、サーバーからの情報かデフォルトを適用
    if (!mySelectedInputMethod) {
        mySelectedInputMethod = gameData.inputMethod || "keyboard";
        const radio = document.querySelector(`input[name="myInputMethod"][value="${mySelectedInputMethod}"]`);
        if (radio) radio.checked = true;
    }

    roomSelectionScreen.style.display = "none";
    roomLobby.style.display = "none";
    quizBox.style.display = "block";
    mainTitle.style.display = "none"; // ゲーム開始時もメインタイトルは非表示
    current = 0; // 現在の問題番号をリセット (1問固定なので実質0)
    correctCount = 0; // そのラウンドの正解数をリセット

    // startTime は joinedRoom で設定された gameStartTimeOffset を使用して計算
    if (gameStartTimeOffset !== 0) {
        startTime = performance.now() - (Date.now() - (gameData.gameStartTime || Date.now())) + gameStartTimeOffset;
    } else {
        startTime = performance.now() - (Date.now() - (gameData.gameStartTime || Date.now()));
    }
    console.log(`My game startTime: ${new Date(Date.now() - (performance.now() - startTime)).toLocaleTimeString()}`);
    clearInterval(intervalId); // 既存のタイマーがあればクリア
    intervalId = setInterval(updateTimer, 10); // タイマー開始
    showQuestion(); // 質問表示と入力モードの設定はここで処理される

    // 入力モードに応じてUIを切り替える
    if (mySelectedInputMethod === "flick") {
        enableFlickInput();
        questionEl.style.fontSize = "1.5em"; // フリック入力時のフォントサイズ
    } else { // 'keyboard'
        enablePhysicalInput();
        questionEl.style.fontSize = "2.5em"; // 物理キーボード時のフォントサイズ
    }
    answerEl.disabled = false; // 回答欄を有効化
    // submitBtn.disabled の制御は、個々の入力方法の enable/disable 関数に任せる
});

/**
 * タイマーを更新する
 */
function updateTimer() {
    const now = performance.now();
    const diff = ((now - startTime) / 1000).toFixed(2);
    timerEl.textContent = `${diff}秒`;
}

/**
 * 問題を表示する
 */
function showQuestion() {
    if (questions.length > 0) { // 質問データが空でないことを確認
        questionEl.textContent = questions[0].q; // 常に最初の質問を表示
        questionNumberEl.textContent = `1 / 1`; // 問題数を1/1に固定
        answerEl.value = "";
        feedbackEl.textContent = ""; // フィードバックをクリア

        if (mySelectedInputMethod === "keyboard") {
            romajiBuffer = ""; // ローマ字バッファをクリア
            answerEl.focus(); // フォーカスを当てる
        } else if (mySelectedInputMethod === "flick") {
            // フリック入力の場合、romajiBufferは使用しない
        }
    } else {
        // 問題がない場合のフォールバック
        disablePhysicalInput(); // 両方の入力UIを無効化
        disableFlickInput(); // 両方の入力UIを無効化
        submitBtn.style.display = 'none'; // 問題がない場合は解答ボタンも非表示

        feedbackEl.textContent = '問題がありません。';
        questionEl.textContent = '問題データの読み込みエラー、または未設定です。';
        clearInterval(intervalId);
    }
}

// 解答ボタンクリック時
submitBtn.onclick = () => {
    const ans = answerEl.value.trim();
    // 常に questions[0] と比較
    if (ans === questions[0].a) {
        feedbackEl.textContent = "正解！";
        correctCount = 1; // 1問なので正解したらスコアは1
        clearInterval(intervalId); // 正解したらタイマー停止
        const finalTime = ((performance.now() - startTime) / 1000).toFixed(2);
        // サーバーに正解と回答時間を送信
        socket.emit('playerFinished', { roomId: currentRoomId, finalTime: finalTime, score: correctCount });
        // 正解したら入力フィールドとボタンを無効化 (他のプレイヤーの正解を待つ)
        answerEl.disabled = true;
        submitBtn.disabled = true;
        submitBtn.style.display = 'none'; // 解答ボタンを非表示にする（フリックの場合も）

        // どちらの入力方法でも、ゲーム終了時は入力UIを無効化
        disablePhysicalInput(); // これが呼ばれると answerEl.style.display は none になる
        disableFlickInput();
    } else {
        feedbackEl.textContent = "不正解...";
        correctCount = 0; // 不正解ならスコアは0
        answerEl.focus(); // 再度入力できるようにフォーカス
        // 不正解の場合、タイマーは継続
    }
};

// ゲーム終了イベント
socket.on('gameFinished', (data) => {
    console.log('Game finished event received:', data);
    clearInterval(intervalId); // タイマー停止

    // 入力フィールドとボタンの状態をリセット（結果表示後にロビーに戻ることを想定）
    answerEl.disabled = false;
    submitBtn.disabled = false;
    submitBtn.style.display = 'none'; // ゲーム終了時は解答ボタンを非表示に

    quizBox.style.display = "none";
    resultBox.style.display = "block";
    mainTitle.style.display = "none"; // クイズ終了時もメインタイトルは非表示
    finalScoresList.innerHTML = '';

    // その問題の解答を表示
    if (questions.length > 0) {
        const questionAnswerHeader = document.createElement('h3');
        finalScoresList.appendChild(questionAnswerHeader);
        const questionItem = document.createElement('p');
        questionItem.innerHTML = `問題: ${questions[0].q}<br>解答: ${questions[0].a}`;
        questionItem.style.fontWeight = 'bold';
        questionItem.style.marginBottom = '10px';
        finalScoresList.appendChild(questionItem);
    }

    // 回答時間でソートし、最も早い人を強調
    const sortedPlayers = data.players.sort((a, b) => {
        const timeA = a.finalTime !== null && a.finalTime !== undefined ? parseFloat(a.finalTime) : Infinity;
        const timeB = b.finalTime !== null && b.finalTime !== undefined ? parseFloat(b.finalTime) : Infinity;

        // 正解者優先、次に時間でソート
        if (a.score > b.score) return -1;
        if (a.score < b.score) return 1;

        return timeA - timeB;
    });

    // 最も早かったプレイヤーを特定 (正解者の中から)
    let fastestPlayer = null;
    let minTime = Infinity;
    for (const player of sortedPlayers) {
        if (player.score === 1 && player.finalTime !== null && player.finalTime !== undefined) {
            const time = parseFloat(player.finalTime);
            if (time < minTime) {
                minTime = time;
                fastestPlayer = player;
            }
        }
    }

    // 正解者の表示
    const correctPlayers = sortedPlayers.filter(p => p.score === 1);
    if (correctPlayers.length > 0) {
        const correctHeader = document.createElement('h3');
        correctHeader.textContent = '正解者:';
        finalScoresList.appendChild(correctHeader);
        correctPlayers.forEach(player => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="player-name">${player.nickname}</span>
                <span class="player-final-time">${player.finalTime ? `${player.finalTime}秒` : '---'}</span>
            `;
            if (fastestPlayer && player.id === fastestPlayer.id) {
                li.classList.add('fastest-player');
                li.innerHTML = `<span class="fastest-badge">🏆</span>` + li.innerHTML;
            }
            finalScoresList.appendChild(li);
        });
    }

    // 不正解者の表示
    const incorrectPlayers = sortedPlayers.filter(p => p.score === 0);
    if (incorrectPlayers.length > 0) {
        const incorrectHeader = document.createElement('h3');
        incorrectHeader.textContent = '（不正解・未回答者）';
        finalScoresList.appendChild(incorrectHeader);
        incorrectPlayers.forEach(player => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="player-name">${player.nickname}</span>
                <span class="player-final-time">未回答</span>
            `;
            finalScoresList.appendChild(li);
        });
    }
});

// ロビーに戻るボタン
returnToLobbyBtn.addEventListener('click', () => {
    resultBox.style.display = 'none';
    roomLobby.style.display = 'block';
    mainTitle.style.display = 'none';
    socket.emit('returnToLobby', { roomId: currentRoomId });
    isReady = false; // 準備状態をリセット
    setReadyBtn.textContent = '準備完了';
    setReadyBtn.classList.remove('ready');

    answerEl.value = ''; // 回答をクリア
    feedbackEl.textContent = '';
    questionEl.textContent = '';
    submitBtn.style.display = 'none'; // ロビーに戻る際も解答ボタンは非表示に

    // ロビーに戻る際は、mySelectedInputMethod の状態に応じてUIを切り替える
    // showLobby 関数内で playerInputMethodSelection の表示と toggleInputMethodUI が適切に処理される
});

// ===============================================
// === 初期処理とフリックキーボードDOM生成 ===
// ===============================================

/**
 * 配列をシャッフルする (現在のクイズが1問固定のため、直接は使われない)
 * @param {Array} array - シャッフルする配列
 * @returns {Array} シャッフルされた新しい配列
 */
function shuffleArray(array) {
    const newArray = Array.from(array);
    return newArray.sort(() => Math.random() - 0.5);
}

document.addEventListener('DOMContentLoaded', () => {
    roomSelectionScreen.style.display = 'block';
    mainTitle.style.display = 'block';
    roomLobby.style.display = 'none';
    quizBox.style.display = 'none';
    resultBox.style.display = 'none';

    // フリックキーボードのボタンを動的に生成
    Object.keys(flickData).forEach(base => {
        const btn = createAndAttachFlickBtn(base);
        if (base === "わ") {
            // "わ"行だけはcontrolRowのクリアボタンの前に挿入
            const clearBtn = document.getElementById("clear-btn");
            if (clearBtn) {
                controlRow.insertBefore(btn, clearBtn);
            } else {
                controlRow.appendChild(btn); // clear-btnがない場合
            }
        } else {
            flickGrid.appendChild(btn);
        }
    });

    // 初期状態では両方の入力方法を無効化（ユーザー選択を待つ）
    disablePhysicalInput();
    disableFlickInput();
    submitBtn.style.display = 'none'; // 初期状態では解答ボタンも非表示
});