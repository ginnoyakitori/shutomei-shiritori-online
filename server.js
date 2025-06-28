const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// クイズデータをロードする関数
const quizData = {}; // クイズデータを保持するオブジェクト

async function loadQuiz(filename) {
    const filePath = path.join(__dirname, filename);
    try {
        const csv = await fs.promises.readFile(filePath, 'utf8');
        const lines = csv.trim().split('\n').slice(1); // ヘッダーをスキップ
        return lines.map(line => {
            const [q, a] = line.split(',');
            return { q: q.trim(), a: a.trim() };
        });
    } catch (error) {
        console.error(`Error loading quiz file ${filename}:`, error);
        return [];
    }
}

// サーバー起動時にクイズデータをロード
async function initializeQuizData() {
    quizData['kokumei.csv'] = await loadQuiz('kokumei.csv');
    quizData['shutomei.csv'] = await loadQuiz('shutomei.csv');
    console.log(`kokumei.csv loaded: ${quizData['kokumei.csv'].length} questions`);
    console.log(`shutomei.csv loaded: ${quizData['shutomei.csv'].length} questions`);
}

initializeQuizData();

// 部屋の状態を管理するオブジェクト
const rooms = {};

// ユーティリティ関数：配列をシャッフルする
function shuffleArray(array) {
    // Array.from() を使って新しい配列を作成し、元の配列が変更されないようにする
    const newArray = Array.from(array); 
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 接続時に部屋リストをクライアントに送信
    socket.emit('roomList', getPublicRoomList());

    socket.on('getRoomList', () => {
        socket.emit('roomList', getPublicRoomList());
    });

    socket.on('createRoom', ({ roomName, nickname }) => {
        const roomId = generateRoomId(); // 新しいルームIDを生成
        const player = { id: socket.id, nickname, isHost: true, isReady: true, score: 0, finalTime: null };
        rooms[roomId] = {
            id: roomId,
            name: roomName,
            hostId: socket.id,
            hostName: nickname,
            players: [player],
            quizFile: null, // ホストが選択するまでnull
            quizTitle: null,
            quizSet: null,
            questions: [], // ゲーム開始時に設定
            currentQuestionIndex: 0,
            startTime: null,
            isPlaying: false,
            isVisible: true, // デフォルトで公開
            maxPlayers: 4, // 最大プレイヤー数
            playerTimes: {} // 各プレイヤーの現在の経過時間を保持
        };
        socket.join(roomId);
        socket.roomId = roomId; // ソケットに現在の部屋IDを紐付け
        socket.emit('roomCreated', rooms[roomId]);
        io.emit('roomList', getPublicRoomList()); // 全クライアントに部屋リストを更新
        console.log(`Room created: ${roomId} by ${nickname}`);
    });

    socket.on('joinRoom', ({ roomId, nickname }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('roomError', '指定された部屋は見つかりません。');
            return;
        }
        
        // if (room.players.length >= room.maxPlayers) {
        //     socket.emit('roomError', 'この部屋は満員です。');
        //     return;
        // }
        // if (room.isPlaying) {
        //     // ゲーム中の部屋でも参加を許可
        //     console.log(`User ${nickname} joining game in progress in room ${roomId}`);
        // }

        const existingPlayer = room.players.find(p => p.id === socket.id);
        if (existingPlayer) {
            socket.emit('roomError', 'すでにこの部屋に参加しています。');
            return;
        }

        const player = { id: socket.id, nickname, isHost: false, isReady: false, score: 0, finalTime: null };
        room.players.push(player);
        socket.join(roomId);
        socket.roomId = roomId;

        if (room.isPlaying) {
            // ゲーム中に入室した場合、既存のプレイヤーの経過時間と同期
            player.startTimeOffset = room.startTime ? Date.now() - room.startTime : 0;
            console.log(`Player ${nickname} joined game in progress. Offset: ${player.startTimeOffset}ms`);
        }

        socket.emit('joinedRoom', room);
        io.to(roomId).emit('roomStateUpdate', room); // 部屋の全メンバーに状態更新
        io.emit('roomList', getPublicRoomList()); // 全クライアントに部屋リストを更新
        console.log(`User ${nickname} joined room: ${roomId}`);
    });

    socket.on('getRoomState', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) {
            socket.emit('roomStateUpdate', room);
        }
    });

    socket.on('setReady', ({ roomId, isReady }) => {
        const room = rooms[roomId];
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.isReady = isReady;
                io.to(roomId).emit('roomStateUpdate', room);
                console.log(`Player ${player.nickname} in room ${roomId} isReady: ${isReady}`);
            }
        }
    });

    socket.on('selectQuizType', ({ roomId, quizFile, quizTitle, quizSet }) => {
        const room = rooms[roomId];
        if (room && room.hostId === socket.id) { // ホストのみが設定可能
            room.quizFile = quizFile;
            room.quizTitle = quizTitle;
            room.quizSet = quizSet;
            // クイズが選択されたら、部屋の全メンバーに状態更新を通知
            io.to(roomId).emit('roomStateUpdate', room);
            console.log(`Room ${roomId} quiz type set to: ${quizTitle}`);
        }
    });

    socket.on('toggleRoomVisibility', ({ roomId }) => {
        const room = rooms[roomId];
        if (room && room.hostId === socket.id) {
            room.isVisible = !room.isVisible;
            io.to(roomId).emit('roomStateUpdate', room);
            io.emit('roomList', getPublicRoomList()); // 全クライアントに部屋リストを更新
            console.log(`Room ${roomId} visibility toggled to ${room.isVisible}`);
        }
    });

    socket.on('startGame', ({ roomId, quizSet, quizTitle }) => {
        const room = rooms[roomId];
        if (room && room.hostId === socket.id && !room.isPlaying && room.quizFile) {
            // 全員が準備完了か確認 (ホストは常に準備完了とみなす)
            // プレイヤーが1人だけでもゲームを開始できるように `room.players.length > 0` を追加
            const allReady = room.players.length > 0 && room.players.every(p => p.isReady || p.isHost);
            if (!allReady) {
                // クライアント側でボタンをdisabledにしているので、通常ここには来ないはず
                console.warn(`Attempted to start game in room ${roomId} but not all players are ready.`);
                return;
            }

            room.isPlaying = true;
            room.currentQuestionIndex = 0;
            room.questions = shuffleArray(quizData[room.quizFile]).slice(0, 10); // 10問にシャッフルして設定
            room.startTime = Date.now(); // ゲーム開始時刻を設定
            room.players.forEach(p => {
                p.score = 0; // スコアをリセット
                p.finalTime = null; // 最終タイムをリセット
                p.isFinished = false; // ゲーム終了状態をリセット
                p.isReady = true; // ゲーム中は全員準備OK扱い
                p.startTimeOffset = 0; // ゲーム開始時のオフセットをリセット
            });

            io.to(roomId).emit('gameStarted', {
                questions: room.questions,
                quizSet: room.quizSet,
                quizTitle: room.quizTitle,
                inputMethod: "flick" // 仮でフリック固定。後でホストが選択できるようにする
            });
            io.emit('roomList', getPublicRoomList()); // 全クライアントに部屋リストを更新
            console.log(`Game started in room ${roomId} with ${room.players.length} players.`);
        }
    });

    socket.on('submitAnswer', ({ roomId, questionIndex, answer, isCorrect, score }) => {
        const room = rooms[roomId];
        if (room && room.isPlaying) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                // プレイヤーのスコアを更新
                player.score = score;
                console.log(`${player.nickname} in room ${roomId} answered Q${questionIndex}: ${answer} (Correct: ${isCorrect}, Score: ${score})`);

                // 全員の解答が揃ったかチェック (今回は即座に次の問題へ進むためこのロジックは簡略化)
                // 複数プレイヤーが同時に解答するケースは、それぞれのクライアントで次の問題へ進む

                // サーバー側ではプレイヤーの最新スコアを部屋の状態に反映
                io.to(roomId).emit('roomStateUpdate', room); // 必要に応じてプレイヤーリストのスコアを更新
            }
        }
    });

    socket.on('playerFinished', ({ roomId, finalTime, score }) => {
        const room = rooms[roomId];
        if (room && room.isPlaying) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.finalTime = finalTime; // 最終タイムを記録
                player.score = score; // 最終スコアを記録
                player.isFinished = true; // 完了フラグ
                console.log(`Player ${player.nickname} in room ${roomId} finished in ${finalTime}s with ${score} score.`);

                // 全員がゲームを終了したかチェック
                const allFinished = room.players.every(p => p.isFinished);
                if (allFinished) {
                    console.log(`All players in room ${roomId} finished.`);
                    io.to(roomId).emit('gameFinished', {
                        message: '全員が解答を終えました！',
                        players: room.players
                    });
                    room.isPlaying = false; // ゲーム終了
                    io.emit('roomList', getPublicRoomList()); // 部屋リストを更新 (ステータス変更)
                } else {
                    // まだ全員終わっていない場合、他のプレイヤーに状態更新を送信
                    io.to(roomId).emit('roomStateUpdate', room);
                    // ここで、他のプレイヤーに「誰かが終わったよ」といった情報や、
                    // 全員が終わり次第結果を表示するような通知を送ることも可能
                }
            }
        }
    });

    socket.on('updatePlayerTime', ({ roomId, time }) => {
        const room = rooms[roomId];
        if (room && room.isPlaying) {
            // 各プレイヤーの経過時間はクライアントで管理し、最終タイムのみ送信するように変更したので、
            // このイベントは基本的に不要になりました。
            // もし、リアルタイムに全員のタイムを共有したい場合は、このロジックを実装します。
            // 例: room.playerTimes[socket.id] = time;
            //     io.to(roomId).emit('playerTimesUpdated', room.playerTimes);
        }
    });

    socket.on('returnToLobby', ({ roomId }) => {
        const room = rooms[roomId];
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                // プレイヤーの準備状態をリセット (ホストは常にtrue)
                player.isReady = player.isHost;
                // スコアなどをリセットする必要があればここで
                player.score = 0;
                player.finalTime = null;
                player.isFinished = false;
            }
            // ゲーム中フラグはgameFinishedでfalseになるはずだが、念のため
            room.isPlaying = false; 
            io.to(roomId).emit('roomStateUpdate', room); // ロビー状態を更新
            io.emit('roomList', getPublicRoomList()); // 部屋リストを更新
            console.log(`Player ${player.nickname} returned to lobby in room ${roomId}`);
        }
    });

    socket.on('leaveRoom', ({ roomId }) => {
        handlePlayerLeave(socket, roomId);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // socket.roomId が設定されていれば、その部屋から退出処理を行う
        if (socket.roomId && rooms[socket.roomId]) {
            handlePlayerLeave(socket, socket.roomId);
        }
    });
});

