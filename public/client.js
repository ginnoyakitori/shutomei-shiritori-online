import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, addDoc, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

const socket = io();

let questions = [];
let current = 0;
let startTime; // 自分のゲーム開始時間
let intervalId;
let correctCount = 0;
let selectedQuizSet = "";
let selectedQuizTitle = "";
let selectedInputMethod = "flick";

let romajiBuffer = "";

// DOM要素の取得
const mainTitle = document.getElementById("main-title");
const roomSelectionScreen = document.getElementById('room-selection-screen');
const roomListDiv = document.getElementById('room-list');

const createRoomNameInput = document.getElementById('create-room-name');
const createNicknameInput = document.getElementById('create-nickname');
const createRoomBtn = document.getElementById('create-room-btn');

const joinRoomIdInput = document.getElementById('join-room-id');
const joinNicknameInput = document.getElementById('join-nickname');
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
const answerEl = document.getElementById("answer");
const timerEl = document.getElementById("timer");
const feedbackEl = document.getElementById("feedback");
const submitBtn = document.getElementById("submit-btn");

const resultBox = document.getElementById("result-box");
const finalResultMessage = document.getElementById('final-result-message');
const yourScoreEl = document.getElementById('your-score');
const finalScoresList = document.getElementById('final-scores');
const returnToLobbyBtn = document.getElementById('return-to-lobby-btn');

const flickGrid = document.getElementById("flick-grid");
const controlRow = document.getElementById("control-row");


// ===============================================
// === ローマ字変換ロジック (変更なし) ===
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
    "zya": "ジャ","zyi": "ジィ", "zyu": "ジュ", "zye": "ジェ","zyo": "ジョ",
    "bya": "ビャ", "byi": "ビィ","byu": "ビュ","bye": "ビェ", "byo": "ビョ",
    "pya": "ピャ", "pyi": "ピィ","pyu": "ピュ","pye": "ピェ", "pyo": "ピョ",
    "dya": "ヂャ", "dyi": "ヂィ","dyu": "ヂュ","dye": "ヂェ", "dyo": "ヂョ",
    "cya": "チャ","cyi": "チィ", "cyu": "チュ","cye": "チェ", "cyo": "チョ",
    "jya": "ジャ", "jyu": "ジュ", "jyo": "ジョ",
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
    "ba": "バ", "bi": "ビ", "bu": "ブ", "be": "ベ", "bo": "ボ",
    "pa": "パ", "pi": "ピ", "pu": "プ", "pe": "ペ", "po": "ポ",

    "ltu": "ッ", "xtu": "ッ", 
    "nn": "ン", // nn は ン に変換
    "n'": "ン", // n' も ン に変換 (例: shin'ei)
    
    "-": "ー",
    ".": "。",
    ",": "、",
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
            if (remainingRomaji.length === 1) {
                break; 
            } else {
                const nextChar = remainingRomaji[1];
                if (nextChar === 'n' || (!VOWELS.has(nextChar) && nextChar !== 'y')) {
                    bestMatchKana = "ン";
                    bestMatchLength = 1;
                    matched = true;
                } else {
                    break;
                }
            }
        }

        if (!matched && remainingRomaji.length >= 2 && remainingRomaji[0] === remainingRomaji[1] && !VOWELS.has(remainingRomaji[0])) {
            if (remainingRomaji[0] !== 'n') {
                const tempRemaining = remainingRomaji.substring(1); 
                let foundNextKanaForTsu = false;
                const sortedKeysForTsu = Object.keys(romajiToKanaMap).sort((a, b) => b.length - a.length);
                for (const romajiPattern of sortedKeysForTsu) {
                    if (tempRemaining.startsWith(romajiPattern) && !['n', 'nn', "n'"].includes(romajiPattern)) {
                        committedKana += "ッ" + romajiToKanaMap[romajiPattern];
                        remainingRomaji = tempRemaining.substring(romajiPattern.length);
                        matched = true;
                        foundNextKanaForTsu = true;
                        break;
                    }
                }
                if (foundNextKanaForTsu) {
                    continue;
                }
            }
        }

        if (matched && bestMatchLength > 0) {
            committedKana += bestMatchKana;
            remainingRomaji = remainingRomaji.substring(bestMatchLength);
        } else {
            break;
        }
    }
    return { committedKana, remainingRomaji };
}

