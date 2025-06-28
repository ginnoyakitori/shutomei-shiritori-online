// public/client.js

const socket = io();

// ===== DOM要素の取得 =====
const lobbySection = document.getElementById('lobby-section');
const gameRoomSection = document.getElementById('game-room-section');
const gameOverSection = document.getElementById('game-over-section');

const roomListEl = document.getElementById('room-list');
const nicknameInput = document.getElementById('nickname-input');
const createRoomNameInput = document.getElementById('create-room-name-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomIdInput = document.getElementById('join-room-id-input');
const joinRoomBtn = document.getElementById('join-room-btn');

const roomNameDisplay = document.getElementById('room-name-display');
const currentRoomIdSpan = document.getElementById('current-room-id-span');
const hostNameSpan = document.getElementById('host-name');
const quizTypeDisplay = document.getElementById('quiz-type-display');
const playerListEl = document.getElementById('player-list');
const hostControls = document.getElementById('host-controls');
const selectKokumeiBtn = document.getElementById('select-kokumei-btn');
const selectShutomeiBtn = document.getElementById('select-shutomei-btn');
const toggleVisibilityBtn = document.getElementById('toggle-visibility-btn');
const startGameBtn = document.getElementById('start-game-btn');
const readyBtn = document.getElementById('ready-btn');
const unreadyBtn = document.getElementById('unready-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

const gameArea = document.getElementById('game-area');
const questionNumberDisplay = document.getElementById('question-number-display');
const questionText = document.getElementById('question-text');
const answerEl = document.getElementById('answer-input'); // フリックキーボードから入力される要素
const submitAnswerBtn = document.getElementById('submit-answer-btn');
const correctAnswerInfo = document.getElementById('correct-answer-info');

const finalScoresDiv = document.getElementById('final-scores');
const returnToLobbyBtn = document.getElementById('return-to-lobby-btn');

// ===== グローバル変数 =====
let currentRoomId = null;
let myPlayerId = null; // 自分のsocket.idを保持する
let currentRoomState = null; // 現在の部屋の状態を保持

// ===== 画面切り替え関数 =====
function showSection(sectionId) {
    const sections = [lobbySection, gameRoomSection, gameOverSection];
    sections.forEach(section => {
        section.classList.add('hidden-section');
        section.classList.remove('active-section');
    });
    document.getElementById(sectionId).classList.remove('hidden-section');
    document.getElementById(sectionId).classList.add('active-section');

    // 画面が切り替わったときに、特定の要素を初期状態に戻す
    if (sectionId === 'game-room-section') {
        // ゲームルームに入った時にゲームエリアは非表示にする
        gameArea.classList.add('hidden');
        // ゲーム終了画面から戻った場合のために隠す
        gameOverSection.classList.add('hidden-section');
    } else if (sectionId === 'lobby-section') {
        // ロビーに戻った時にゲームルーム関連の要素も隠す
        gameRoomSection.classList.add('hidden-section');
    }
}

// ===== 初期化処理 =====
// Socket.IO接続確立後、部屋リストをリクエスト
socket.on('connect', () => {
    myPlayerId = socket.id; // 自分のSocket IDを保存
    console.log('サーバーに接続しました。自分のID:', myPlayerId);
    socket.emit('requestRoomList'); // 接続したら部屋リストを要求
    showSection('lobby-section'); // 初期表示はロビー画面
});

// ===== Socket.IOイベントリスナー =====

socket.on('disconnect', () => {
    alert('サーバーとの接続が切れました。ページを再読み込みしてください。');
    // 必要に応じてページをリロード
    // location.reload();
});

socket.on('error', (message) => {
    alert('エラー： ' + message);
    console.error('サーバーエラー:', message);
});

// 部屋リストを受信
socket.on('roomList', (rooms) => {
    console.log('--- roomList イベントを受信しました ---');
    console.log('受信した部屋リスト:', rooms);
    roomListEl.innerHTML = ''; // 既存のリストをクリア

    if (rooms.length === 0) {
        roomListEl.innerHTML = '<p>部屋がありません。部屋を作成してください。</p>';
        return;
    }

    rooms.forEach(room => {
        if (room.isVisible) { // 表示設定されている部屋のみ表示
            const roomItem = document.createElement('div');
            roomItem.className = 'room-item';
            roomItem.innerHTML = `
                <span>${room.name} (${room.id}) - ${room.playersCount}/4人 - 状態: ${room.status === 'waiting' ? '待機中' : 'ゲーム中'}</span>
                <button class="join-room-button" data-room-id="${room.id}" ${room.status !== 'waiting' || room.playersCount >= 4 ? 'disabled' : ''}>参加</button>
            `;
            roomListEl.appendChild(roomItem);
        }
    });

    // 参加ボタンにイベントリスナーを設定 (部屋リストが更新されるたびに再設定が必要)
    document.querySelectorAll('.join-room-button').forEach(button => {
        button.onclick = (e) => {
            const roomId = e.target.dataset.roomId;
            const nickname = nicknameInput.value.trim();
            if (nickname) {
                socket.emit('joinRoom', { roomId, nickname });
            } else {
                alert('ニックネームを入力してください。');
            }
        };
    });
});

// 部屋が作成されたことを通知
socket.on('roomCreated', (roomId) => {
    currentRoomId = roomId;
    currentRoomIdSpan.textContent = roomId;
    showSection('game-room-section');
    alert(`部屋 ${roomId} が作成されました。`);
    // 部屋リスト更新のため、サーバーにリクエストを送信
    socket.emit('requestRoomList');
});

// 部屋に参加したことを通知
socket.on('roomJoined', (roomId) => {
    currentRoomId = roomId;
    currentRoomIdSpan.textContent = roomId;
    showSection('game-room-section');
    console.log(`部屋 ${roomId} に参加しました。`);
});

// 部屋の状態が更新された
socket.on('roomState', (roomState) => {
    console.log('--- roomState イベントを受信しました ---');
    console.log('受信した部屋の状態:', roomState);
    currentRoomState = roomState; // 最新の部屋の状態を保存

    if (!currentRoomId || currentRoomId !== roomState.id) {
        // 自分がいる部屋の情報ではない、または部屋IDが設定されていない場合はスキップ
        return;
    }

    // 部屋に入った時に必ずgame-room-sectionを表示
    // （showSection('game-room-section')はroomCreated/roomJoinedで行われるが、念のため）
    showSection('game-room-section');


    // UIの更新 (部屋の共通情報)
    currentRoomIdSpan.textContent = roomState.id;
    roomNameDisplay.textContent = `部屋名: ${roomState.name}`; // 部屋名も表示
    hostNameSpan.textContent = roomState.players[roomState.hostId]?.name || '不明';
    quizTypeDisplay.textContent = roomState.quizType === 'kokumei' ? '国名' : (roomState.quizType === 'shutomei' ? '首都名' : '未選択');

    // プレイヤーリストの更新
    playerListEl.innerHTML = '';
    Object.values(roomState.players).forEach(player => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        if (player.isHost) playerItem.classList.add('host');
        if (player.ready) playerItem.classList.add('ready');
        playerItem.textContent = `${player.name} (スコア: ${player.score}) ${player.isHost ? '[ホスト]' : ''} ${player.ready ? '[準備OK]' : ''}`;
        playerListEl.appendChild(playerItem);
    });

    // ===== 部屋のステータスに応じたUI制御 =====

    // 1. 待機中 (waiting) の場合
    if (roomState.status === 'waiting') {
        hostControls.classList.remove('hidden'); // ホストコントロールを一度表示（後に非ホストなら隠す）
        // 準備ボタンを表示
        readyBtn.classList.remove('hidden');
        unreadyBtn.classList.add('hidden'); // 初期状態では解除ボタンは隠す

        const myPlayer = roomState.players[myPlayerId];
        if (myPlayer) {
            // 自分の準備状態によってボタンを切り替え
            if (myPlayer.ready) {
                readyBtn.classList.add('hidden');
                unreadyBtn.classList.remove('hidden');
            } else {
                readyBtn.classList.remove('hidden');
                unreadyBtn.classList.add('hidden');
            }

            // ホストの場合のみホストコントロールを表示
            if (roomState.hostId === myPlayerId) {
                hostControls.classList.remove('hidden');
                const allPlayersReady = Object.values(roomState.players).every(p => p.ready);
                startGameBtn.disabled = !allPlayersReady || !roomState.quizType;
            } else {
                hostControls.classList.add('hidden'); // ホストでなければ隠す
            }
        } else { // 部屋にいない場合（ありえないが念のため）
             hostControls.classList.add('hidden');
             readyBtn.classList.add('hidden');
             unreadyBtn.classList.add('hidden');
        }

        gameArea.classList.add('hidden'); // ゲームエリアは隠す
        gameOverSection.classList.add('hidden-section'); // ゲーム終了画面は隠す
    }
    // 2. プレイ中 (playing) の場合
    else if (roomState.status === 'playing') {
        hostControls.classList.add('hidden'); // ホストコントロールは隠す
        readyBtn.classList.add('hidden'); // 準備ボタンは隠す
        unreadyBtn.classList.add('hidden'); // 準備解除ボタンは隠す
        gameArea.classList.remove('hidden'); // ゲームエリアを表示
        gameOverSection.classList.add('hidden-section'); // ゲーム終了画面は隠す
        submitAnswerBtn.disabled = false; // 解答ボタンを有効化 (ゲーム開始時も)
        answerEl.value = ''; // 解答欄をクリア
        correctAnswerInfo.textContent = ''; // 正解情報をクリア
    }
    // 3. 終了 (finished) の場合
    else if (roomState.status === 'finished') {
        hostControls.classList.add('hidden'); // ホストコントロールは隠す
        readyBtn.classList.add('hidden'); // 準備ボタンは隠す
        unreadyBtn.classList.add('hidden'); // 準備解除ボタンは隠す
        gameArea.classList.add('hidden'); // ゲームエリアは隠す
        showSection('game-over-section'); // ゲーム終了画面を表示

        finalScoresDiv.innerHTML = '<h4>最終スコア</h4>';
        const sortedPlayers = Object.values(roomState.players).sort((a, b) => b.score - a.score);
        sortedPlayers.forEach(player => {
            const scoreItem = document.createElement('div');
            scoreItem.className = 'score-item';
            scoreItem.textContent = `${player.name}: ${player.score}点`;
            finalScoresDiv.appendChild(scoreItem);
        });

        // ホストのみ「ロビーに戻る」ボタンを表示
        if (roomState.hostId === myPlayerId) {
            returnToLobbyBtn.classList.remove('hidden');
        } else {
            returnToLobbyBtn.classList.add('hidden');
        }
    }
});

// ゲーム開始イベント
socket.on('gameStarted', () => {
    console.log('ゲームが開始されました！');
    showSection('game-room-section'); // ゲームルーム画面を表示
    gameArea.classList.remove('hidden');
});

// 新しい問題が来た
socket.on('newQuestion', ({ text, questionNumber }) => {
    console.log(`新しい問題: ${questionNumber}. ${text}`);
    questionNumberDisplay.textContent = questionNumber;
    questionText.textContent = text;
    answerEl.value = ''; // 解答欄をクリア
    submitAnswerBtn.disabled = false; // 解答ボタンを有効化
    correctAnswerInfo.textContent = ''; // 正解情報をクリア
});

// 正解者が出た
socket.on('correctAnswer', ({ playerId, score, timeTaken }) => {
    const playerName = currentRoomState.players[playerId]?.name || '不明なプレイヤー';
    correctAnswerInfo.textContent = `${playerName} が正解しました！ (${timeTaken.toFixed(2)}秒)`;
    submitAnswerBtn.disabled = true; // 正解が出たら解答ボタンを無効化
    answerEl.value = ''; // 解答欄をクリアしておく
    console.log(`正解者: ${playerName}, スコア: ${score}, タイム: ${timeTaken.toFixed(2)}秒`);

    // 必要に応じてプレイヤーリストのスコアを更新（roomStateイベントで更新されるが、即時反映のため）
    if (currentRoomState && currentRoomState.players[playerId]) {
        currentRoomState.players[playerId].score = score;
        // playerListElの更新をトリガーするか、ここでもDOMを直接操作する
        // 現状、roomStateイベントが送られてくるので、そちらでUIは更新されるはず
    }
});

// ゲーム終了イベント
socket.on('gameOver', ({ correctAnswererId, correctAnswererName, correctAnswererTime, correctAnswer }) => {
    console.log('ゲーム終了イベントを受信しました。');
    // 最終問題の情報を表示（必要であれば）
    if (correctAnswererName) {
        correctAnswerInfo.textContent = `最終問題の正解は「${correctAnswer}」。正解者: ${correctAnswererName} (${correctAnswererTime.toFixed(2)}秒)`;
    } else {
        correctAnswerInfo.textContent = `最終問題の正解は「${correctAnswer}」。正解者はいませんでした。`;
    }
    submitAnswerBtn.disabled = true; // ゲーム終了後は解答できないように
    gameArea.classList.add('hidden'); // ゲームエリアを非表示に
    // finalScoresDiv の更新は roomState イベントで行われる
});

// プレイヤーが部屋を退出した
socket.on('playerLeft', (playerId, playerName) => {
    console.log(`${playerName} (${playerId}) が部屋を退出しました。`);
    // roomState イベントが続くので、それでプレイヤーリストは更新される
    alert(`${playerName}さんが部屋を退出しました。`);
});

// 新しいホストが割り当てられた
socket.on('newHost', (newHostId) => {
    if (newHostId === myPlayerId) {
        alert('あなたが新しいホストになりました！');
    }
    // roomState イベントが続くので、それでUIは更新される
});


// ===== イベントリスナーの設定 =====

// ロビー画面
createRoomBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();
    const roomName = createRoomNameInput.value.trim() || `${nickname}の部屋`; // 部屋名がなければニックネームから生成
    if (nickname) {
        socket.emit('createRoom', { roomName, nickname });
    } else {
        alert('ニックネームを入力してください。');
    }
});

