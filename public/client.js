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
let current = 0;
let startTime;
let intervalId;
let correctCount = 0;
let selectedQuizSet = "";
let selectedQuizTitle = "";
let romajiBuffer = "";

// 部屋・プレイヤー状態変数
let currentRoomId = null;
let isHost = false;
let myNickname = "";
let isReady = false;
let gameStartTimeOffset = 0;
let mySelectedInputMethod = null;

// ===============================================
// === DOM要素の取得 ===
// ===============================================
const mainTitle = document.getElementById("main-title");
const roomSelectionScreen = document.getElementById('room-selection-screen');
const roomListUl = document.getElementById('room-list-ul');
const answerEl = document.getElementById("answer");
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
const controlRow = document.getElementById("control-row");

const playerInputMethodSelection = document.getElementById('playerInputMethodSelection');
const myInputMethodRadios = document.querySelectorAll('input[name="myInputMethod"]');

// ===============================================
// === ローマ字変換ロジック ===
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
    "zya": "ジャ","zyi": "ジィ", "zyu": "ズ", "zye": "ゼ","zyo": "ゾ",
    "bya": "ビャ", "byi": "ビィ","byu": "ビュ","bye": "ビェ", "byo": "ビョ",
    "pya": "ピャ", "pyi": "ピィ","pyu": "ピュ","pye": "ピェ", "pyo": "ピョ",
    "dya": "ヂャ", "dyi": "ヂィ","dyu": "ヂュ","dye": "ヂェ", "dyo": "ヂョ",
    "cya": "チャ","cyi": "チィ", "cyu": "チュ","cye": "チェ", "cyo": "チョ",
    "fya": "ファ", "fyu": "フュ", "fyo": "フォ",
    "tsa": "ツァ", "tsi": "ツィ", "tse": "ツェ", "tso": "ツォ",
    "tha": "テャ", "thi": "ティ", "thu": "テュ", "the": "テェ", "tho": "テョ",
    "dha": "デャ", "dhi": "ディ", "dhu": "デュ", "dhe": "デェ","dho": "デョ",
    "dwu": "ドゥ","twu": "トゥ",
    "shi": "シ", "si": "シ", "chi": "チ", "ti": "チ", "tsu": "ツ", "tu": "ツ",
    "fu": "フ", "hu": "フ", "vu": "ヴ",
    "va": "ヴァ", "vi": "ヴィ", "ve": "ヴェ", "vo": "ヴォ",
    "vya": "ヴャ","vyi": "ヴィ","vyu": "ヴュ","vye": "ヴェ","vyo": "ヴョ",
    "fa": "ファ", "fi": "フィ", "fe": "フェ", "fo": "フォ",
    "fyi": "フィ","fye": "フェ",
    "qwa": "クァ","qa": "クァ", "qi": "クィ", "qe": "クェ", "qo": "クォ",
    "kwa": "クァ","qwi": "クィ","qwu": "クゥ","qwe": "クェ","qwo": "クォ",
    "gwa": "グァ", "gwi": "グィ", "gwu": "グゥ","gwe": "グェ","gwo": "グォ",
    "la": "ァ", "xa": "ァ", "li": "ィ", "xi": "ィ", "lu": "ゥ", "xu": "ゥ",
    "le": "ェ", "xe": "ェ", "lo": "ォ", "xo": "ォ",
    "lya": "ャ", "xya": "ャ", "lyu": "ュ", "xyu": "ュ", "lyo": "ョ", "xyo": "ョ",
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
    "wa": "ワ", "wo": "ヲ", "wi": "ウィ", "wu": "ウ", "we": "ウェ",
    "ga": "ガ", "gi": "ギ", "gu": "グ", "ge": "ゲ", "go": "ゴ",
    "za": "ザ", "ji": "ジ", "zi": "ジ", "zu": "ズ", "ze": "ゼ", "zo": "ゾ",
    "da": "ダ", "di": "ヂ", "du": "ヅ", "de": "デ", "do": "ド",
    "ba": "バ", "bi": "ビ", "bu": "ブ", "be": "ベ", "bo": "ボ",
    "pa": "パ", "pi": "ピ", "pu": "プ", "pe": "ペ", "po": "ポ",
    "ltu": "ッ", "xtu": "ッ", "nn": "ン", "n'": "ン", "-": "ー", ".": "。", ",": "、",
};