function physicalInputKeydownHandler(event) {
    if (romajiBuffer === undefined || romajiBuffer === null) {
        romajiBuffer = "";
    }
    console.log("Keydown:", event.key, "Code:", event.code, "romajiBuffer (before):", romajiBuffer);

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
            
            if (matched && bestMatchLength > 0) {
                finalConvertedKana += bestMatchKana;
                tempFinalBuffer = tempFinalBuffer.substring(bestMatchLength);
            } else {
                finalConvertedKana += tempFinalBuffer[0];
                tempFinalBuffer = tempFinalBuffer.substring(1);
            }
        }
        answerEl.value = currentKana + finalConvertedKana;
        romajiBuffer = "";
        if (quizBox.style.display === "block") {
            submitBtn.click();
        }
        return;
    }

    if (event.key === "Backspace") {
        event.preventDefault();
        if (romajiBuffer.length > 0) {
            romajiBuffer = romajiBuffer.slice(0, -1);
        } else if (currentKana.length > 0) {
            currentKana = currentKana.slice(0, -1);
        }
        answerEl.value = currentKana + romajiBuffer;
        console.log("romajiBuffer (after Backspace):", romajiBuffer);
        return;
    }

    if (event.ctrlKey || event.altKey || event.metaKey ||
        (event.key.length > 1 && event.key !== '-' && event.key !== ' ')) {
        console.log("Ignored key (control/alt/meta/function):", event.key);
        return;
    }

    if (/[a-zA-Z0-9\-\s',]/.test(event.key)) {
        if (event.key === ' ') {
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
                    
                    if (matched && bestMatchLength > 0) {
                        finalConvertedKana += bestMatchKana;
                        tempFinalBuffer = tempFinalBuffer.substring(bestMatchLength);
                    } else {
                        finalConvertedKana += tempFinalBuffer[0];
                        tempFinalBuffer = tempFinalBuffer.substring(1);
                    }
                }
            answerEl.value = currentKana + finalConvertedKana + " ";
            romajiBuffer = "";
            console.log("Space pressed. romajiBuffer cleared, answerEl updated.");
            return;
        }

        romajiBuffer += event.key.toLowerCase();
        event.preventDefault();
        console.log("Key added to romajiBuffer:", event.key.toLowerCase(), "Current romajiBuffer:", romajiBuffer);
    } else {
        console.log("Non-input key (or unhandled character):", event.key);
    }
    
    const { committedKana, remainingRomaji } = processRomajiInput(romajiBuffer);
    answerEl.value = currentKana + committedKana + remainingRomaji;
    romajiBuffer = remainingRomaji;

    console.log("answerEl.value (after processRomajiInput):", answerEl.value);
}

function enablePhysicalInput() {
  document.addEventListener("keydown", physicalInputKeydownHandler);
  console.log("Physical input enabled.");
}

function disablePhysicalInput() {
  document.removeEventListener("keydown", physicalInputKeydownHandler);
  console.log("Physical input disabled.");
}

// ニックネーム入力フィールドと部屋ID入力フィールドにフォーカスが当たった際の物理キーボード無効化
createNicknameInput.addEventListener('focus', disablePhysicalInput);
createNicknameInput.addEventListener('blur', () => {
    // クイズ中かつフリック入力でない場合のみ物理キーボードを再有効化
    if (quizBox.style.display === "block" && selectedInputMethod === "physical") {
        enablePhysicalInput();
    }
});
joinNicknameInput.addEventListener('focus', disablePhysicalInput);
joinNicknameInput.addEventListener('blur', () => {
    if (quizBox.style.display === "block" && selectedInputMethod === "physical") {
        enablePhysicalInput();
    }
});
joinRoomIdInput.addEventListener('focus', disablePhysicalInput);
joinRoomIdInput.addEventListener('blur', () => {
    if (quizBox.style.display === "block" && selectedInputMethod === "physical") {
        enablePhysicalInput();
    }
});


