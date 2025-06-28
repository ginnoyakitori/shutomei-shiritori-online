// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
// const { v4: uuidv4 } = require('uuid'); // uuidv4は不要になるためコメントアウトまたは削除
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
const MAX_ROOMS_DISPLAY = 10; // 常に表示する部屋数 (実際の最大部屋数ではない)

// クイズデータ
let kokumeiQuizData = [];
let shutomeiQuizData = [];

// CSVファイルからクイズデータを読み込む関数
function loadQuizData() {
    try {
        // kokumei.csv
        const kokumeiContent = fs.readFileSync('kokumei.csv', 'utf8');
        kokumeiQuizData = kokumeiContent.split('\n')
            .map(line => {
                const parts = line.trim().split(',');
                if (parts.length === 2) {
                    return { question: parts[0].trim(), answer: parts[1].trim() };
                }
                return null;
            })
            .filter(item => item !== null && item.question !== '' && item.answer !== ''); // 空行や不完全な行を除外
        console.log(`kokumei.csv loaded: ${kokumeiQuizData.length} questions`);

        // shutomei.csv
        const shutomeiContent = fs.readFileSync('shutomei.csv', 'utf8');
        shutomeiQuizData = shutomeiContent.split('\n')
            .map(line => {
                const parts = line.trim().split(',');
                if (parts.length === 2) {
                    return { question: parts[0].trim(), answer: parts[1].trim() };
                }
                return null;
            })
            .filter(item => item !== null && item.question !== '' && item.answer !== ''); // 空行や不完全な行を除外
        console.log(`shutomei.csv loaded: ${shutomeiQuizData.length} questions`);

    } catch (error) {
        console.error("Error loading quiz data:", error);
        // ファイルが見つからないなどの場合、デフォルトのデータを設定するか、サーバーを停止するなど適切なエラーハンドリングを行う
        // ここでは空のままにしておく
    }
}

// サーバー起動時にクイズデータを読み込む
loadQuizData();

// 部屋の状態をクライアントに送信するヘルパー関数
function emitRoomList() {
    const roomList = Object.values(rooms)
        .filter(room => room.isVisible) // isVisibleがtrueの部屋のみ表示
        .map(room => ({
            id: room.id,
            name: room.name,
            playersCount: Object.keys(room.players).length,
            // maxPlayersは削除されるため、ここでは含めない
            status: room.status,
            hasPassword: room.password !== null, // パスワードの概念は今回のコードにはないので常にfalseになる
            quizType: room.quizType
        }));

    // MAX_ROOMS_DISPLAYまで空の部屋情報も追加して常に10部屋表示 (このロジックは維持)
    const paddedRoomList = [...roomList];
    while (paddedRoomList.length < MAX_ROOMS_DISPLAY) {
        paddedRoomList.push({ id: null, name: "空き部屋", playersCount: 0, status: "empty", hasPassword: false, quizType: null });
    }

    io.emit('roomList', paddedRoomList.slice(0, MAX_ROOMS_DISPLAY));
    console.log("部屋リストを更新しました。");
}

