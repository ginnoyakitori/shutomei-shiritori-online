// public/client.js

const socket = io();

// UI要素の取得
const lobbySection = document.getElementById('lobby-section');
const gameRoomSection = document.getElementById('game-room-section');
const roomsContainer = document.getElementById('rooms-container');
const nicknameInput = document.getElementById('nicknameInput');
const roomNameInput = document.getElementById('roomNameInput');
const passwordInput = document.getElementById('passwordInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomIdInput = document.getElementById('joinRoomIdInput');
const joinPasswordInput = document.getElementById('joinPasswordInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');

const roomNameDisplay = document.getElementById('roomNameDisplay');
const hostDisplay = document.getElementById('hostDisplay');
const quizTypeDisplay = document.getElementById('quizTypeDisplay');
const playersList = document.getElementById('playersList');
const setReadyBtn = document.getElementById('setReadyBtn');
const cancelReadyBtn = document.getElementById('cancelReadyBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const selectKokumeiBtn = document.getElementById('selectKokumeiBtn');
const selectShutomeiBtn = document.getElementById('selectShutomeiBtn');
const startGameBtn = document.getElementById('startGameBtn');
// const toggleRoomVisibilityBtn = document.getElementById('toggleRoomVisibilityBtn'); // 削除

const gameSection = document.getElementById('game-section');
const questionNumberDisplay = document.getElementById('questionNumberDisplay');
const questionText = document.getElementById('questionText');
const timerDisplay = document.getElementById('timerDisplay');
const answerInput = document.getElementById('answerInput');
const submitAnswerBtn = document.getElementById('submitAnswerBtn');
const feedbackMessage = document.getElementById('feedbackMessage');
const returnToLobbyBtn = document.getElementById('returnToLobbyBtn');

// フリックキーボード要素
const flickKeyboard = document.getElementById('flick-keyboard');
const flickKeys = document.querySelectorAll('.flick-key');

// ゲーム開始時に非表示にする要素
const elementsToHideOnGameStart = [
    hostDisplay,
    quizTypeDisplay,
    document.getElementById('host-controls'), // ホスト操作全体
    document.getElementById('player-controls') // プレイヤー操作全体
];


let currentRoomId = null;
let isHost = false;
let isReady = false;
let flickTimeout = null;
let currentFlickKey = null;

// セクション表示/非表示ヘルパー
function showSection(sectionId) {
    lobbySection.style.display = 'none';
    gameRoomSection.style.display = 'none';
    gameSection.style.display = 'none'; // ゲームセクションも初期状態では非表示
    returnToLobbyBtn.style.display = 'none'; // 待機画面に戻るボタンも初期状態では非表示

    if (sectionId === 'lobby-section') {
        lobbySection.style.display = 'block';
    } else if (sectionId === 'game-room-section') {
        gameRoomSection.style.display = 'block';
    } else if (sectionId === 'game-section') {
        gameSection.style.display = 'block';
    }
}

// 初期表示
showSection('lobby-section');

// イベントリスナー
createRoomBtn.addEventListener('click', () => {
    const nickname = nicknameInput.value.trim();
    const roomName = roomNameInput.value.trim();
    const password = passwordInput.value.trim();
    if (nickname) {
        socket.emit('createRoom', { roomName, password, nickname });
    } else {
        alert('ニックネームを入力してください。');
    }
});

joinRoomBtn.addEventListener('click', () => {
    const roomId = joinRoomIdInput.value.trim();
    const password = joinPasswordInput.value.trim();
    const nickname = nicknameInput.value.trim();
    if (nickname && roomId) {
        socket.emit('joinRoom', { roomId, password, nickname });
    } else {
        alert('ニックネームとルームIDを入力してください。');
    }
});

setReadyBtn.addEventListener('click', () => {
    isReady = true;
    socket.emit('setReady', { roomId: currentRoomId, isReady: true });
    setReadyBtn.style.display = 'none';
    cancelReadyBtn.style.display = 'inline-block';
});

cancelReadyBtn.addEventListener('click', () => {
    isReady = false;
    socket.emit('setReady', { roomId: currentRoomId, isReady: false });
    setReadyBtn.style.display = 'inline-block';
    cancelReadyBtn.style.display = 'none';
});

leaveRoomBtn.addEventListener('click', () => {
    socket.emit('leaveRoom', currentRoomId); // サーバーに退出を通知
    currentRoomId = null;
    isHost = false;
    isReady = false;
    showSection('lobby-section'); // ロビー画面に戻る
    alert('部屋を退出しました。');
    // プレイヤーリストをクリア
    playersList.innerHTML = '';
    // ホストコントロールを非表示に
    document.getElementById('host-controls').style.display = 'none';
    // プレイヤーコントロールを表示に
    document.getElementById('player-controls').style.display = 'block';
});

selectKokumeiBtn.addEventListener('click', () => {
    socket.emit('selectQuizType', { roomId: currentRoomId, type: 'kokumei' });
});

selectShutomeiBtn.addEventListener('click', () => {
    socket.emit('selectQuizType', { roomId: currentRoomId, type: 'shutomei' });
});

startGameBtn.addEventListener('click', () => {
    socket.emit('startGame', currentRoomId);
});

submitAnswerBtn.addEventListener('click', () => {
    const answer = answerInput.value.trim();
    if (answer) {
        socket.emit('submitAnswer', currentRoomId, answer);
        answerInput.value = ''; // 解答欄をクリア
    }
});

returnToLobbyBtn.addEventListener('click', () => {
    socket.emit('returnToLobby', currentRoomId);
});

// フリックキーボードのイベントリスナー
flickKeys.forEach(key => {
    const mainChar = key.dataset.main;
    const flickChars = key.dataset.flick ? key.dataset.flick.split(',') : [];

    key.addEventListener('mousedown', (e) => {
        e.preventDefault(); // テキスト選択防止
        if (mainChar === '消') {
            answerInput.value = answerInput.value.slice(0, -1);
            return;
        }
        if (mainChar === '空白') {
            answerInput.value += ' ';
            return;
        }
        
        currentFlickKey = key;
        answerInput.value += mainChar;
        
        if (flickChars.length > 0) {
            // フリックガイドを表示 (CSSで制御)
            key.classList.add('flicking');
            flickTimeout = setTimeout(() => {
                key.classList.remove('flicking');
                flickTimeout = null;
            }, 500); // 500ms後にフリックガイドを非表示
        }
    });

    key.addEventListener('mousemove', (e) => {
        if (!currentFlickKey || !flickChars.length) return;

        const rect = currentFlickKey.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const dx = e.clientX - centerX;
        const dy = e.clientY - centerY;

        let selectedChar = mainChar;
        if (Math.abs(dx) > Math.abs(dy)) { // 左右フリック
            if (dx > 0 && flickChars[0]) selectedChar = flickChars[0]; // 右
            else if (dx < 0 && flickChars[1]) selectedChar = flickChars[1]; // 左
        } else { // 上下フリック
            if (dy < 0 && flickChars[2]) selectedChar = flickChars[2]; // 上
            else if (dy > 0 && flickChars[3]) selectedChar = flickChars[3]; // 下
        }
        // 特殊文字のフリック処理
        if (mainChar === 'ヤ' && dy < 0 && flickChars[0]) selectedChar = flickChars[0]; // ユ
        if (mainChar === 'ヤ' && dy > 0 && flickChars[1]) selectedChar = flickChars[1]; // ヨ
        if (mainChar === 'ー') {
            if (dy < 0 && flickChars[0]) selectedChar = flickChars[0]; // ー
            else if (dx > 0 && flickChars[1]) selectedChar = flickChars[1]; // ッ
            else if (dx < 0 && flickChars[2]) selectedChar = flickChars[2]; // ゃ
            else if (dy > 0 && flickChars[3]) selectedChar = flickChars[3]; // ゅ
            else if (flickChars[4]) selectedChar = flickChars[4]; // ょ (デフォルト)
        }
        if (mainChar === '濁') {
            if (dx > 0 && flickChars[0]) selectedChar = flickChars[0]; // 濁
            else if (dx < 0 && flickChars[1]) selectedChar = flickChars[1]; // 半濁
            else if (dy > 0 && flickChars[2]) selectedChar = flickChars[2]; // 小
        }


        // 現在の入力の最後の文字を置き換える
        answerInput.value = answerInput.value.slice(0, -1) + selectedChar;
    });

    key.addEventListener('mouseup', () => {
        if (flickTimeout) {
            clearTimeout(flickTimeout);
            flickTimeout = null;
        }
        if (currentFlickKey) {
            currentFlickKey.classList.remove('flicking');
            currentFlickKey = null;
        }
    });
});


// Socket.IOイベントハンドラ

socket.on('roomList', (roomsData) => {
    roomsContainer.innerHTML = ''; // 既存のリストをクリア
    if (roomsData.length === 0) {
        roomsContainer.innerHTML = '<p>部屋がありません。部屋を作成してください。</p>';
        return;
    }
    roomsData.forEach(room => {
        const roomDiv = document.createElement('div');
        roomDiv.classList.add('room-item');
        if (room.id === null) {
            roomDiv.innerHTML = `<p>空き部屋</p>`;
            roomDiv.classList.add('empty-room');
        } else {
            roomDiv.innerHTML = `
                <p>${room.name} (${room.id}) - ${room.playersCount}人</p>
                <button class="join-room-btn" data-room-id="${room.id}">入室</button>
            `;
            roomDiv.querySelector('.join-room-btn').addEventListener('click', (e) => {
                const roomId = e.target.dataset.roomId;
                joinRoomIdInput.value = roomId;
                // パスワード入力はユーザーに任せる
                // joinRoomBtn.click(); // 自動で参加させない
            });
        }
        roomsContainer.appendChild(roomDiv);
    });
});

socket.on('roomCreated', (roomId) => {
    currentRoomId = roomId;
    isHost = true;
    showSection('game-room-section');
    alert(`部屋 ${roomId} が作成されました。`);
    // ホストコントロールを表示
    document.getElementById('host-controls').style.display = 'block';
    // プレイヤーコントロールも表示（ホストもプレイヤーなので）
    document.getElementById('player-controls').style.display = 'block';
});

socket.on('roomJoined', (roomId) => {
    currentRoomId = roomId;
    isHost = false; // 参加者はホストではない
    showSection('game-room-section');
    alert(`部屋 ${roomId} に入室しました。`);
    // ホストコントロールを非表示に
    document.getElementById('host-controls').style.display = 'none';
    // プレイヤーコントロールを表示に
    document.getElementById('player-controls').style.display = 'block';
});

socket.on('roomError', (message) => {
    alert(`エラー: ${message}`);
});

socket.on('roomState', (room) => {
    roomNameDisplay.textContent = `部屋名: ${room.name} (ID: ${room.id})`;
    hostDisplay.textContent = `ホスト: ${room.players[room.hostId] ? room.players[room.hostId].name : '不明'}`;
    quizTypeDisplay.textContent = `クイズタイプ: ${room.quizType ? (room.quizType === 'kokumei' ? '国名' : '首都名') : '未選択'}`;

    playersList.innerHTML = '';
    room.players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.classList.add('player-item');
        playerDiv.textContent = `${player.name} (スコア: ${player.score})`;
        if (player.id === room.hostId) {
            playerDiv.textContent += ' [ホスト]';
        }
        if (player.ready) {
            playerDiv.textContent += ' [準備OK]';
        }
        playersList.appendChild(playerDiv);
    });

    // ホストの場合のみクイズタイプ選択とゲーム開始ボタンを表示
    if (isHost && room.status === 'waiting') {
        document.getElementById('host-controls').style.display = 'block';
        startGameBtn.disabled = !room.quizType; // クイズタイプが選択されていればゲーム開始可能
    } else {
        document.getElementById('host-controls').style.display = 'none';
    }

    // ゲーム終了後の状態表示
    if (room.status === 'finished') {
        returnToLobbyBtn.style.display = isHost ? 'block' : 'none'; // ホストのみ表示
        gameSection.style.display = 'none'; // ゲームセクションを非表示
        feedbackMessage.textContent = `ゲーム終了！正解は「${room.currentQuestion.a}」でした。`;
        if (room.correctAnswerer) {
             feedbackMessage.textContent += ` 最初に正解したのは ${room.players[room.correctAnswerer].name} (${room.correctAnswererTime}秒) でした！`;
        }
        // ゲーム終了時に非表示にした要素を再表示
        elementsToHideOnGameStart.forEach(element => {
            element.style.display = 'block';
        });
        // プレイヤーコントロールも表示に戻す
        document.getElementById('player-controls').style.display = 'block';
        setReadyBtn.style.display = 'inline-block';
        cancelReadyBtn.style.display = 'none';
    } else if (room.status === 'waiting') {
        gameSection.style.display = 'none';
        feedbackMessage.textContent = '';
        returnToLobbyBtn.style.display = 'none';
        // 待機中なので非表示にした要素を再表示
        elementsToHideOnGameStart.forEach(element => {
            element.style.display = 'block';
        });
        // プレイヤーコントロールも表示に戻す
        document.getElementById('player-controls').style.display = 'block';
        setReadyBtn.style.display = 'inline-block';
        cancelReadyBtn.style.display = 'none';
    }
});