function processRomajiInput(currentRomajiBuffer) {
    let committedKana = "";
    let remainingRomaji = currentRomajiBuffer;
    while (remainingRomaji.length > 0) {
        let matched = false;
        let bestMatchKana = "";
        let bestMatchLength = 0;
        const sortedKeys = Object.keys(romajiToKanaMap).sort((a, b) => b.length - a.length);
        for (const romajiPattern of sortedKeys) {
            if (remainingRomaji.startsWith(romajiPattern)) {
                bestMatchKana = romajiToKanaMap[romajiPattern];
                bestMatchLength = romajiPattern.length;
                matched = true;
                break;
            }
        }
        if (!matched && remainingRomaji.startsWith('n')) {
            if (remainingRomaji.length === 1) break;
            const nextChar = remainingRomaji[1];
            if (nextChar === 'n' || (!VOWELS.has(nextChar) && nextChar !== 'y')) {
                bestMatchKana = "ン";
                bestMatchLength = 1;
                matched = true;
            } else { break; }
        }
        if (!matched && remainingRomaji.length >= 2 && remainingRomaji[0] === remainingRomaji[1] && !VOWELS.has(remainingRomaji[0])) {
            if (remainingRomaji[0] !== 'n') {
                const tempRemaining = remainingRomaji.substring(1);
                let foundNextKanaForTsu = false;
                for (const romajiPattern of sortedKeys) {
                    if (tempRemaining.startsWith(romajiPattern) && !['n', 'nn', "n'"].includes(romajiPattern)) {
                        committedKana += "ッ" + romajiToKanaMap[romajiPattern];
                        remainingRomaji = tempRemaining.substring(romajiPattern.length);
                        matched = true;
                        foundNextKanaForTsu = true;
                        break;
                    }
                }
                if (foundNextKanaForTsu) continue;
            }
        }
        if (matched && bestMatchLength > 0) {
            committedKana += bestMatchKana;
            remainingRomaji = remainingRomaji.substring(bestMatchLength);
        } else { break; }
    }
    return { committedKana, remainingRomaji };
}

function physicalInputKeydownHandler(event) {
    if (!romajiBuffer) romajiBuffer = "";
    const answerValue = answerEl.value || "";
    let currentKana = answerValue.substring(0, answerValue.length - romajiBuffer.length);

    if (event.key === "Enter") {
        event.preventDefault();
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
            if (matched) {
                finalConvertedKana += bestMatchKana;
                tempFinalBuffer = tempFinalBuffer.substring(bestMatchLength);
            } else {
                finalConvertedKana += tempFinalBuffer[0];
                tempFinalBuffer = tempFinalBuffer.substring(1);
            }
        }
        answerEl.value = currentKana + finalConvertedKana;
        romajiBuffer = "";
        if (quizBox.style.display === "block") submitBtn.click();
        return;
    }

    if (event.key === "Backspace") {
        event.preventDefault();
        if (romajiBuffer.length > 0) romajiBuffer = romajiBuffer.slice(0, -1);
        else if (currentKana.length > 0) currentKana = currentKana.slice(0, -1);
        answerEl.value = currentKana + romajiBuffer;
        return;
    }

    if (event.ctrlKey || event.altKey || event.metaKey || (event.key.length > 1 && event.key !== '-' && event.key !== ' ')) return;

    if (/[a-zA-Z0-9\-\s',]/.test(event.key)) {
        if (event.key === ' ') {
            event.preventDefault();
            answerEl.value += " ";
            romajiBuffer = "";
            return;
        }
        romajiBuffer += event.key.toLowerCase();
        event.preventDefault();
    }
    const { committedKana, remainingRomaji } = processRomajiInput(romajiBuffer);
    answerEl.value = currentKana + committedKana + remainingRomaji;
    romajiBuffer = remainingRomaji;
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
    ツ: ["ツ", "ッ"], ハ: ["ハ", "バ", "パ"], ヒ: ["ヒ", "ビ", "ピ"], フ: ["フ", "ブ", "プ"],
    ヘ: ["ヘ", "ベ", "ペ"], ホ: ["ホ", "ボ", "ポ"], ア: ["ア", "ァ"], イ: ["イ", "ィ"],
    ウ: ["ウ", "ゥ"], エ: ["エ", "ェ"], オ: ["オ", "ォ"], カ: ["カ", "ガ"],
    キ: ["キ", "ギ"], ク: ["ク", "グ"], ケ: ["ケ", "ゲ"], コ: ["コ", "ゴ"],
    サ: ["サ", "ザ"], シ: ["シ", "ジ"], ス: ["ス", "ズ"], セ: ["セ", "ゼ"],
    ソ: ["ソ", "ゾ"], タ: ["タ", "ダ"], チ: ["チ", "ヂ"], テ: ["テ", "デ"],
    ト: ["ト", "ド"], ヤ: ["ヤ", "ャ"], ユ: ["ユ", "ュ"], ヨ: ["ヨ", "ョ"], ワ: ["ワ", "ヮ"]
};

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
    btn.addEventListener("touchstart", e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });
    btn.addEventListener("touchend", e => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;
        const th = 30;
        let dir = 4;
        if (Math.abs(dx) > th || Math.abs(dy) > th) {
            if (Math.abs(dx) > Math.abs(dy)) dir = (dx > th) ? 1 : 3;
            else dir = (dy > th) ? 2 : 0;
        }
        const kana = flickData[base][dir];
        if (kana) {
            answerEl.value += kana;
            answerEl.scrollLeft = answerEl.scrollWidth;
        }
    });
    btn.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
    return btn;
}