function handlePlayerLeave(socket, roomId) {
    const room = rooms[roomId];
    if (room) {
        room.players = room.players.filter(p => p.id !== socket.id);
        socket.leave(roomId);

        if (room.players.length === 0) {
            // 部屋に誰もいなくなったら部屋を削除
            delete rooms[roomId];
            console.log(`Room ${roomId} deleted as it is empty.`);
        } else {
            // ホストが退出した場合、新しいホストを選出
            if (room.hostId === socket.id) {
                const newHost = room.players[0];
                if (newHost) {
                    room.hostId = newHost.id;
                    newHost.isHost = true;
                    newHost.isReady = true; // 新しいホストも準備OKにする
                    room.hostName = newHost.nickname;
                    console.log(`Player ${newHost.nickname} is new host for room ${roomId}`);
                }
            }
            io.to(roomId).emit('roomStateUpdate', room); // 部屋の全メンバーに状態更新
        }
        io.emit('roomList', getPublicRoomList()); // 全クライアントに部屋リストを更新
        console.log(`User ${socket.id} left room: ${roomId}. Players left: ${room.players.length}`);
    }
}

// 公開する部屋リストを返す関数 (パスワード関連は削除)
function getPublicRoomList() {
    return Object.values(rooms).map(room => ({
        id: room.id,
        name: room.name,
        players: room.players.map(p => ({ nickname: p.nickname, isHost: p.isHost, isReady: p.isReady, score: p.score })),
        hostName: room.hostName,
        isPlaying: room.isPlaying,
        isVisible: room.isVisible, // 公開・非公開状態も渡す
        maxPlayers: room.maxPlayers
    })).filter(room => room.isVisible); // isVisibleがtrueの部屋のみを返す
}

// 4桁の数字のルームIDを生成する関数
function generateRoomId() {
    let roomId;
    let isUnique = false;
    while (!isUnique) {
        roomId = Math.floor(1000 + Math.random() * 9000).toString(); // 1000 から 9999
        if (!rooms[roomId]) {
            isUnique = true;
        }
    }
    return roomId;
}

server.listen(PORT, () => {
    console.log(`サーバーがポート ${PORT} で起動しました。`);
});