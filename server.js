// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid'); // ユニークなID生成用

const app = express();
const server = http.createServer(app);
// CORS設定: どこからの接続も許可 (開発用。本番では特定のオリジンに制限することを推奨)
const io = socketIo(server, {
    cors: {
        origin: "*", // すべてのオリジンからの接続を許可
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000; // RenderがPORT環境変数を提供

// publicディレクトリを静的ファイルとして提供
app.use(express.static('public'));

// ゲームの状態を保持するオブジェクト
// 例:
// {
//   "roomId123": {
//     id: "roomId123",
//     name: "Room A",
//     password: "pass", // パスワードなしの場合はnull
//     status: "waiting", // "waiting", "playing", "finished"
//     hostId: "socketId1",
//     quizType: "kokumei", // "kokumei" or "shutomei"
//     players: {
//       "socketId1": { name: "Player1", score: 0, ready: false, isHost: true },
//       "socketId2": { name: "Player2", score: 0, ready: false, isHost: false }
//     },
//     currentQuestion: { text: "日本の首都は？", answer: "東京" },
//     correctAnswerer: null, // 最初に正解したプレイヤーのsocketId
//     correctAnswererTime: null, // 正解者のタイム
//     questionCount: 0, // 何問目か
//     totalQuestions: 1, // 早押しクイズなので1問
//     quizzes: [], // 出題するクイズのリスト
//     timerId: null // タイマーID
//   }
// }
const rooms = {};
const MAX_ROOMS_DISPLAY = 10; // 常に表示する部屋数 (実際の最大部屋数ではない)
const MAX_PLAYERS_PER_ROOM = 8; // 各部屋の最大参加人数

// ダミーのクイズ問題（実際にはファイルから読み込むなど）
// クライアントから要求に応じて提供するため、サーバー側に保持
const quizData = {
    kokumei: [
        { q: "アメリカ合衆国の首都は？", a: "ワシントンD.C." },
        { q: "日本の首都は？", a: "東京" },
        { q: "中国の首都は？", a: "北京" },
        { q: "イギリスの首都は？", a: "ロンドン" },
        { q: "フランスの首都は？", a: "パリ" },
        { q: "イタリアの首都は？", a: "ローマ" },
        { q: "ドイツの首都は？", a: "ベルリン" },
        { q: "ロシアの首都は？", a: "モスクワ" },
        { q: "カナダの首都は？", a: "オタワ" },
        { q: "オーストラリアの首都は？", a: "キャンベラ" },
        { q: "ブラジルの首都は？", a: "ブラジリア" },
        { q: "インドの首都は？", a: "ニューデリー" },
        { q: "エジプトの首都は？", a: "カイロ" },
        { q: "南アフリカ共和国の首都は？", a: "プレトリア" },
        { q: "メキシコの首都は？", a: "メキシコシティ" }
    ],
    shutomei: [
        { q: "東京はどこの国の首都？", a: "日本" },
        { q: "ワシントンD.C.はどこの国の首都？", a: "アメリカ合衆国" },
        { q: "北京はどこの国の首都？", a: "中国" },
        { q: "ロンドンはどこの国の首都？", a: "イギリス" },
        { q: "パリはどこの国の首都？", a: "フランス" },
        { q: "ローマはどこの国の首都？", a: "イタリア" },
        { q: "ベルリンはどこの国の首都？", a: "ドイツ" },
        { q: "モスクワはどこの国の首都？", a: "ロシア" },
        { q: "オタワはどこの国の首都？", a: "カナダ" },
        { q: "キャンベラはどこの国の首都？", a: "オーストラリア" },
        { q: "ブラジリアはどこの国の首都？", a: "ブラジル" },
        { q: "ニューデリーはどこの国の首都？", a: "インド" },
        { q: "カイロはどこの国の首都？", a: "エジプト" },
        { q: "プレトリアはどこの国の首都？", a: "南アフリカ共和国" },
        { q: "メキシコシティはどこの国の首都？", a: "メキシコ" }
    ]
};


// 部屋の状態をクライアントに送信するヘルパー関数
function emitRoomList() {
    const roomList = Object.values(rooms).map(room => ({
        id: room.id,
        name: room.name,
        playersCount: Object.keys(room.players).length,
        maxPlayers: MAX_PLAYERS_PER_ROOM,
        status: room.status,
        hasPassword: room.password !== null,
        quizType: room.quizType
    }));

    // MAX_ROOMS_DISPLAYまで空の部屋情報も追加して常に10部屋表示
    const paddedRoomList = [...roomList];
    while (paddedRoomList.length < MAX_ROOMS_DISPLAY) {
        paddedRoomList.push({ id: null, name: "空き部屋", playersCount: 0, maxPlayers: MAX_PLAYERS_PER_ROOM, status: "empty", hasPassword: false, quizType: null });
    }

    io.emit('roomList', paddedRoomList.slice(0, MAX_ROOMS_DISPLAY));
}

// 部屋の状態（プレイヤーリストなど）を特定の部屋に送信する
function emitRoomState(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    io.to(roomId).emit('roomState', {
        id: room.id,
        name: room.name,
        players: Object.values(room.players),
        status: room.status,
        hostId: room.hostId,
        quizType: room.quizType,
        currentQuestion: room.currentQuestion,
        correctAnswerer: room.correctAnswerer,
        correctAnswererTime: room.correctAnswererTime,
        correctAnswer: room.currentQuestion ? room.currentQuestion.a : null // 最終問題の正解 (結果表示用)
    });
}

// クイズ問題のシャッフル
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// 次の質問を送信（早押しなので1問のみ）
function sendQuestion(roomId) {
    const room = rooms[roomId];
    if (!room || room.status !== 'playing' || room.questionCount >= room.totalQuestions) {
        endGame(roomId);
        return;
    }

    room.questionCount++;
    room.currentQuestion = room.quizzes[room.questionCount - 1];
    room.correctAnswerer = null; // 正解者をリセット
    room.correctAnswererTime = null; // 正解者のタイムをリセット

    io.to(roomId).emit('newQuestion', {
        text: room.currentQuestion.q,
        questionNumber: room.questionCount
    });
    console.log(`部屋 ${roomId} に問題 ${room.questionCount} を出題: ${room.currentQuestion.q}`);
    
    // 問題出題時刻を記録
    room.questionStartTime = Date.now();
}

// ゲーム終了処理
function endGame(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    room.status = 'finished';
    
    // 全員にゲーム終了を通知し、結果（正解者とタイム）を送信
    io.to(roomId).emit('gameOver', {
        correctAnswererId: room.correctAnswerer,
        correctAnswererName: room.correctAnswerer ? room.players[room.correctAnswerer].name : null,
        correctAnswererTime: room.correctAnswererTime,
        correctAnswer: room.currentQuestion ? room.currentQuestion.a : null // 最終問題の正解
    });

    // タイマーをクリア（もしあれば）
    if (room.timerId) {
        clearTimeout(room.timerId);
        room.timerId = null;
    }
    
    console.log(`部屋 ${roomId} のゲームが終了しました。`);
    // 部屋リスト更新
    emitRoomList();
    // 部屋の状態を再送信して「待機画面に戻る」ボタンなどを有効にする
    emitRoomState(roomId);
}

// 部屋をリセットする
function resetRoom(roomId) {
    const room = rooms[roomId];
    if (room) {
        room.status = "waiting";
        room.quizType = null;
        room.questionCount = 0;
        room.currentQuestion = null;
        room.correctAnswerer = null;
        room.correctAnswererTime = null;
        room.quizzes = [];
        Object.values(room.players).forEach(player => {
            player.score = 0;
            player.ready = false;
        });
        if (room.timerId) {
            clearTimeout(room.timerId);
            room.timerId = null;
        }
        emitRoomState(roomId);
        emitRoomList();
        console.log(`部屋 ${roomId} がリセットされました。`);
    }
}


io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    // 接続時に部屋リストを送信
    emitRoomList();

    // 部屋作成
    socket.on('createRoom', ({ roomName, password, nickname }) => {
        // 最大部屋数を超えていないかチェック（ここでは表示数とは別に実際の部屋数を考慮）
        if (Object.keys(rooms).length >= MAX_ROOMS_DISPLAY) { // MAX_ROOMS_DISPLAYを最大部屋数として使用
            socket.emit('roomError', '満室です。しばらくしてからお試しください。');
            return;
        }

        // ユニークなルームIDを生成
        let roomId = uuidv4().substring(0, 8); // 8桁のID
        while (rooms[roomId]) { // 既に存在するIDなら再生成
            roomId = uuidv4().substring(0, 8);
        }

        rooms[roomId] = {
            id: roomId,
            name: roomName,
            password: password ? password : null,
            status: "waiting",
            hostId: socket.id,
            quizType: null, // 未選択
            players: {
                [socket.id]: {
                    id: socket.id,
                    name: nickname,
                    score: 0,
                    ready: false,
                    isHost: true
                }
            },
            currentQuestion: null,
            correctAnswerer: null,
            correctAnswererTime: null,
            questionCount: 0,
            totalQuestions: 1, // 早押しクイズなので常に1問
            quizzes: [],
            questionStartTime: null // 問題が出た時刻
        };

        socket.join(roomId);
        socket.emit('roomCreated', roomId);
        console.log(`部屋 ${roomId} (${roomName}) が ${socket.id} によって作成されました。`);
        emitRoomList(); // 部屋リストを更新して全員に通知
        emitRoomState(roomId); // 部屋の状態を送信
    });

    // 部屋参加
    socket.on('joinRoom', ({ roomId, password, nickname }) => {
        const room = rooms[roomId];

        if (!room) {
            socket.emit('roomError', '指定された部屋は存在しません。');
            return;
        }
        if (room.password && room.password !== password) {
            socket.emit('roomError', 'パスワードが間違っています。');
            return;
        }
        if (Object.keys(room.players).length >= MAX_PLAYERS_PER_ROOM) {
            socket.emit('roomError', 'この部屋は満員です。');
            return;
        }
        if (room.status !== 'waiting' && room.status !== 'finished') {
            socket.emit('roomError', 'ゲーム中の部屋には参加できません。');
            return;
        }

        // 既に部屋にいる場合は退出させる（多重参加防止）
        for (const rId in rooms) {
            if (rooms[rId].players[socket.id]) {
                socket.leave(rId);
                delete rooms[rId].players[socket.id];
                if (Object.keys(rooms[rId].players).length === 0) {
                    console.log(`部屋 ${rId} に誰もいなくなったため削除しました。`);
                    delete rooms[rId];
                } else if (rooms[rId].hostId === socket.id) {
                    // ホストが退出したら新しいホストを設定
                    const newHostId = Object.keys(rooms[rId].players)[0];
                    if (newHostId) {
                        rooms[rId].hostId = newHostId;
                        rooms[rId].players[newHostId].isHost = true;
                    }
                }
                emitRoomList();
                emitRoomState(rId);
                break;
            }
        }


        room.players[socket.id] = {
            id: socket.id,
            name: nickname,
            score: 0,
            ready: false,
            isHost: false
        };
        socket.join(roomId);
        socket.emit('roomJoined', roomId);
        console.log(`${nickname}(${socket.id}) が部屋 ${roomId} に参加しました。`);
        io.to(roomId).emit('playerJoined', room.players[socket.id]); // 新しいプレイヤーが参加したことを部屋の全員に通知
        emitRoomList();
        emitRoomState(roomId); // 部屋の状態を更新して送信

    });

    // プレイヤーの準備状態を更新
    socket.on('setReady', ({ roomId, isReady }) => {
        const room = rooms[roomId];
        if (room && room.players[socket.id]) {
            room.players[socket.id].ready = isReady;
            console.log(`${room.players[socket.id].name} が部屋 ${roomId} で準備状態を ${isReady} に設定しました。`);
            emitRoomState(roomId); // 部屋の状態を更新して全員に通知
        }
    });

    // ホストによるクイズタイプ選択
    socket.on('selectQuizType', ({ roomId, type }) => {
        const room = rooms[roomId];
        if (room && room.hostId === socket.id && room.status === 'waiting') {
            if (quizData[type]) {
                room.quizType = type;
                room.quizzes = shuffleArray([...quizData[type]]); // 選択されたクイズをシャッフル
                console.log(`部屋 ${roomId} でクイズタイプが ${type} に設定されました。`);
                emitRoomState(roomId);
            }
        }
    });

    // ホストによるゲーム開始
    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (!room || room.hostId !== socket.id || room.status !== 'waiting') {
            socket.emit('roomError', 'ゲームを開始できません。ホストであること、または待機中であることを確認してください。');
            return;
        }
        // 最低1人いればゲーム開始可能
        if (Object.keys(room.players).length === 0) {
            socket.emit('roomError', 'ゲームを開始するには少なくとも1人のプレイヤーが必要です。');
            return;
        }
        // クイズタイプが選択されているか
        if (!room.quizType || room.quizzes.length === 0) {
            socket.emit('roomError', 'クイズタイプを選択してください。');
            return;
        }
        
        room.status = 'playing';
        room.questionCount = 0;
        room.correctAnswerer = null;
        room.correctAnswererTime = null;
        
        // 全プレイヤーのスコアと準備状態をリセット
        Object.values(room.players).forEach(player => {
            player.score = 0;
            player.ready = false; // ゲーム開始でready状態をリセット
        });

        console.log(`部屋 ${roomId} でゲームが開始されました！`);
        io.to(roomId).emit('gameStarted');
        sendQuestion(roomId); // 最初の問題を出題
        emitRoomList();
        emitRoomState(roomId);
    });

    // 解答送信
    socket.on('submitAnswer', (roomId, answer) => {
        const room = rooms[roomId];
        if (!room || room.status !== 'playing' || !room.currentQuestion || room.correctAnswerer) {
            // ゲーム中でない、または既に正解者が出ている場合は無視
            return;
        }

        const isCorrect = (answer.toLowerCase() === room.currentQuestion.a.toLowerCase());

        if (isCorrect) {
            room.correctAnswerer = socket.id; // 最初に正解したプレイヤーを記録
            room.players[socket.id].score++; // スコア加算
            
            // タイムを計算
            room.correctAnswererTime = (Date.now() - room.questionStartTime) / 1000; // 秒単位でタイムを記録

            io.to(roomId).emit('correctAnswer', {
                correctAnswererId: socket.id,
                correctAnswererName: room.players[socket.id].name,
                correctAnswererTime: room.correctAnswererTime,
                correctAnswer: room.currentQuestion.a // 正解
            });
            
            // ゲームを終了
            endGame(roomId);

        } else {
            // 不正解の場合は特に何もしない（早押しなので）
            socket.emit('feedback', '不正解...');
        }
    });

    // 待機画面に戻るボタンが押された場合
    socket.on('returnToLobby', (roomId) => {
        const room = rooms[roomId];
        // ホストのみがリセットできる
        if (room && room.hostId === socket.id) {
            resetRoom(roomId);
        }
    });


    // プレイヤー切断
    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.players[socket.id]) {
                const disconnectedPlayerName = room.players[socket.id].name;
                delete room.players[socket.id];
                io.to(roomId).emit('playerLeft', socket.id, disconnectedPlayerName); // 部屋の全員にプレイヤーが退出したことを通知
                console.log(`${disconnectedPlayerName}(${socket.id}) が部屋 ${roomId} から退出しました。`);

                if (Object.keys(room.players).length === 0) {
                    // 部屋に誰もいなくなった場合
                    delete rooms[roomId];
                    console.log(`部屋 ${roomId} に誰もいなくなったため削除しました。`);
                } else if (room.hostId === socket.id) {
                    // ホストが切断した場合、新しいホストを割り当てる
                    const newHostId = Object.keys(room.players)[0];
                    if (newHostId) {
                        room.hostId = newHostId;
                        room.players[newHostId].isHost = true;
                    }
                }
                // 部屋リストと部屋の状態を更新
                emitRoomList();
                emitRoomState(roomId);
                return;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});