const clearBtnClickHandler = () => {
    if (mySelectedInputMethod === "keyboard") {
        if (!romajiBuffer) romajiBuffer = "";
        const val = answerEl.value || "";
        let cur = val.substring(0, val.length - romajiBuffer.length);
        if (romajiBuffer.length > 0) romajiBuffer = romajiBuffer.slice(0, -1);
        else if (cur.length > 0) cur = cur.slice(0, -1);
        answerEl.value = cur + romajiBuffer;
    } else {
        answerEl.value = answerEl.value.slice(0, -1);
    }
};

const modifyBtnClickHandler = () => {
    const val = answerEl.value;
    if (!val) return;
    const last = val.slice(-1);
    const rest = val.slice(0, -1);
    const chain = transformChainMap[last] || Object.entries(transformChainMap).find(([, arr]) => arr.includes(last))?.[1];
    if (!chain) return;
    const idx = chain.indexOf(last);
    answerEl.value = rest + chain[(idx + 1) % chain.length];
};

// ===============================================
// === UI制御ヘルパー ===
// ===============================================
function enablePhysicalInput() {
    answerEl.readOnly = true;
    answerEl.style.display = 'block';
    submitBtn.style.display = 'none';
    document.addEventListener("keydown", physicalInputKeydownHandler);
    answerEl.focus();
}

function disablePhysicalInput() {
    document.removeEventListener("keydown", physicalInputKeydownHandler);
}

function enableFlickInput() {
    flickGrid.style.display = "grid";
    submitBtn.style.display = "block";
    answerEl.readOnly = true;
    answerEl.style.display = 'block';
    const clearBtn = document.getElementById("clear-btn");
    const modifyBtn = document.getElementById("modify-btn");
    clearBtn.onclick = clearBtnClickHandler;
    modifyBtn.onclick = modifyBtnClickHandler;
}

function disableFlickInput() {
    flickGrid.style.display = "none";
}

function toggleInputMethodUI(method) {
    if (method === 'flick') {
        disablePhysicalInput();
        enableFlickInput();
    } else {
        disableFlickInput();
        enablePhysicalInput();
    }
}

// ===============================================
// === 部屋・ロビー機能 ===
// ===============================================
createRoomBtn.addEventListener('click', () => {
    const roomName = createRoomNameInput.value.trim();
    myNickname = createNicknameInput.value.trim();
    if (!roomName || !myNickname) return alert('名前とニックネームを入力してください。');
    socket.emit('createRoom', { roomName, nickname: myNickname });
});

joinRoomBtn.addEventListener('click', () => {
    const roomId = joinRoomIdInput.value.trim();
    myNickname = prompt('ニックネームを入力してください:')?.trim();
    if (roomId && myNickname) socket.emit('joinRoom', { roomId, nickname: myNickname });
});

setReadyBtn.addEventListener('click', () => {
    isReady = !isReady;
    socket.emit('setReady', { roomId: currentRoomId, isReady });
    setReadyBtn.textContent = isReady ? '準備OK！ (解除)' : '準備完了';
});

leaveRoomBtn.addEventListener('click', () => {
    socket.emit('leaveRoom', { roomId: currentRoomId });
    location.reload();
});

function selectQuizType(type) {
    const map = { kokumei: ['kokumei.csv', '国名しりとり', 'kokumei'], shutomei: ['shutomei.csv', '首都名しりとり', 'shutomei'] };
    const [file, title, set] = map[type];
    selectedQuizSet = set;
    selectedQuizTitle = title;
    selectedQuizDisplay.textContent = ` ${title}`;
    socket.emit('selectQuizType', { roomId: currentRoomId, quizFile: file, quizTitle: title, quizSet: set });
}

