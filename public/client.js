// public/client.js

// --- DOM要素の取得 ---
const playerNameInput = document.getElementById('player-name-input');
const setNameBtn = document.getElementById('set-name-btn');
const myNameDisplay = document.getElementById('my-name-display');

const loginSection = document.getElementById('login-section');
const roomListSection = document.getElementById('room-list-section');
const gameRoomSection = document.getElementById('game-room-section');

const createRoomBtn = document.getElementById('create-room-btn');
const roomsContainer = document.getElementById('rooms-container');

const currentRoomIdSpan = document.getElementById('current-room-id');
const hostNameSpan = document.getElementById('host-name');
const playersList = document.getElementById('players-list');
const setReadyBtn = document.getElementById('set-ready-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

const gameArea = document.getElementById('game-area');
const questionNumberSpan = document.getElementById('question-number');
const totalQuestionsSpan = document.getElementById('total-questions');
const questionText = document.getElementById('question-text');
const answerInput = document.getElementById('answer-input');
const submitAnswerBtn = document.getElementById('submit-answer-btn');
const answerResult = document.getElementById('answer-result');

const gameOverArea = document.getElementById('game-over-area');
const finalResults = document.getElementById('final-results');
const backToRoomsBtn = document.getElementById('back-to-rooms-btn');

// --- グローバル変数 ---
let socket; // Socket.IO クライアント
let myName = "名無しさん";
let currentRoomId = null;
let isReady = false;

// --- UI表示切り替え関数 ---
function showSection(sectionId) {
    loginSection.style.display = 'none';
    roomListSection.style.display = 'none';
    gameRoomSection.style.display = 'none';
    gameArea.style.display = 'none';
    gameOverArea.style.display = 'none';

    document.getElementById(sectionId).style.display = 'block';
}

// --- イベントリスナー ---
setNameBtn.addEventListener('click', () => {
    myName = playerNameInput.value.trim();
    if (myName) {
        myNameDisplay.textContent = `あなたの名前: ${myName}`;
        showSection('room-list-section');
        // ここでSocket.IO接続を開始
        // Renderにデプロイ後は、render.comから与えられるURLに書き換える
        socket = io(window.location.origin);
        setupSocketListeners();
    }
});

createRoomBtn.addEventListener('click', () => {
    if (!socket) return;
    socket.emit('createRoom', myName);
});

setReadyBtn.addEventListener('click', () => {
    if (!socket || !currentRoomId) return;
    isReady = !isReady;
    socket.emit('setReady', currentRoomId, isReady);
    setReadyBtn.textContent = isReady ? '準備完了 (クリックでキャンセル)' : '準備完了';
    setReadyBtn.style.backgroundColor = isReady ? 'orange' : '#007bff';
});

submitAnswerBtn.addEventListener('click', () => {
    if (!socket || !currentRoomId) return;
    const answer = answerInput.value.trim();
    if (answer) {
        socket.emit('submitAnswer', currentRoomId, answer);
        answerInput.value = ''; // 入力欄をクリア
        submitAnswerBtn.disabled = true; // 連打防止
    }
});

leaveRoomBtn.addEventListener('click', () => {
    if (!socket || !currentRoomId) return;
    socket.emit('leaveRoom', currentRoomId);
    currentRoomId = null;
    isReady = false;
    setReadyBtn.textContent = '準備完了';
    setReadyBtn.style.backgroundColor = '#007bff';
    showSection('room-list-section');
});

backToRoomsBtn.addEventListener('click', () => {
    showSection('room-list-section');
});

// --- Socket.IO イベントリスナーの設定 ---
function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('サーバーに接続しました:', socket.id);
    });

    socket.on('disconnect', () => {
        console.log('サーバーから切断されました');
        alert('サーバーとの接続が切れました。ページをリロードしてください。');
    });

    socket.on('error', (message) => {
        alert('エラー: ' + message);
    });

    socket.on('roomCreated', (roomId) => {
        console.log(`部屋が作成されました: ${roomId}`);
        currentRoomId = roomId;
        currentRoomIdSpan.textContent = roomId;
        showSection('game-room-section');
        alert(`部屋 ${roomId} が作成されました。`);
    });

    socket.on('updateRoomList', (roomsData) => {
        roomsContainer.innerHTML = '';
        for (const id in roomsData) {
            const room = roomsData[id];
            const roomDiv = document.createElement('div');
            roomDiv.innerHTML = `
                <strong>${id}</strong> (${room.status}) - ${Object.keys(room.players).length}人 / ${room.hostId === socket.id ? 'あなた' : room.players[room.hostId]?.name || '不明'}がホスト
                ${room.status === 'waiting' ? `<button class="join-room-btn" data-room-id="${id}">参加</button>` : ''}
            `;
            roomsContainer.appendChild(roomDiv);
        }
        document.querySelectorAll('.join-room-btn').forEach(button => {
            button.onclick = (e) => {
                const roomId = e.target.dataset.roomId;
                socket.emit('joinRoom', roomId, myName);
            };
        });
    });

    socket.on('joinedRoom', (roomId, roomData) => {
        console.log(`部屋 ${roomId} に参加しました`, roomData);
        currentRoomId = roomId;
        currentRoomIdSpan.textContent = roomId;
        updateRoomDisplay(roomData);
        showSection('game-room-section');
    });

    socket.on('playerJoined', (playerId, playerInfo) => {
        console.log(`プレイヤー ${playerInfo.name} が参加しました`);
        // サーバーから最新の部屋情報が送られてくるはずなので、それを使って更新
    });

    socket.on('playerRemoved', (playerId) => {
        console.log(`プレイヤー ${playerId} が退室しました`);
        // サーバーから最新の部屋情報が送られてくるはずなので、それを使って更新
    });

    socket.on('hostChanged', (newHostId) => {
        alert(`ホストが ${newHostId === socket.id ? 'あなた' : newHostId} になりました。`);
        // ホスト名表示を更新
    });

    socket.on('playerReadyStatus', (playerId, readyStatus) => {
        const playerElement = document.getElementById(`player-${playerId}`);
        if (playerElement) {
            playerElement.classList.toggle('player-ready', readyStatus);
            playerElement.classList.toggle('player-not-ready', !readyStatus);
            // テキストも更新するなど
        }
        // 部屋の状態更新（プレイヤーリストなど）
        socket.emit('getRoomInfo', currentRoomId); // サーバーに部屋情報の更新を要求しても良い
    });

    socket.on('gameStarting', () => {
        alert('ゲームが開始されます！');
        gameArea.style.display = 'block';
        gameOverArea.style.display = 'none';
        answerResult.textContent = '';
        answerInput.focus();
    });

    socket.on('newQuestion', (questionData) => {
        questionNumberSpan.textContent = questionData.questionNumber;
        // totalQuestionsSpan.textContent = ... // サーバーから総問題数も送ってもらう
        questionText.textContent = questionData.text;
        answerInput.value = '';
        answerResult.textContent = '';
        submitAnswerBtn.disabled = false;
        answerInput.focus();
    });

    socket.on('correctAnswer', (solverId, score) => {
        const solverName = roomsContainer.querySelector(`.player-name[data-player-id="${solverId}"]`)?.textContent || solverId;
        answerResult.innerHTML = `<span class="correct">${solverName} が正解しました！ スコア: ${score}</span>`;
        submitAnswerBtn.disabled = true; // 他のプレイヤーは解答終了
    });

    socket.on('gameOverQuestion', (correctAnswer) => {
        answerResult.innerHTML += `<br>正解は「${correctAnswer}」でした！`;
        // 次の質問に移るまでの間、正解を表示
    });

    socket.on('gameFinished', (finalRoomData) => {
        gameArea.style.display = 'none';
        gameOverArea.style.display = 'block';
        let resultsHtml = '<h4>最終スコア:</h4>';
        const sortedPlayers = Object.values(finalRoomData.players).sort((a, b) => b.score - a.score);
        sortedPlayers.forEach(player => {
            resultsHtml += `<p>${player.name}: ${player.score}点</p>`;
        });
        finalResults.innerHTML = resultsHtml;
        // 部屋の状態を「finished」として部屋リストを更新
        io.emit('updateRoomList', rooms); // これはサーバー側でemitされるべき
    });

    // 部屋情報が更新されたらUIを更新する汎用関数 (サーバーから定期的に送るか、特定のイベントで送る)
    socket.on('updateRoomInfo', (roomData) => {
        if (roomData.id === currentRoomId) {
            updateRoomDisplay(roomData);
        }
    });
}

// 部屋情報を元にプレイヤーリストなどを更新する関数
function updateRoomDisplay(roomData) {
    playersList.innerHTML = '';
    hostNameSpan.textContent = roomData.players[roomData.hostId]?.name || roomData.hostId;
    totalQuestionsSpan.textContent = roomData.totalQuestions; // サーバーから総問題数を渡す
    for (const playerId in roomData.players) {
        const player = roomData.players[playerId];
        const li = document.createElement('li');
        li.id = `player-${playerId}`;
        li.classList.add(player.isReady ? 'player-ready' : 'player-not-ready');
        li.innerHTML = `<span class="player-name" data-player-id="${playerId}">${player.name}</span>: ${player.score}点 (${player.isReady ? '準備OK' : '未準備'})`;
        playersList.appendChild(li);
    }
    // ホストが自分なら準備ボタンを表示
    setReadyBtn.style.display = (socket.id in roomData.players) ? 'inline-block' : 'none'; // 自分が参加者なら
    // 部屋のステータスに基づいてUIを調整
    if (roomData.status === 'playing') {
        gameArea.style.display = 'block';
    } else if (roomData.status === 'finished') {
        gameOverArea.style.display = 'block';
    }
}

// 初期表示
showSection('login-section');