// joinRoomBtnのイベントリスナーは、roomListイベント内で動的に設定される参加ボタンとは別
joinRoomBtn.addEventListener('click', () => {
    const roomId = joinRoomIdInput.value.trim();
    const nickname = nicknameInput.value.trim();
    if (roomId && nickname) {
        socket.emit('joinRoom', { roomId, nickname });
    } else {
        alert('部屋IDとニックネームを入力してください。');
    }
});


// ゲームルーム画面
readyBtn.addEventListener('click', () => {
    if (currentRoomId) socket.emit('setReady', { roomId: currentRoomId, isReady: true });
});

unreadyBtn.addEventListener('click', () => {
    if (currentRoomId) socket.emit('setReady', { roomId: currentRoomId, isReady: false });
});

selectKokumeiBtn.addEventListener('click', () => {
    if (currentRoomId) socket.emit('selectQuizType', { roomId: currentRoomId, type: 'kokumei' });
});

selectShutomeiBtn.addEventListener('click', () => {
    if (currentRoomId) socket.emit('selectQuizType', { roomId: currentRoomId, type: 'shutomei' });
});

toggleVisibilityBtn.addEventListener('click', () => {
    if (currentRoomId) socket.emit('toggleRoomVisibility', currentRoomId);
});

startGameBtn.addEventListener('click', () => {
    if (currentRoomId) socket.emit('startGame', currentRoomId);
});

