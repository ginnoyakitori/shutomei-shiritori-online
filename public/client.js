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
        if (kana) {
            answerEl.value += kana;
            answerEl.scrollLeft = answerEl.scrollWidth;
        }
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
        flickGrid.style.display = 'grid'; // 4段目も含めてGridで表示
        answerEl.readOnly = true; 
    } else {
        flickGrid.style.display = 'none';
        answerEl.readOnly = false;
        answerEl.focus();
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
    if (nicknamePrompt === null) return;
    
    myNickname = nicknamePrompt.trim();
    if (!myNickname) {
        alert('ニックネームは必須です。');
        return;
    }
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
    mySelectedInputMethod = null;
    myInputMethodRadios.forEach(radio => radio.checked = false);

    roomLobby.style.display = 'none';
    quizBox.style.display = 'none';
    resultBox.style.display = 'none';
    roomSelectionScreen.style.display = 'block';
    mainTitle.style.display = 'block';
});

function selectQuizType(type) {
    let fileName = type === 'kokumei' ? 'kokumei.csv' : 'shutomei.csv';
    let displayName = type === 'kokumei' ? '国名しりとり' : '首都名しりとり';
    selectedQuizSet = type;
    selectedQuizTitle = displayName;
    selectedQuizDisplay.textContent = ` ${displayName}`;
    socket.emit('selectQuizType', { roomId: currentRoomId, quizFile: fileName, quizTitle: displayName, quizSet: type });
}

toggleVisibilityBtn.addEventListener('click', () => {
    socket.emit('toggleRoomVisibility', { roomId: currentRoomId });
});

startGameBtn.addEventListener('click', () => {
    if (!selectedQuizSet) {
        alert('クイズタイプを選択してください。');
        return;
    }
    socket.emit('startGame', { roomId: currentRoomId, quizSet: selectedQuizSet, quizTitle: selectedQuizTitle, numQuestions: 1 });
});

myInputMethodRadios.forEach(radio => {
    radio.addEventListener('change', (event) => {
        mySelectedInputMethod = event.target.value;
        socket.emit('setPlayerInputMethod', { roomId: currentRoomId, method: mySelectedInputMethod });
        toggleInputMethodUI(mySelectedInputMethod);
    });
});

function showLobby(room) {
    roomSelectionScreen.style.display = 'none';
    mainTitle.style.display = 'none';
    quizBox.style.display = 'none';
    resultBox.style.display = 'none';
    roomLobby.style.display = 'block';
    playerInputMethodSelection.style.display = 'block';

    if (mySelectedInputMethod) {
        toggleInputMethodUI(mySelectedInputMethod);
    } else {
        toggleInputMethodUI('keyboard');
        const kbRadio = document.querySelector('input[name="myInputMethod"][value="keyboard"]');
        if (kbRadio) kbRadio.checked = true;
        mySelectedInputMethod = 'keyboard';
    }

    if (isHost) {
        selectKokumeiBtn.disabled = false;
        selectShutomeiBtn.disabled = false;
        setReadyBtn.style.display = 'none';
    } else {
        selectKokumeiBtn.disabled = true;
        selectShutomeiBtn.disabled = true;
        setReadyBtn.style.display = 'inline-block';
    }
}

// ===============================================
// === Socket.IOイベントハンドラ ===
// ===============================================

socket.on('roomState', (room) => {
    lobbyRoomName.textContent = room.name;
    lobbyRoomId.textContent = room.id;
    playersInRoomList.innerHTML = '';
    const ul = document.createElement('ul');
    room.players.forEach(p => {
        const li = document.createElement('li');
        const status = p.isReady ? ' [OK]' : (p.id === room.hostId ? ' [Host]' : ' [..]');
        const icon = p.inputMethod === 'flick' ? '📱' : '⌨️';
        li.textContent = `${icon} ${p.nickname}${status}`;
        ul.appendChild(li);
    });
    playersInRoomList.appendChild(ul);
    isHost = (socket.id === room.hostId);
    hostControls.style.display = isHost ? 'block' : 'none';
    if (isHost) startGameBtn.disabled = !(room.players.every(p => p.id === room.hostId || p.isReady) && room.selectedQuizSet);
    if (room.selectedQuizTitle) selectedQuizDisplay.textContent = ` ${room.selectedQuizTitle}`;
    toggleVisibilityBtn.textContent = room.isVisible ? "部屋を非表示にする" : "部屋を表示する";
});

socket.on('roomCreated', (room) => {
    currentRoomId = room.id;
    isHost = true;
    showLobby(room);
});

socket.on('joinedRoom', (room) => {
    currentRoomId = room.id;
    isHost = (room.hostId === socket.id);
    showLobby(room);
});

socket.on('gameStarted', (data) => {
    roomLobby.style.display = 'none';
    quizBox.style.display = 'block';
    questions = data.questions;
    current = 0;
    answerEl.value = "";
    romajiBuffer = "";
    feedbackEl.textContent = "";
    
    if (mySelectedInputMethod === 'flick') {
        enableFlickInput();
        disablePhysicalInput();
    } else {
        disableFlickInput();
        enablePhysicalInput();
    }
    
    showQuestion();
    startTime = performance.now();
    intervalId = setInterval(updateTimer, 10);
});