socket.on('playerJoined', (player) => {
    // 参加者リストの更新はroomStateイベントでまとめて行われるため、ここではアラートのみ
    alert(`${player.name} が入室しました。`);
});

socket.on('playerLeft', (playerId, playerName) => {
    alert(`${playerName} が退出しました。`);
    // プレイヤーリストの更新はroomStateイベントでまとめて行われる
});

socket.on('newHost', (newHostId) => {
    if (socket.id === newHostId) {
        isHost = true;
        alert('あなたが新しいホストになりました！');
    } else {
        isHost = false;
    }
    // roomStateイベントでUIが更新される
});

socket.on('gameStarted', () => {
    showSection('game-room-section'); // ゲームルームセクションを表示
    gameSection.style.display = 'block'; // ゲームセクションを表示
    answerInput.value = '';
    feedbackMessage.textContent = '';
    timerDisplay.textContent = 'タイム: 0.00秒';
    
    // クイズ開始時に非表示にする要素
    elementsToHideOnGameStart.forEach(element => {
        element.style.display = 'none';
    });
    // 準備ボタンも非表示
    setReadyBtn.style.display = 'none';
    cancelReadyBtn.style.display = 'none';
    leaveRoomBtn.style.display = 'none'; // 退出ボタンも非表示
    returnToLobbyBtn.style.display = 'none'; // 待機画面に戻るボタンも非表示
});