leaveRoomBtn.addEventListener('click', () => {
    if (currentRoomId) {
        socket.emit('leaveRoom', currentRoomId);
        currentRoomId = null; // 部屋IDをリセット
        showSection('lobby-section'); // ロビー画面に戻る
    }
});

submitAnswerBtn.addEventListener('click', () => {
    if (currentRoomId && answerEl.value.trim()) {
        socket.emit('submitAnswer', currentRoomId, answerEl.value.trim());
    }
});

returnToLobbyBtn.addEventListener('click', () => {
    if (currentRoomId) {
        socket.emit('returnToLobby', currentRoomId);
    }
    // サーバーからのroomStateイベントでUIが自動的に切り替わることを期待
});


// ===== フリックキーボード処理 =====
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

const flickGrid = document.getElementById("flick-grid"); // idをflick-gridに統一

function createFlickBtn(base) { // 関数名を変更 (createBtnだと他の要素と紛らわしい)
    const [up, right, down, left, center] = flickData[base];
    const btn = document.createElement("button");
    btn.className = "flick-btn";
    btn.dataset.base = base;
    btn.innerHTML = `
        <span class="hint top">${up || ''}</span>
        <span class="hint right">${right || ''}</span>
        <span class="hint bottom">${down || ''}</span>
        <span class="hint left">${left || ''}</span>
        <span class="center">${center}</span>
    `;
    btn.addEventListener("touchstart", e => {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
    });
    btn.addEventListener("touchend", e => {
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const th = 30; // しきい値
        let dir = 4; // 4は中央（フリックなし）

        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > th) dir = 1; // 右
            else if (dx < -th) dir = 3; // 左
        } else {
            if (dy > th) dir = 2; // 下
            else if (dy < -th) dir = 0; // 上
        }
        const kana = flickData[base][dir];
        if (kana) answerEl.value += kana;
    });
    btn.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
    return btn;
}

