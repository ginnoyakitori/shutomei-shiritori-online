// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid'); // ユニークなID生成用
const fs = require('fs'); // fsモジュールを追加

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
const rooms = {};

// クイズデータ
let kokumeiQuizData = [];
let shutomeiQuizData = [];

// CSVファイルからクイズデータを読み込む関数
function loadQuizData() {
    try {
        const kokumeiContent = fs.readFileSync('kokumei.csv', 'utf8');
        kokumeiQuizData = kokumeiContent.split('\n').map(line => {
            const parts = line.trim().split(',');
            if (parts.length === 2) {
                return { question: parts[0].trim(), answer: parts[1].trim() };
            }
            return null;
        }).filter(item => item !== null && item.question !== '' && item.answer !== ''); // 空行や不完全な行を除外
        console.log(`kokumei.csv loaded: ${kokumeiQuizData.length} questions`);

        const shutomeiContent = fs.readFileSync('shutomei.csv', 'utf8');
        shutomeiQuizData = shutomeiContent.split('\n').map(line => {
            const parts = line.trim().split(',');
            if (parts.length === 2) {
                return { question: parts[0].trim(), answer: parts[1].trim() };
            }
            return null;
        }).filter(item => item !== null && item.question !== '' && item.answer !== ''); // 空行や不完全な行を除外
        console.log(`shutomei.csv loaded: ${shutomeiQuizData.length} questions`);

    } catch (error) {
        console.error("Error loading quiz data:", error);
    }
}

// サーバー起動時にクイズデータを読み込む
loadQuizData();

// 部屋リストを全クライアントに送信
function emitRoomList() {
    const publicRooms = Object.values(rooms).map(room => ({
        id: room.id,
        name: room.name,
        playersCount: Object.keys(room.players).length,
        maxPlayers: 4, // 仮の最大プレイヤー数
        status: room.status,
        isVisible: room.isVisible // 部屋リストに表示するかどうか
    }));
    io.emit('roomList', publicRooms);
    console.log("部屋リストを更新しました。");
}

// 特定の部屋の状態をその部屋の全員に送信
function emitRoomState(roomId) {
    const room = rooms[roomId];
    if (room) {
        io.to(roomId).emit('roomState', room);
        console.log(`部屋 ${roomId} の状態を更新しました。`);
    }
}

// 新しい問題を出題する関数
function sendNextQuestion(roomId) {
    const room = rooms[roomId];
    if (room && room.status === 'playing') {
        if (room.currentQuestionIndex < room.questions.length) {
            const questionData = room.questions[room.currentQuestionIndex];
            room.currentQuestion = {
                text: questionData.question,
                answer: questionData.answer,
                questionNumber: room.currentQuestionIndex + 1
            };
            room.correctAnswerer = null; // 正解者をリセット
            room.correctAnswererTime = null; // 正解タイムをリセット
            room.questionStartTime = Date.now(); // 問題開始時刻を記録

            io.to(roomId).emit('newQuestion', {
                text: room.currentQuestion.text,
                questionNumber: room.currentQuestion.questionNumber
            });
            console.log(`部屋 ${roomId} に新しい問題を出題: ${room.currentQuestion.text}`);
        } else {
            // すべての問題が出題された場合、ゲーム終了
            room.status = 'finished';
            // 最終問題の正解者と答えを渡す
            io.to(roomId).emit('gameOver', {
                correctAnswererId: room.correctAnswerer,
                correctAnswererName: room.correctAnswerer ? room.players[room.correctAnswerer].name : null,
                correctAnswererTime: room.correctAnswererTime,
                correctAnswer: room.currentQuestion ? room.currentQuestion.answer : 'N/A' // 最後の問題の答え
            });
            console.log(`部屋 ${roomId} のすべての問題が終了しました。`);
            emitRoomList(); // 部屋リストを更新
            emitRoomState(roomId); // 部屋の状態を更新
        }
    }
}


