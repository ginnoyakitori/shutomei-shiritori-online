// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

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

// ゲームの状態を保持するオブジェクト
// 例:
// {
//   "roomId123": {
//     status: "waiting", // "waiting", "playing", "finished"
//     hostId: "socketId1",
//     players: {
//       "socketId1": { name: "Player1", score: 0 },
//       "socketId2": { name: "Player2", score: 0 }
//     },
//     currentQuestion: { text: "日本の首都は？", answer: "東京" },
//     correctAnswerer: null, // 最初に正解したプレイヤーのsocketId
//     questionCount: 0, // 何問目か
//     totalQuestions: 10,
//     quizzes: [] // 出題するクイズのリスト
//   }
// }
const rooms = {};
const MAX_ROOMS = 10; // 最大部屋数

// ダミーのクイズ問題（実際にはファイルから読み込むなど）
const allQuizzes = [
    { text: "日本の首都は？", answer: "東京" },
    { text: "世界で一番高い山は？", answer: "エベレスト" },
    { text: "太陽系の惑星で一番大きいのは？", "answer": "木星" },
    { text: "水の化学式は？", answer: "H2O" },
    { text: "光の速さは約何km/秒？", answer: "30万" },
    { text: "HTMLは何の略？", answer: "HyperText Markup Language" },
    { text: "Pythonの生みの親は？", answer: "Guido van Rossum" },
    { text: "血液型がAB型の人の割合は？", answer: "10" }, // ざっくりとした数字
    { text: "世界で一番人口が多い国は？", answer: "インド" },
    { text: "パンダの好きな食べ物は？", answer: "笹" }
];