// 「わ」行以外のフリックボタンを生成
Object.keys(flickData).forEach(base => {
    if (base !== "わ") { // 「わ」はHTMLに直接記述されている、または個別に処理するため除外
        flickGrid.appendChild(createFlickBtn(base));
    }
});

// 「わ」行ボタンのイベントリスナーはHTMLに直接記述した要素に対して別途設定
// HTMLに直接書かれた「わ」ボタンを取得してイベントリスナーを追加
const waBtn = document.querySelector('.flick-btn[data-base="わ"]'); // data-base属性で取得
if (waBtn) { // 要素が存在することを確認
    waBtn.addEventListener("touchstart", e => {
        const t = e.touches[0];
        startX = t.clientX;
        startY = t.clientY;
    });
    waBtn.addEventListener("touchend", e => {
        const t = e.changedTouches[0];
        const dx = t.clientX - startX;
        const dy = t.clientY - startY;
        const th = 30;
        let dir = 4;
        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > th) dir = 1;
            else if (dx < -th) dir = 3;
        } else {
            if (dy > th) dir = 2;
            else if (dy < -th) dir = 0;
        }
        const kana = flickData["わ"][dir];
        if (kana) answerEl.value += kana;
    });
    waBtn.addEventListener("touchmove", e => e.preventDefault(), { passive: false });
}

document.getElementById("clear-btn").addEventListener("click", () => {
    answerEl.value = answerEl.value.slice(0, -1);
});

document.getElementById("modify-btn").addEventListener("click", () => {
    const val = answerEl.value;
    if (!val) return;
    const last = val.slice(-1);
    const rest = val.slice(0, -1);
    // transformChainMapに直接存在するか、値として存在するかをチェック
    const chain = transformChainMap[last] || Object.entries(transformChainMap).find(([, arr]) => arr.includes(last))?.[1];
    if (!chain) return;
    const idx = chain.indexOf(last);
    const next = chain[(idx + 1) % chain.length];
    answerEl.value = rest + next;
});

// 解答入力欄への直接入力を防止
answerEl.addEventListener("keydown", e => e.preventDefault());
answerEl.addEventListener("beforeinput", e => e.preventDefault());