selectKokumeiBtn.onclick = () => selectQuizType('kokumei');
selectShutomeiBtn.onclick = () => selectQuizType('shutomei');

toggleVisibilityBtn.onclick = () => socket.emit('toggleRoomVisibility', { roomId: currentRoomId });

startGameBtn.onclick = () => {
    if (!selectedQuizSet) return alert('モードを選択してください。');
    socket.emit('startGame', { roomId: currentRoomId, quizSet: selectedQuizSet, quizTitle: selectedQuizTitle, numQuestions: 1 });
};

myInputMethodRadios.forEach(radio => {
    radio.addEventListener('change', e => {
        mySelectedInputMethod = e.target.value;
        socket.emit('setPlayerInputMethod', { roomId: currentRoomId, method: mySelectedInputMethod });
        toggleInputMethodUI(mySelectedInputMethod);
    });
});

// ===============================================
// === Socket.IO通信 ===
// ===============================================
socket.on('roomCreated', room => { currentRoomId = room.id; isHost = true; showLobby(room); });
socket.on('joinedRoom', room => { currentRoomId = room.id; isHost = (socket.id === room.hostId); showLobby(room); });

function showLobby(room) {
    roomSelectionScreen.style.display = 'none';
    mainTitle.style.display = 'none';
    roomLobby.style.display = 'block';
    hostControls.style.display = isHost ? 'block' : 'none';
    setReadyBtn.style.display = isHost ? 'none' : 'inline-block';
}

socket.on('roomState', room => {
    lobbyRoomName.textContent = room.name;
    lobbyRoomId.textContent = room.id;
    playersInRoomList.innerHTML = '<ul>' + room.players.map(p => `<li>${p.inputMethod === 'flick' ? '📱' : '⌨️'} ${p.nickname} ${p.isReady ? '[OK]' : ''}</li>`).join('') + '</ul>';
    if (isHost) startGameBtn.disabled = !(room.players.every(p => p.id === room.hostId || p.isReady) && room.selectedQuizSet);
});

socket.on('gameStarted', data => {
    roomLobby.style.display = 'none';
    quizBox.style.display = 'block';
    questions = data.questions;
    current = 0;
    answerEl.value = "";
    feedbackEl.textContent = "";
    showQuestion();
    startTime = performance.now();
    intervalId = setInterval(() => { timerEl.textContent = ((performance.now() - startTime)/1000).toFixed(2) + "秒"; }, 10);
});

function showQuestion() {
    questionEl.textContent = questions[current].q;
    questionNumberEl.textContent = `${current + 1} / ${questions.length}`;
}

submitBtn.onclick = () => {
    socket.emit('submitAnswer', { roomId: currentRoomId, answer: answerEl.value.trim(), time: (performance.now() - startTime)/1000 });
};

socket.on('answerResult', data => {
    if (data.isCorrect) {
        clearInterval(intervalId);
        feedbackEl.textContent = "正解！待機中...";
    } else {
        feedbackEl.textContent = "不正解！";
        setTimeout(() => feedbackEl.textContent = "", 1000);
    }
});

socket.on('gameResults', results => {
    quizBox.style.display = 'none';
    resultBox.style.display = 'block';
    finalScoresList.innerHTML = results.sort((a,b)=>a.time-b.time).map((r,i)=>`<li>${i+1}位: ${r.nickname} - ${r.time.toFixed(2)}秒</li>`).join('');
});

returnToLobbyBtn.onclick = () => socket.emit('returnToLobby', { roomId: currentRoomId });
socket.on('returnedToLobby', () => { isReady = false; showLobby({id: currentRoomId}); });

// ===============================================
// === 初期配置 ===
// ===============================================
document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById("flick-grid");
    const modifyBtn = document.getElementById("modify-btn");
    const clearBtn = document.getElementById("clear-btn");
    grid.innerHTML = '';
    ["あ", "か", "さ", "た", "な", "は", "ま", "や", "ら"].forEach(b => grid.appendChild(createAndAttachFlickBtn(b)));
    grid.appendChild(modifyBtn);
    grid.appendChild(createAndAttachFlickBtn("わ"));
    grid.appendChild(clearBtn);
    if (controlRow) controlRow.style.display = 'contents';
    roomSelectionScreen.style.display = 'block';
});