// ===============================================
// === 部屋選択・ロビー機能 ===
// ===============================================

let currentRoomId = null;
let isHost = false;
let myNickname = "";
let isReady = false;
let gameStartTimeOffset = 0; // ゲーム中に入室した際の時間オフセット

function renderRoomList(rooms) {
    roomListDiv.innerHTML = '';
    if (rooms.length === 0) {
        roomListDiv.innerHTML = '<p>現在、利用可能な部屋はありません。</p>';
        return;
    }

    rooms.forEach(room => {
        const roomItem = document.createElement('div');
        roomItem.classList.add('room-item');
        if (room.players.length >= room.maxPlayers) {
            // roomItem.classList.add('full'); // 満員でも参加できるようにする場合はこの行をコメントアウト
        }
        if (room.isPlaying) {
            roomItem.classList.add('playing');
        }
        roomItem.dataset.roomId = room.id;
        roomItem.innerHTML = `
            <h4>${room.name}</h4>
            <p>プレイヤー: ${room.players.length}/${room.maxPlayers}</p>
            <p>ホスト: ${room.hostName}</p>
            <p>ステータス: ${room.isPlaying ? 'ゲーム中' : '待機中'}</p>
        `;
        roomListDiv.appendChild(roomItem);

        roomItem.addEventListener('click', () => {
            myNickname = prompt('ニックネームを入力してください (任意):');
            if (myNickname === null) {
                return;
            }
            myNickname = myNickname.trim() || `名無しさん`;
            socket.emit('joinRoom', { roomId: room.id, nickname: myNickname });
        });
    });
}

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

joinRoomBtn.addEventListener('click', () => {
    const roomId = joinRoomIdInput.value.trim();
    myNickname = joinNicknameInput.value.trim();

    if (!roomId) {
        alert('部屋IDを入力してください。');
        return;
    }
    if (!myNickname) {
        alert('ニックネームを入力してください。');
        return;
    }
    socket.emit('joinRoom', { roomId, nickname: myNickname });
});


setReadyBtn.addEventListener('click', () => {
    isReady = !isReady;
    socket.emit('setReady', { roomId: currentRoomId, isReady: isReady });
    setReadyBtn.textContent = isReady ? '準備OK！ (解除)' : '準備完了';
    setReadyBtn.classList.toggle('ready', isReady);
});

leaveRoomBtn.addEventListener('click', () => {
    socket.emit('leaveRoom', { roomId: currentRoomId });
    currentRoomId = null;
    isHost = false;
    isReady = false;
    roomLobby.style.display = 'none';
    roomSelectionScreen.style.display = 'block';
    mainTitle.style.display = 'block';
});

selectKokumeiBtn.addEventListener('click', () => selectQuizType('kokumei'));
selectShutomeiBtn.addEventListener('click', () => selectQuizType('shutomei'));

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
    selectedQuizDisplay.textContent = `選択中のクイズ: ${displayName}`;

    socket.emit('selectQuizType', { roomId: currentRoomId, quizFile: fileName, quizTitle: displayName, quizSet: setName });
}

toggleVisibilityBtn.addEventListener('click', () => {
    socket.emit('toggleRoomVisibility', { roomId: currentRoomId });
});

startGameBtn.addEventListener('click', () => {
    if (!selectedQuizSet) {
        alert('クイズタイプを選択してください。');
        return;
    }
    socket.emit('startGame', { roomId: currentRoomId, quizSet: selectedQuizSet, quizTitle: selectedQuizTitle });
});

// Socket.IOイベントハンドラ
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    currentRoomId = null;
    isHost = false;
    isReady = false;
    roomLobby.style.display = 'none';
    quizBox.style.display = 'none';
    resultBox.style.display = 'none';
    roomSelectionScreen.style.display = 'block';
    mainTitle.style.display = 'block';
});

socket.on('roomList', (rooms) => {
    console.log('--- roomList イベントを受信しました');
    console.log('受信した部屋リスト:', rooms);
    renderRoomList(rooms);
});

socket.on('roomCreated', (room) => {
    console.log('Room created:', room);
    currentRoomId = room.id;
    isHost = true;
    showLobby(room);
    alert(`部屋 ${room.id} が作成されました。`); // 部屋作成の通知
});