function showQuestion() {
    questionEl.textContent = questions[current].q;
    questionNumberEl.textContent = `${current + 1} / ${questions.length}`;
}

function updateTimer() {
    timerEl.textContent = ((performance.now() - startTime) / 1000).toFixed(2) + "秒";
}

submitBtn.addEventListener('click', () => {
    const ans = answerEl.value.trim();
    if (!ans) return;
    socket.emit('submitAnswer', { roomId: currentRoomId, answer: ans, time: (performance.now() - startTime) / 1000 });
});

socket.on('answerResult', (data) => {
    if (data.isCorrect) {
        feedbackEl.textContent = "正解！";
        feedbackEl.style.color = "green";
        clearInterval(intervalId);
        disableFlickInput();
        disablePhysicalInput();
    } else {
        feedbackEl.textContent = "不正解！";
        feedbackEl.style.color = "red";
        setTimeout(() => feedbackEl.textContent = "", 1000);
    }
});

socket.on('gameResults', (results) => {
    quizBox.style.display = 'none';
    resultBox.style.display = 'block';
    finalScoresList.innerHTML = '';
    results.sort((a, b) => a.time - b.time).forEach((res, i) => {
        const li = document.createElement('li');
        if (i === 0) li.className = 'fastest-player';
        li.innerHTML = `<span>${i + 1}位: ${res.nickname}</span><span>${res.time.toFixed(2)}秒</span>`;
        finalScoresList.appendChild(li);
    });
});

returnToLobbyBtn.addEventListener('click', () => socket.emit('returnToLobby', { roomId: currentRoomId }));
socket.on('returnedToLobby', () => {
    isReady = false;
    setReadyBtn.textContent = '準備完了';
    showLobby({ id: currentRoomId });
});

// ===============================================
// === 初期化 (DOMContentLoaded) ===
// ===============================================
document.addEventListener('DOMContentLoaded', () => {
    roomSelectionScreen.style.display = 'block';
    mainTitle.style.display = 'block';

    const grid = document.getElementById("flick-grid");
    const mBtn = document.getElementById("modify-btn");
    const cBtn = document.getElementById("clear-btn");

    grid.innerHTML = '';
    ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら"].forEach(b => grid.appendChild(createAndAttachFlickBtn(b)));
    
    // 4段目をGridに直接追加して物理的に整列させる
    grid.appendChild(mBtn);
    grid.appendChild(createAndAttachFlickBtn("わ"));
    grid.appendChild(cBtn);

    if (controlRow) controlRow.style.display = 'contents';
    disablePhysicalInput();
    disableFlickInput();
    submitBtn.style.display = 'none';
});

/**
 * 4段目のズレを物理的に解消し、フリックパネルを構築する初期化処理
 */
document.addEventListener('DOMContentLoaded', () => {
    // 画面の初期表示設定
    roomSelectionScreen.style.display = 'block';
    mainTitle.style.display = 'block';
    roomLobby.style.display = 'none';
    quizBox.style.display = 'none';
    resultBox.style.display = 'none';

    const grid = document.getElementById("flick-grid");
    const mBtn = document.getElementById("modify-btn");
    const cBtn = document.getElementById("clear-btn");

    if (grid) {
        // 一旦中身を空にして順番を保証する
        grid.innerHTML = '';

        // 1. 「あ」〜「ら」までを順番にGridに追加 (1〜9番目)
        const mainBases = ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら"];
        mainBases.forEach(base => {
            grid.appendChild(createAndAttachFlickBtn(base));
        });

        // 2. 4段目（最下段）をGridの子要素として直接追加 (10〜12番目)
        // CSSの grid-template-columns: repeat(3, 1fr) により自動で横に並びます
        if (mBtn) grid.appendChild(mBtn);           // 左下：濁点/小文字
        grid.appendChild(createAndAttachFlickBtn("わ")); // 下中央：わ/を/ん
        if (cBtn) grid.appendChild(cBtn);           // 右下：消去

        // controlRowがGridの外にある場合のレイアウト崩れ防止
        const controlRow = document.getElementById("control-row");
        if (controlRow) controlRow.style.display = 'contents';
    }

    // ゲーム開始前の初期状態
    disablePhysicalInput();
    disableFlickInput();
    if (submitBtn) submitBtn.style.display = 'none';
});

// ===============================================
// === 追加のヘルパー関数と安全策 ===
// ===============================================

/**
 * サーバーから部屋の状態を強制的に取得する
 */
function refreshRoomState() {
    if (currentRoomId) {
        socket.emit('getRoomState', { roomId: currentRoomId });
    }
}

// ブラウザの「戻る」対策
window.addEventListener('popstate', () => {
    if (currentRoomId) {
        if (confirm('ロビーから退出しますか？')) {
            socket.emit('leaveRoom', { roomId: currentRoomId });
        }
    }
});

/**
 * エラーハンドリングの強化
 */
socket.on('error', (err) => {
    console.error('Socket Error:', err);
    alert('通信エラーが発生しました。');
});

console.log('Flick Quiz Game Logic Loaded.');