// --- Socket.IO 接続イベント ---
io.on('connection', (socket) => {
    console.log(`新しいユーザーが接続しました: ${socket.id}`);
// 部屋を出るイベント
    socket.on('leaveRoom', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players[socket.id]) {
            const disconnectedPlayerName = room.players[socket.id].name;
            delete room.players[socket.id];
            socket.leave(roomId); // 部屋からソケットを退出させる
            io.to(roomId).emit('playerLeft', socket.id, disconnectedPlayerName); // 部屋の全員にプレイヤーが退出したことを通知
            console.log(`${disconnectedPlayerName}(${socket.id}) が部屋 ${roomId} から手動で退出しました。`);

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
                    io.to(roomId).emit('newHost', newHostId); // 新しいホストを通知
                    console.log(`部屋 ${roomId} の新しいホストは ${room.players[newHostId].name} (${newHostId}) です。`);
                }
            }
            // 部屋リストと部屋の状態を更新
            emitRoomList();
            emitRoomState(roomId);
        }
    });
    socket.on('disconnect', () => {
        console.log(`ユーザーが切断しました: ${socket.id}`);
        // ユーザーが切断したら、参加していた部屋から削除する処理
        for (const roomId in rooms) {
            if (rooms[roomId].players[socket.id]) {
                delete rooms[roomId].players[socket.id];
                socket.to(roomId).emit('playerRemoved', socket.id); // 部屋の他のプレイヤーに通知

                // もし部屋に誰もいなくなったら部屋を削除
                if (Object.keys(rooms[roomId].players).length === 0) {
                    delete rooms[roomId];
                    io.emit('roomRemoved', roomId); // 全員に部屋が削除されたことを通知
                } else if (rooms[roomId].hostId === socket.id) {
                    // ホストが切断した場合、新しいホストを割り当てるか、部屋を閉じるか
                    const remainingPlayers = Object.keys(rooms[roomId].players);
                    if (remainingPlayers.length > 0) {
                        rooms[roomId].hostId = remainingPlayers[0]; // 最初のプレイヤーを新ホストに
                        socket.to(roomId).emit('hostChanged', rooms[roomId].hostId);
                    } else {
                        delete rooms[roomId]; // 誰もいなくなったら部屋削除
                        io.emit('roomRemoved', roomId);
                    }
                }
                // 【変更点】プレイヤー切断後、部屋の情報を更新
                if (rooms[roomId]) { // 部屋がまだ存在する場合
                    rooms[roomId].id = roomId; // 部屋IDをデータに追加
                    io.to(roomId).emit('updateRoomInfo', rooms[roomId]); // 部屋内のメンバーに通知
                }
                io.emit('updateRoomList', rooms); // 部屋リストを更新
                break;
            }
        }
    });

    // --- 部屋関連のイベント ---
    socket.on('createRoom', (playerName) => {
        if (Object.keys(rooms).length >= MAX_ROOMS) {
            socket.emit('error', '最大部屋数に達しています。');
            return;
        }
        // ランダムな部屋IDを生成
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        rooms[roomId] = {
            status: 'waiting',
            hostId: socket.id,
            players: {
                [socket.id]: { name: playerName || `Player-${socket.id.substring(0, 4)}`, score: 0, isReady: false }
            },
            currentQuestion: null,
            correctAnswerer: null,
            questionCount: 0,
            totalQuestions: 10,
            quizzes: []
        };
        socket.join(roomId); // 部屋に入る
        socket.emit('roomCreated', roomId);
        // 【変更点】部屋作成後、部屋の情報を更新
        rooms[roomId].id = roomId; // 部屋IDをデータに追加
        io.to(roomId).emit('updateRoomInfo', rooms[roomId]); // 部屋内のメンバーに通知
        io.emit('updateRoomList', rooms); // 全員に部屋リストを更新
    });

    socket.on('joinRoom', (roomId, playerName) => {
        if (!rooms[roomId] || rooms[roomId].status !== 'waiting') {
            socket.emit('error', '部屋が見つからないか、参加できません。');
            return;
        }
        if (Object.keys(rooms[roomId].players).length >= 8) { // 例: 最大8人まで
            socket.emit('error', 'この部屋は満員です。');
            return;
        }

        rooms[roomId].players[socket.id] = { name: playerName || `Player-${socket.id.substring(0, 4)}`, score: 0, isReady: false };
        socket.join(roomId); // 部屋に入る
        socket.emit('joinedRoom', roomId, rooms[roomId]);
        io.to(roomId).emit('playerJoined', socket.id, rooms[roomId].players[socket.id]); // 部屋のメンバーに通知
        // 【変更点】部屋参加後、部屋の情報を更新
        rooms[roomId].id = roomId; // 部屋IDをデータに追加
        io.to(roomId).emit('updateRoomInfo', rooms[roomId]); // 部屋内のメンバーに通知
        io.emit('updateRoomList', rooms); // 全員に部屋リストを更新
    });

    socket.on('leaveRoom', (roomId) => {
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            delete rooms[roomId].players[socket.id];
            socket.leave(roomId);
            socket.emit('leftRoom');
            io.to(roomId).emit('playerRemoved', socket.id);

            if (Object.keys(rooms[roomId].players).length === 0) {
                delete rooms[roomId];
                io.emit('roomRemoved', roomId);
            } else if (rooms[roomId].hostId === socket.id) {
                const remainingPlayers = Object.keys(rooms[roomId].players);
                rooms[roomId].hostId = remainingPlayers[0];
                io.to(roomId).emit('hostChanged', rooms[roomId].hostId);
            }
            // 【変更点】部屋退出後、部屋の情報を更新
            if (rooms[roomId]) { // 部屋がまだ存在する場合
                rooms[roomId].id = roomId;
                io.to(roomId).emit('updateRoomInfo', rooms[roomId]);
            }
            io.emit('updateRoomList', rooms);
        }
    });

    socket.on('setReady', (roomId, isReady) => {
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            rooms[roomId].players[socket.id].isReady = isReady;
            io.to(roomId).emit('playerReadyStatus', socket.id, isReady);

            // 【変更点】準備状態変更後、部屋の情報を更新
            rooms[roomId].id = roomId;
            io.to(roomId).emit('updateRoomInfo', rooms[roomId]); // 部屋内のメンバーに通知

            // 全員準備OK & 2人以上ならゲーム開始
            const room = rooms[roomId];
            const playerIds = Object.keys(room.players);
            const allReady = playerIds.length >= 2 && playerIds.every(id => room.players[id].isReady);

            if (allReady && room.status === 'waiting') {
                // クイズをシャッフルしてセット
                room.quizzes = [...allQuizzes].sort(() => 0.5 - Math.random());
                room.status = 'playing';
                room.questionCount = 0;
                room.correctAnswerer = null;
                io.to(roomId).emit('gameStarting');
                setTimeout(() => {
                    sendNextQuestion(roomId);
                }, 3000); // 3秒後に最初の問題
            }
        }
    });

    // --- ゲーム進行イベント ---
    function sendNextQuestion(roomId) {
        const room = rooms[roomId];
        if (!room || room.status !== 'playing') return;

        room.questionCount++;
        if (room.questionCount > room.totalQuestions || room.questionCount > room.quizzes.length) {
            // ゲーム終了
            room.status = 'finished';
            io.to(roomId).emit('gameFinished', rooms[roomId]);
            console.log(`部屋 ${roomId} のゲームが終了しました。`);
            // 部屋は残すが、ゲーム状態をリセットすることも検討
            // delete rooms[roomId]; // 部屋を削除する場合
            io.emit('updateRoomList', rooms); // 【変更点】ゲーム終了時にも部屋リストを更新
            // 【変更点】ゲーム終了後、部屋の情報を更新
            room.id = roomId;
            io.to(roomId).emit('updateRoomInfo', room); // 部屋内のメンバーに通知
            return;
        }

        const currentQuiz = room.quizzes[room.questionCount - 1];
        room.currentQuestion = {
            text: currentQuiz.text,
            questionNumber: room.questionCount
        };
        room.correctAnswerer = null; // 正解者をリセット
        room.lastAnswerTime = null; // 解答時間をリセット

        io.to(roomId).emit('newQuestion', room.currentQuestion);
        console.log(`部屋 ${roomId} に問題 ${room.questionCount} を出題: ${room.currentQuestion.text}`);
        // 【変更点】新しい問題出題後、部屋の情報を更新
        room.id = roomId; // 部屋IDをデータに追加
        io.to(roomId).emit('updateRoomInfo', room); // 部屋内のメンバーに通知
    }

    socket.on('submitAnswer', (roomId, answer) => {
        const room = rooms[roomId];
        if (!room || room.status !== 'playing' || !room.currentQuestion || room.correctAnswerer) {
            // ゲーム中でない、または既に正解者が出ている場合は無視
            return;
        }

        const isCorrect = (answer.toLowerCase() === room.quizzes[room.questionCount - 1].answer.toLowerCase());

        if (isCorrect) {
            room.correctAnswerer = socket.id; // 最初に正解したプレイヤーを記録
            room.players[socket.id].score++; // スコア加算
            io.to(roomId).emit('correctAnswer', socket.id, room.players[socket.id].score); // 正解者とスコアを通知
            io.to(roomId).emit('gameOverQuestion', room.quizzes[room.questionCount - 1].answer); // 正解発表

            // 【変更点】正解者が出た後、部屋の情報を更新
            room.id = roomId; // 部屋IDをデータに追加
            io.to(roomId).emit('updateRoomInfo', room); // 部屋内のメンバーに通知

            setTimeout(() => {
                sendNextQuestion(roomId); // 次の質問へ
            }, 3000); // 3秒後に次の問題
        } else {
            // 不正解の場合は通知しない（早押しクイズなので）
            // socket.emit('wrongAnswer');
        }
    });
});

// --- 静的ファイルの配信 ---
// publicフォルダを公開（フロントエンドのHTML/JS/CSS）
app.use(express.static('public'));

// サーバーの起動
server.listen(PORT, () => {
    console.log(`サーバーがポート ${PORT} で起動しました。`);
});