socket.on('joinedRoom', (room) => {
    console.log('Joined room:', room);
    currentRoomId = room.id;
    isHost = room.hostId === socket.id; // 再度ホストかどうか確認
    showLobby(room);
    if (room.isPlaying && room.startTime) {
        // ゲーム中に途中参加した場合のオフセットを設定
        gameStartTimeOffset = performance.now() - (Date.now() - room.startTime);
        console.log(`Joined game in progress. My time offset: ${gameStartTimeOffset}`);
    } else {
        gameStartTimeOffset = 0;
    }
});

socket.on('roomError', (message) => {
    alert('エラー: ' + message);
    if (!currentRoomId) {
        roomLobby.style.display = 'none';
        roomSelectionScreen.style.display = 'block';
        mainTitle.style.display = 'block';
    }
});

socket.on('roomStateUpdate', (room) => {
    console.log('Room state updated:', room);
    playersInRoomList.innerHTML = '<h3>参加プレイヤー:</h3><ul></ul>';
    const ul = playersInRoomList.querySelector('ul');
    room.players.forEach(player => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="player-info">
                <span class="player-name">${player.nickname}</span>
                <span class="player-status ${player.isReady ? 'ready' : ''} ${player.isHost ? 'host' : ''}">
                    ${player.isHost ? 'ホスト' : (player.isReady ? '準備OK' : '未準備')}
                </span>
            </div>
            <span class="player-score">スコア: ${player.score || 0}</span>
        `;
        ul.appendChild(li);
    });

    if (isHost) {
        hostControls.style.display = 'block';
        lobbyRoomName.textContent = `部屋: ${room.name} (ホスト)`;
        lobbyRoomId.textContent = room.id;
        // ホスト自身も準備完了とみなし、他のプレイヤーが準備完了になればゲーム開始可能
        const allReady = room.players.length > 0 && room.players.every(p => p.isReady || p.isHost);
        startGameBtn.disabled = !allReady || !room.quizFile; // room.quizFile が設定されていることを確認
        toggleVisibilityBtn.textContent = room.isVisible ? '部屋を非表示にする' : '部屋を公開する';
        setReadyBtn.style.display = 'none'; // ホストは準備完了ボタンを非表示

        selectKokumeiBtn.classList.remove('selected');
        selectShutomeiBtn.classList.remove('selected');
        if (room.quizFile === 'kokumei.csv') {
            selectKokumeiBtn.classList.add('selected');
            selectedQuizTitle = '国名しりとり'; // ホストの表示用に更新
            selectedQuizSet = 'kokumei';
        } else if (room.quizFile === 'shutomei.csv') {
            selectShutomeiBtn.classList.add('selected');
            selectedQuizTitle = '首都名しりとり'; // ホストの表示用に更新
            selectedQuizSet = 'shutomei';
        }
        selectedQuizDisplay.textContent = room.quizFile ? `選択中のクイズ: ${selectedQuizTitle}` : 'クイズ未選択';

    } else {
        hostControls.style.display = 'none';
        lobbyRoomName.textContent = `部屋: ${room.name}`;
        lobbyRoomId.textContent = room.id;
        setReadyBtn.textContent = isReady ? '準備OK！ (解除)' : '準備完了';
        setReadyBtn.classList.toggle('ready', isReady);
        setReadyBtn.style.display = 'inline-block'; // 参加者は準備完了ボタンを表示
        selectedQuizDisplay.textContent = room.quizFile ? `選択中のクイズ: ${room.quizTitle}` : 'クイズ未選択';
    }
});

function showLobby(room) {
    roomSelectionScreen.style.display = 'none';
    mainTitle.style.display = 'none';
    quizBox.style.display = 'none';
    resultBox.style.display = 'none';
    roomLobby.style.display = 'block';
    
    disablePhysicalInput();
    disableFlickInput();

    if (isHost) {
        selectKokumeiBtn.disabled = false;
        selectShutomeiBtn.disabled = false;
        setReadyBtn.style.display = 'none';
    } else {
        selectKokumeiBtn.disabled = true;
        selectShutomeiBtn.disabled = true;
        setReadyBtn.style.display = 'inline-block';
    }
    socket.emit('getRoomState', { roomId: room.id });
}


// ===============================================
// === ゲーム進行ロジック (変更と統合) ===
// ===============================================

socket.on('gameStarted', (gameData) => {
    console.log('Game started! Initial data:', gameData);
    questions = gameData.questions;
    selectedQuizSet = gameData.quizSet;
    selectedQuizTitle = gameData.quizTitle;
    selectedInputMethod = gameData.inputMethod || "flick";

    roomSelectionScreen.style.display = "none";
    roomLobby.style.display = "none";
    quizBox.style.display = "block";
    document.getElementById("main-title").style.display = "none"; 
    
    current = 0;
    correctCount = 0;
    startTime = performance.now() - gameStartTimeOffset; // 途中参加者のオフセットを考慮
    
    clearInterval(intervalId); // 既存のタイマーがあればクリア
    intervalId = setInterval(updateTimer, 10);
    showQuestion();
    
    if (selectedInputMethod === "flick") {
        flickGrid.style.display = "grid";
        controlRow.style.display = "flex";
        submitBtn.style.display = "block";
        answerEl.readOnly = true;
        answerEl.removeAttribute("inputmode");
        answerEl.style.imeMode = "";
        questionEl.style.fontSize = "1.5em";
        enableFlickInput();
        disablePhysicalInput();
        console.log("Switched to Flick Input for game.");
    } else { // physical
        flickGrid.style.display = "none";
        controlRow.style.display = "none";
        submitBtn.style.display = "none";
        answerEl.readOnly = false; // 物理キーボードでは直接入力
        answerEl.setAttribute("inputmode", "text");
        answerEl.setAttribute("autocapitalize", "off");
        answerEl.setAttribute("autocomplete", "off");
        answerEl.setAttribute("autocorrect", "off");
        answerEl.setAttribute("spellcheck", "false");
        answerEl.style.imeMode = "inactive";
        answerEl.focus();
        questionEl.style.fontSize = "2.5em";
        enablePhysicalInput();
        disableFlickInput();
        console.log("Switched to Physical Keyboard Input for game.");
    }
});

function updateTimer() {
    const now = performance.now();
    const diff = ((now - startTime) / 1000).toFixed(2);
    timerEl.textContent = `${diff}秒`;
    // 個々のプレイヤーの時間はクライアントで表示し、サーバーには最終タイムのみ通知
}

function showQuestion() {
    if (current < questions.length) {
        questionEl.textContent = questions[current].q;
        const questionNumberEl = document.getElementById("question-number");
        questionNumberEl.textContent = ` ${current + 1} / ${questions.length}`;
        answerEl.value = "";
        feedbackEl.textContent = "";
        if (selectedInputMethod === "physical") {
            romajiBuffer = "";
            answerEl.focus();
            console.log("Question shown, romajiBuffer cleared.");
        }
        answerEl.style.display = 'block'; // 再利用のため表示に戻す
        if (selectedInputMethod === "flick") {
            flickGrid.style.display = 'grid';
            controlRow.style.display = 'flex';
            submitBtn.style.display = 'block';
        } else {
            flickGrid.style.display = 'none';
            controlRow.style.display = 'none';
            submitBtn.style.display = 'none';
        }
    } else {
        answerEl.style.display = 'none';
        flickGrid.style.display = 'none';
        controlRow.style.display = 'none';
        submitBtn.style.display = 'none';
        feedbackEl.textContent = '解答を待っています...';
        questionEl.textContent = '他のプレイヤーの解答を待っています...';
        clearInterval(intervalId);
        disablePhysicalInput();
        disableFlickInput();
    }
}

submitBtn.onclick = () => {
    const ans = answerEl.value.trim();
    console.log("Submitted answer:", ans, "Correct answer:", questions[current].a);
    if (ans === questions[current].a) {
        feedbackEl.textContent = "正解！";
        correctCount++;
        current++;
        if (current >= questions.length) {
            clearInterval(intervalId);
            const finalTime = ((performance.now() - startTime) / 1000).toFixed(2);
            socket.emit('playerFinished', { roomId: currentRoomId, finalTime: finalTime, score: correctCount });
        } else {
            setTimeout(showQuestion, 500);
        }
    } else {
        feedbackEl.textContent = "不正解...";
    }
    socket.emit('submitAnswer', { roomId: currentRoomId, score: correctCount }); // スコアのみ送信
};

socket.on('gameFinished', (data) => {
    console.log('Game finished event received:', data);
    clearInterval(intervalId);
    disablePhysicalInput();
    disableFlickInput();

    quizBox.style.display = "none";
    resultBox.style.display = "block";
    mainTitle.style.display = "block";

    finalResultMessage.textContent = data.message;
    const myPlayer = data.players.find(p => p.id === socket.id);
    yourScoreEl.textContent = `あなたのスコア: ${myPlayer?.score || 0}点`;

    finalScoresList.innerHTML = '';
    data.players.sort((a, b) => b.score - a.score || a.finalTime - b.finalTime);
    data.players.forEach(player => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="player-name">${player.nickname}</span>
            <span class="player-final-score">${player.score}点</span>
            <span class="player-final-time">${player.finalTime ? `${player.finalTime}秒` : 'N/A'}</span>
        `;
        finalScoresList.appendChild(li);
    });
});