socket.on('newQuestion', (data) => {
    questionNumberDisplay.textContent = data.questionNumber;
    questionText.textContent = data.text;
    answerInput.focus();
    feedbackMessage.textContent = '';
    timerDisplay.textContent = 'タイム: 0.00秒'; // 新しい問題でタイマーリセット
});

socket.on('correctAnswer', (data) => {
    feedbackMessage.textContent = `${data.correctAnswererName}さんが正解！答えは「${data.correctAnswer}」でした！ (${data.correctAnswererTime}秒)`;
    // 解答後、入力欄を無効化
    answerInput.value = data.correctAnswer; // 正解を表示
    returnToLobbyBtn.style.display = isHost ? 'block' : 'none'; // ホストのみ表示
});

socket.on('gameOver', (data) => {
    // feedbackMessageはcorrectAnswerで既に設定されている場合がある
    // ここではゲーム終了後の状態遷移を制御
    returnToLobbyBtn.style.display = isHost ? 'block' : 'none'; // ホストのみ表示
    // ゲーム終了時に非表示にした要素を再表示
    elementsToHideOnGameStart.forEach(element => {
        element.style.display = 'block';
    });
    // プレイヤーコントロールも表示に戻す
    document.getElementById('player-controls').style.display = 'block';
    setReadyBtn.style.display = 'inline-block';
    cancelReadyBtn.style.display = 'none';
    leaveRoomBtn.style.display = 'inline-block'; // 退出ボタンを再表示
});

socket.on('feedback', (message) => {
    feedbackMessage.textContent = message;
});

socket.on('disconnect', () => {
    alert('サーバーとの接続が切れました。ページをリロードしてください。');
});

socket.on('error', (message) => {
    alert('エラー：' + message);
});