// Socket.IO接続ハンドラ
io.on('connection', (socket) => {
    console.log('ユーザーが接続しました:', socket.id);

    // 部屋リストのリクエストを受信
    socket.on('requestRoomList', () => {
        emitRoomList();
    });

    // 部屋を作成
    socket.on('createRoom', ({ roomName, nickname }) => {
        const roomId = uuidv4().slice(0, 4); // 4桁の短いIDを生成
        rooms[roomId] = {
            id: roomId,
            name: roomName,
            status: 'waiting',
            hostId: socket.id,
            quizType: null, // 初期状態ではクイズタイプは未選択
            isVisible: true, // デフォルトで部屋リストに表示
            players: {
                [socket.id]: { name: nickname, score: 0, ready: false, isHost: true }
            },
            questions: [], // クイズ問題の配列
            currentQuestionIndex: 0,
            currentQuestion: null,
            correctAnswerer: null,
            correctAnswererTime: null,
            questionStartTime: null
        };
        socket.join(roomId);
        socket.emit('roomCreated', roomId);
        emitRoomList(); // 部屋リストを更新
        emitRoomState(roomId); // 部屋の状態を更新
        console.log(`部屋 ${roomId} が ${nickname} (${socket.id}) によって作成されました。`);
    });

    // 部屋に参加
    socket.on('joinRoom', ({ roomId, nickname }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('roomError', '指定された部屋は見つかりません。');
            console.log(`参加失敗: 部屋 ${roomId} が見つかりません。`);
            return;
        }
        if (room.status !== 'waiting') {
            socket.emit('roomError', 'この部屋は現在ゲーム中です。');
            console.log(`参加失敗: 部屋 ${roomId} はゲーム中です。`);
            return;
        }
        if (Object.keys(room.players).length >= 4) { // 仮の最大プレイヤー数
            socket.emit('roomError', 'この部屋は満員です。');
            console.log(`参加失敗: 部屋 ${roomId} は満員です。`);
            return;
        }

        room.players[socket.id] = { name: nickname, score: 0, ready: false, isHost: false };
        socket.join(roomId);
        socket.emit('roomJoined', roomId);
        emitRoomList(); // 部屋リストを更新
        emitRoomState(roomId); // 部屋の状態を更新
        console.log(`${nickname} (${socket.id}) が部屋 ${roomId} に参加しました。`);
    });

    // 部屋の表示/非表示を切り替え
    socket.on('toggleRoomVisibility', (roomId) => {
        const room = rooms[roomId];
        if (room && room.hostId === socket.id) {
            room.isVisible = !room.isVisible;
            emitRoomList(); // 部屋リストを更新
            emitRoomState(roomId); // 部屋の状態を更新
            console.log(`部屋 ${roomId} の表示状態を ${room.isVisible ? '表示' : '非表示'} に切り替えました。`);
        }
    });

    // 準備状態を設定
    socket.on('setReady', ({ roomId, isReady }) => {
        const room = rooms[roomId];
        if (room && room.players[socket.id]) {
            room.players[socket.id].ready = isReady;
            emitRoomState(roomId); // 部屋の状態を更新
            console.log(`${room.players[socket.id].name} (${socket.id}) が部屋 ${roomId} で準備状態を ${isReady} にしました。`);
        }
    });

    // ホストがクイズタイプを選択
    socket.on('selectQuizType', ({ roomId, type }) => {
        const room = rooms[roomId];
        if (room && room.hostId === socket.id && (type === 'kokumei' || type === 'shutomei')) {
            room.quizType = type;
            emitRoomState(roomId); // 部屋の状態を更新
            console.log(`部屋 ${roomId} のクイズタイプが ${type} に設定されました。`);
        }
    });

    // ゲーム開始
    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        // ④ 一人でもクイズを開始できるように変更
        if (room && room.hostId === socket.id && room.status === 'waiting' && room.quizType && Object.keys(room.players).length >= 1 && Object.values(room.players).every(p => p.ready)) {
            room.status = 'playing';
            room.currentQuestionIndex = 0;
            room.players = Object.fromEntries(
                Object.entries(room.players).map(([id, player]) => [id, { ...player, score: 0 }])
            ); // 全員のスコアをリセット

            // 選択されたクイズタイプに基づいて質問をセット
            if (room.quizType === 'kokumei') {
                room.questions = [...kokumeiQuizData];
            } else if (room.quizType === 'shutomei') {
                room.questions = [...shutomeiQuizData];
            }

            // 問題をシャッフル
            for (let i = room.questions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [room.questions[i], room.questions[j]] = [room.questions[j], room.questions[i]];
            }

            io.to(roomId).emit('gameStarted');
            console.log(`ゲーム開始: 部屋 ${roomId}, クイズタイプ: ${room.quizType}`);

            // 最初の問題を出題
            sendNextQuestion(roomId);
        } else {
            console.log(`ゲーム開始条件を満たしていません: 部屋 ${roomId}`);
            console.log(`ホスト: ${room?.hostId === socket.id}, ステータス: ${room?.status}, クイズタイプ: ${room?.quizType}, プレイヤー数: ${Object.keys(room?.players || {}).length}, 全員準備OK: ${Object.values(room?.players || {}).every(p => p.ready)}`);
            socket.emit('feedback', 'ゲーム開始条件が満たされていません。');
        }
    });

    // 解答を送信
    socket.on('submitAnswer', (roomId, answer) => {
        const room = rooms[roomId];
        // ゲーム中であり、まだ正解者がいない場合のみ処理
        if (room && room.status === 'playing' && room.currentQuestion && room.correctAnswerer === null) {
            if (answer.toLowerCase() === room.currentQuestion.answer.toLowerCase()) {
                const timeTaken = (Date.now() - room.questionStartTime) / 1000;
                room.correctAnswerer = socket.id;
                room.correctAnswererTime = timeTaken;
                room.players[socket.id].score = (room.players[socket.id].score || 0) + 1; // スコアを加算

                io.to(roomId).emit('correctAnswer', {
                    playerId: socket.id,
                    score: room.players[socket.id].score,
                    timeTaken: timeTaken
                });
                console.log(`部屋 ${roomId}: ${room.players[socket.id].name} が正解しました！ タイム: ${timeTaken.toFixed(2)}秒`);

                // 3秒後に次の問題に進むかゲームを終了する
                setTimeout(() => {
                    room.currentQuestionIndex++;
                    sendNextQuestion(roomId);
                }, 3000);
            } else {
                socket.emit('feedback', '不正解...');
                console.log(`部屋 ${roomId}: ${room.players[socket.id].name} が不正解でした。`);
            }
        }
    });

    // ホストがロビーに戻る
    socket.on('returnToLobby', (roomId) => {
        const room = rooms[roomId];
        if (room && room.hostId === socket.id && room.status === 'finished') {
            room.status = 'waiting';
            // プレイヤーの準備状態とスコアをリセット
            Object.keys(room.players).forEach(playerId => {
                room.players[playerId].ready = false;
                room.players[playerId].score = 0;
            });
            emitRoomList();
            emitRoomState(roomId);
            console.log(`部屋 ${roomId} がロビーに戻りました。`);
        }
    });

    // 部屋を退出
    socket.on('leaveRoom', (roomId) => {
        const room = rooms[roomId];
        if (room && room.players[socket.id]) {
            const playerName = room.players[socket.id].name;
            socket.leave(roomId);
            delete room.players[socket.id];
            console.log(`${playerName} (${socket.id}) が部屋 ${roomId} から退出しました。`);

            if (Object.keys(room.players).length === 0) {
                // 部屋に誰もいなくなった場合
                delete rooms[roomId];
                console.log(`部屋 ${roomId} に誰もいなくなったため削除しました。`);
            } else if (room.hostId === socket.id) {
                // ホストが退出した場合、新しいホストを割り当てる
                const newHostId = Object.keys(room.players)[0];
                if (newHostId) {
                    room.hostId = newHostId;
                    room.players[newHostId].isHost = true;
                    io.to(roomId).emit('newHost', newHostId); // 新しいホストを通知
                    console.log(`部屋 ${roomId} の新しいホストは ${room.players[newHostId].name} (${newHostId}) です。`);
                }
            }
            emitRoomList(); // 部屋リストを更新
            if (rooms[roomId]) { // 部屋がまだ存在する場合のみ状態を更新
                emitRoomState(roomId);
            }
        }
    });

    // 接続切断
    socket.on('disconnect', () => {
        console.log('ユーザーが切断しました:', socket.id);
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
                        io.to(roomId).emit('newHost', newHostId); // 新しいホストを通知
                        console.log(`部屋 ${roomId} の新しいホストは ${room.players[newHostId].name} (${newHostId}) です。`);
                    }
                }
                // 部屋リストと部屋の状態を更新
                emitRoomList();
                if (rooms[roomId]) { // 部屋がまだ存在する場合のみ状態を更新
                    emitRoomState(roomId);
                }
                return;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`サーバーがポート ${PORT} で起動しました。`);
});