returnToLobbyBtn.addEventListener('click', () => {
    resultBox.style.display = 'none';
    roomLobby.style.display = 'block';
    socket.emit('returnToLobby', { roomId: currentRoomId });
    isReady = false; // 準備状態をリセット
    setReadyBtn.textContent = '準備完了';
    setReadyBtn.classList.remove('ready');
    answerEl.style.display = 'block';
    flickGrid.style.display = 'none';
    controlRow.style.display = 'none';
    submitBtn.style.display = 'none';
    feedbackEl.textContent = '';
    questionEl.textContent = '';
    answerEl.value = '';
});


// ===============================================
// === フリック入力関連 (変更なし) ===
// ===============================================
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

let startX = 0, startY = 0;

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
    const touchMoveHandler = e => e.preventDefault();
    
    btn._eventHandlers = { touchStartHandler, touchEndHandler, touchMoveHandler };
    return btn;
}

function disableFlickInput() {
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
    if (clearBtn) clearBtn.removeEventListener("click", clearBtnClickHandler);
    if (modifyBtn) modifyBtn.removeEventListener("click", modifyBtnClickHandler);
    console.log("Flick input disabled.");
}

function enableFlickInput() {
    const allFlickBtns = document.querySelectorAll(".flick-btn"); 
    allFlickBtns.forEach(btn => {
        if (btn._eventHandlers) {
            btn.addEventListener("touchstart", btn._eventHandlers.touchStartHandler);
            btn.addEventListener("touchend", btn._eventHandlers.touchEndHandler);
            btn.addEventListener("touchmove", btn._eventHandlers.touchMoveHandler, { passive: false });
        }
    });
    const clearBtn = document.getElementById("clear-btn");
    const modifyBtn = document.getElementById("modify-btn");
    if (clearBtn) clearBtn.addEventListener("click", clearBtnClickHandler);
    if (modifyBtn) modifyBtn.addEventListener("click", modifyBtnClickHandler);
    console.log("Flick input enabled.");
}

Object.keys(flickData).forEach(base => {
    const btn = createAndAttachFlickBtn(base);
    if (base === "わ") {
        controlRow.insertBefore(btn, document.getElementById("clear-btn"));
    } else {
        flickGrid.appendChild(btn);
    }
});


const clearBtnClickHandler = () => {
    if (selectedInputMethod === "physical") {
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
        console.log("Backspace (physical): romajiBuffer:", romajiBuffer);
    } else { // flick mode
        answerEl.value = answerEl.value.slice(0, -1);
        console.log("Backspace (flick): answerEl:", answerEl.value);
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
    const next = chain[(idx + 1) % chain.length];
    answerEl.value = rest + next;
    console.log("Modify clicked. New answer:", answerEl.value);
};

// ===============================================
// === 初期処理とユーティリティ ===
// ===============================================
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
});