// 特定の部屋の状態をその部屋の全員に送信
function emitRoomState(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    // プレイヤーオブジェクトを配列に変換して送信
    const playersArray = Object.values(room.players);

    io.to(roomId).emit('roomState', {
        id: room.id,
        name: room.name,
        players: playersArray, // 配列として送信
        status: room.status,
        hostId: room.hostId,
        quizType: room.quizType,
        currentQuestion: room.currentQuestion ? { text: room.currentQuestion.text, questionNumber: room.currentQuestion.questionNumber } : null,
        correctAnswerer: room.correctAnswerer,
        correctAnswererTime: room.correctAnswererTime
    });
    console.log(`部屋 ${roomId} の状態を更新しました。`);
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
                questionNumber: room.currentQuestion.questionNumber,
                quizType: room.quizType // クイズタイプもここで送る
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

    // 接続時に部屋リストを送信
    emitRoomList();

    // 部屋を作成
    socket.on('createRoom', ({ roomName, nickname }) => {
        let roomId;
        do {
            roomId = Math.floor(1000 + Math.random() * 9000).toString(); // 1000から9999までの4桁の数字
        } while (rooms[roomId]); // 既に存在するIDなら再生成

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
        if (room.status !== 'waiting' && room.status !== 'finished') { // finished状態でも再参加可能にする
            socket.emit('roomError', 'この部屋は現在ゲーム中です。');
            console.log(`参加失敗: 部屋 ${roomId} はゲーム中です。`);
            return;
        }
        // if (Object.keys(room.players).length >= 4) { // 最大プレイヤー数のチェックは削除
        //     socket.emit('roomError', 'この部屋は満員です。');
        //     console.log(`参加失敗: 部屋 ${roomId} は満員です。`);
        //     return;
        // }

        // 既にどこかの部屋にいる場合は退出させる
        for (const rId in rooms) {
            if (rooms[rId].players[socket.id]) {
                const playerToLeave = rooms[rId].players[socket.id];
                socket.leave(rId);
                delete rooms[rId].players[socket.id];
                io.to(rId).emit('playerLeft', socket.id, playerToLeave.name); // 元の部屋に退出を通知
                console.log(`${playerToLeave.name}(${socket.id}) が部屋 ${rId} から退出しました。`);

                if (Object.keys(rooms[rId].players).length === 0) {
                    delete rooms[rId];
                    console.log(`部屋 ${rId} に誰もいなくなったため削除しました。`);
                } else if (rooms[rId].hostId === socket.id) {
                    const newHostId = Object.keys(rooms[rId].players)[0];
                    if (newHostId) {
                        rooms[rId].hostId = newHostId;
                        rooms[rId].players[newHostId].isHost = true;
                        io.to(rId).emit('newHost', newHostId);
                        console.log(`部屋 ${rId} の新しいホストは ${rooms[rId].players[newHostId].name} (${newHostId}) です。`);
                    }
                }
                emitRoomList();
                if (rooms[rId]) {
                    emitRoomState(rId);
                }
                break;
            }
        }


        room.players[socket.id] = { name: nickname, score: 0, ready: false, isHost: false };
        socket.join(roomId);
        socket.emit('roomJoined', roomId);
        emitRoomList(); // 部屋リストを更新
        emitRoomState(roomId); // 部屋の状態を更新
        console.log(`${nickname} (${socket.id}) が部屋 ${roomId} に参加しました。`);
    });

    // 部屋の表示/非表示を切り替え (クライアント側でこのボタンを削除したので、この機能は使われなくなるが、サーバー側は残しておく)
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
        if (room && room.hostId === socket.id && room.status === 'waiting' && (type === 'kokumei' || type === 'shutomei')) {
            room.quizType = type;
            emitRoomState(roomId); // 部屋の状態を更新
            console.log(`部屋 ${roomId} のクイズタイプが ${type} に設定されました。`);
        }
    });

    // ゲーム開始
    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        // 変更点: 参加プレイヤーが一人でもクイズを開始できるように
        // room.quizType が選択されており、ホストであること、ステータスが 'waiting' であることを確認
        if (room && room.hostId === socket.id && room.status === 'waiting' && room.quizType) {
            // 全員が準備OKか、またはホストが強制的に開始するか (今回は「全員準備OK」のチェックを削除)
            // if (Object.values(room.players).every(p => p.ready)) { // この行は削除
            
            room.status = 'playing';
            room.currentQuestionIndex = 0;
            
            // 全員のスコアをリセットし、準備状態もリセット
            Object.values(room.players).forEach(player => {
                player.score = 0;
                player.ready = false;
            });

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
            emitRoomList(); // 部屋リストを更新（ステータス変更のため）
            emitRoomState(roomId); // 部屋の状態を更新
            /*
            } else {
                socket.emit('feedback', '全員が準備完了になっていません。'); // このフィードバックは不要になる
            }
            */
        } else {
            console.log(`ゲーム開始条件を満たしていません: 部屋 ${roomId}`);
            console.log(`ホスト: ${room?.hostId === socket.id}, ステータス: ${room?.status}, クイズタイプ: ${room?.quizType}`);
            socket.emit('feedback', 'ゲーム開始条件が満たされていません。');
        }
    });

    // 解答を送信
    socket.on('submitAnswer', (roomId, answer) => {
        const room = rooms[roomId];
        // ゲーム中であり、まだ正解者がいない場合のみ処理
        if (room && room.status === 'playing' && room.currentQuestion && room.correctAnswerer === null) {
            // 回答を正規化（例: 大文字小文字を区別しない、全角半角を区別しないなど）
            const normalizeAnswer = (str) => {
                if (!str) return '';
                return str.toLowerCase().replace(/[Ａ-Ｚａ-ｚ０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)); // 全角英数を半角に
            };

            const isCorrect = (normalizeAnswer(answer) === normalizeAnswer(room.currentQuestion.answer));

            if (isCorrect) {
                const timeTaken = (Date.now() - room.questionStartTime) / 1000;
                room.correctAnswerer = socket.id;
                room.correctAnswererTime = timeTaken;
                room.players[socket.id].score = (room.players[socket.id].score || 0) + 1; // スコアを加算

                io.to(roomId).emit('correctAnswer', {
                    playerId: socket.id,
                    score: room.players[socket.id].score,
                    timeTaken: timeTaken,
                    correctAnswerText: room.currentQuestion.answer // 正しい答えのテキストも送る
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
            room.quizType = null; // クイズタイプもリセット
            room.currentQuestion = null;
            room.currentQuestionIndex = 0;
            room.correctAnswerer = null;
            room.correctAnswererTime = null;
            // プレイヤーの準備状態とスコアをリセット
            Object.values(room.players).forEach(player => {
                player.ready = false;
                player.score = 0;
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