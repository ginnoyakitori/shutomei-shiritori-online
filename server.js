// server.js

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public')); // public フォルダを静的ファイルとして提供

// 部屋の管理
const rooms = new Map(); // roomId -> { name, hostId, players: [], isPlaying: false, quizFile: '', quizTitle: '', gameStartTime: null, isVisible: true, quizSet: '' }

// クイズデータの読み込み (起動時に一度だけ)
const quizData = {};
function loadQuizData(filename) {
    try {
        // ★修正: dataフォルダを削除し、ルートディレクトリからのパスに変更
        const filePath = path.join(__dirname, filename); 
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.split(/\r?\n/).filter(line => line.trim() !== '');
        return lines.map(line => {
            const parts = line.split(',');
            // CSVの形式が '問題,解答' でない場合、ここを調整してください
            if (parts.length >= 2) {
                return { q: parts[0], a: parts[1] };
            }
            return null; // 不正な行はスキップ
        }).filter(item => item !== null);
    } catch (error) {
        console.error(`Failed to load quiz data from ${filename}:`, error);
        return [];
    }
}

// ★修正: ファイル名を直接指定
quizData.kokumei = loadQuizData('kokumei.csv');
quizData.shutomei = loadQuizData('shutomei.csv');

console.log(`Loaded kokumei questions: ${quizData.kokumei.length}`);
console.log(`Loaded shutomei questions: ${quizData.shutomei.length}`);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 接続時に部屋リストを送信
    emitRoomList();

    socket.on('createRoom', ({ roomName, nickname }) => {
        const roomId = generateRoomId();
        // ★変更: プレイヤーオブジェクトに inputMethod を追加
        const player = { id: socket.id, nickname: nickname, isHost: true, isReady: true, wins: 0, inputMethod: null }; 
        const newRoom = {
            id: roomId,
            name: roomName,
            hostId: socket.id,
            players: [player],
            isPlaying: false,
            quizFile: '',
            quizTitle: '',
            gameStartTime: null,
            isVisible: true,
            quizSet: '' // quizSetも追加
        };
        rooms.set(roomId, newRoom);
        socket.join(roomId);
        socket.emit('roomCreated', newRoom);
        io.to(roomId).emit('roomStateUpdate', newRoom); // 作成直後の状態を通知
        emitRoomList(); // 部屋リストを更新
        console.log(`Room created: ${roomId} by ${nickname}`);
    });

    socket.on('joinRoom', ({ roomId, nickname }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('roomError', '指定された部屋が見つかりません。');
            return;
        }
        // ★削除: 最大参加人数のチェックを削除
        // if (room.players.length >= 4) { // 仮の最大プレイヤー数
        //     socket.emit('roomError', 'この部屋は満員です。');
        //     return;
        // }
        if (room.players.some(p => p.id === socket.id)) {
            socket.emit('roomError', 'あなたは既にこの部屋に参加しています。');
            return;
        }

        socket.join(roomId);
        // ★変更: プレイヤーオブジェクトに inputMethod を追加
        const player = { id: socket.id, nickname: nickname, isHost: false, isReady: false, wins: 0, inputMethod: null }; 
        room.players.push(player);
        io.to(roomId).emit('roomStateUpdate', room); // 参加後の状態を通知
        socket.emit('joinedRoom', room); // 参加した本人に部屋情報を送信
        emitRoomList(); // 部屋リストを更新
        console.log(`User ${nickname} joined room: ${roomId}`);
    });

    socket.on('getRoomState', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            io.to(roomId).emit('roomStateUpdate', room);
        }
    });

    socket.on('setReady', ({ roomId, isReady }) => {
        const room = rooms.get(roomId);
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.isReady = isReady;
                io.to(roomId).emit('roomStateUpdate', room);
                console.log(`Player ${player.nickname} in room ${roomId} is now ${isReady ? 'ready' : 'not ready'}`);
            }
        }
    });

    // ★追加: プレイヤーの入力方法を設定するイベントハンドラ
    socket.on('setPlayerInputMethod', ({ roomId, method }) => {
        const room = rooms.get(roomId);
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.inputMethod = method; // プレイヤーオブジェクトに入力方法を保存
                io.to(roomId).emit('roomStateUpdate', room); // 部屋の状態更新を通知
                console.log(`Player ${player.nickname} in room ${roomId} set input method to ${method}`);
            }
        }
    });

    socket.on('leaveRoom', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            room.players = room.players.filter(p => p.id !== socket.id);
            socket.leave(roomId);

            if (room.players.length === 0) {
                rooms.delete(roomId); // プレイヤーがいなくなったら部屋を削除
                console.log(`Room ${roomId} deleted as no players left.`);
            } else {
                // ホストが退室した場合、次のプレイヤーをホストにする
                if (room.hostId === socket.id) {
                    const nextHost = room.players[0];
                    if (nextHost) {
                        room.hostId = nextHost.id;
                        nextHost.isHost = true;
                        nextHost.isReady = true; // 新しいホストは自動的に準備完了
                        console.log(`Player ${nextHost.nickname} is now host of room ${roomId}.`);
                    }
                }
                io.to(roomId).emit('roomStateUpdate', room); // 部屋の状態更新を通知
            }
            emitRoomList(); // 部屋リストを更新
            console.log(`User ${socket.id} left room: ${roomId}`);
        }
    });

    socket.on('selectQuizType', ({ roomId, quizFile, quizTitle, quizSet }) => {
        const room = rooms.get(roomId);
        if (room && room.hostId === socket.id) { // ホストのみ変更可能
            room.quizFile = quizFile;
            room.quizTitle = quizTitle;
            room.quizSet = quizSet; // quizSetも保存
            io.to(roomId).emit('roomStateUpdate', room);
            console.log(`Room ${roomId} quiz type set to: ${quizTitle}`);
        }
    });

    socket.on('toggleRoomVisibility', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room && room.hostId === socket.id) {
            room.isVisible = !room.isVisible;
            io.to(roomId).emit('roomStateUpdate', room);
            emitRoomList(); // 公開状態が変わったのでリスト更新
            console.log(`Room ${roomId} visibility toggled to: ${room.isVisible}`);
        }
    });

    socket.on('startGame', ({ roomId, quizSet, quizTitle, numQuestions }) => {
        const room = rooms.get(roomId);
        if (room && room.hostId === socket.id && room.quizFile) {
            const selectedQuiz = quizData[quizSet];
            if (!selectedQuiz || selectedQuiz.length === 0) {
                console.error(`Quiz data for ${quizSet} not found or empty.`);
                io.to(socket.id).emit('roomError', '選択されたクイズデータが見つかりません。');
                return;
            }

            // 問題をシャッフルし、必要な数だけ取得 (ここでは1問固定)
            const shuffledQuestions = shuffleArray(selectedQuiz);
            const gameQuestions = shuffledQuestions.slice(0, 1); // 常に1問だけ

            room.isPlaying = true;
            room.gameStartTime = Date.now(); // サーバーで正確な開始時間を記録

            // ★変更: gameData にプレイヤーの inputMethod を含める
            const player = room.players.find(p => p.id === socket.id); // ゲームを開始するプレイヤー（ホスト）
            const gameData = {
                questions: gameQuestions,
                quizSet: quizSet,
                quizTitle: quizTitle,
                gameStartTime: room.gameStartTime,
                inputMethod: player ? player.inputMethod : "flick" // ホストの inputMethod を含める
            };

            io.to(roomId).emit('gameStarted', gameData); // ゲーム開始を通知
            io.to(roomId).emit('roomStateUpdate', room); // 部屋の状態更新を通知
            console.log(`Game started in room ${roomId} with quiz: ${quizTitle}`);
        } else if (room && room.hostId !== socket.id) {
            socket.emit('roomError', 'ホストのみがゲームを開始できます。');
        } else if (room && !room.quizFile) {
            socket.emit('roomError', 'ゲームを開始するにはクイズを選択してください。');
        }
    });

    socket.on('playerFinished', ({ roomId, finalTime, score }) => {
        const room = rooms.get(roomId);
        if (room) {
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                player.finalTime = finalTime;
                player.score = score;
                if (score === 1) { // 正解者のみ勝ち数を増やす
                    player.wins = (player.wins || 0) + 1;
                }
                console.log(`Player ${player.nickname} in room ${roomId} finished with time: ${finalTime}, score: ${score}`);

                // 全員が回答したか、一定時間経過したかを確認（簡易的な判定）
                // この例では、全員が回答を送信したらゲーム終了と見なす
                // ★注意: ゲームが1問固定のため、正解者が1人でも出たらゲーム終了とする方が自然な場合もあります。
                //       現在のロジックでは全員がplayerFinishedイベントを送信しないとgameFinishedが発行されません。
                const allPlayersAnswered = room.players.every(p => p.finalTime !== undefined && p.finalTime !== null);

                if (allPlayersAnswered) {
                    io.to(roomId).emit('gameFinished', { players: room.players });
                    console.log(`All players in room ${roomId} have finished. Game ended.`);
                }
            }
        }
    });

    socket.on('returnToLobby', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            room.isPlaying = false;
            room.gameStartTime = null;
            // 各プレイヤーの最終スコアと時間をリセット
            room.players.forEach(p => {
                p.finalTime = null;
                p.score = null;
                p.isReady = p.isHost; // ホストは自動で準備完了
            });
            io.to(roomId).emit('roomStateUpdate', room);
            emitRoomList(); // 部屋リストを更新
            console.log(`Room ${roomId} returned to lobby.`);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // ユーザーが切断したら、参加していた部屋から削除
        rooms.forEach((room, roomId) => {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                room.players.splice(playerIndex, 1);
                socket.leave(roomId);

                if (room.players.length === 0) {
                    rooms.delete(roomId);
                    console.log(`Room ${roomId} deleted as no players left.`);
                } else {
                    // ホストが切断した場合、次のプレイヤーをホストにする
                    if (room.hostId === socket.id) {
                        const nextHost = room.players[0];
                        if (nextHost) {
                            room.hostId = nextHost.id;
                            nextHost.isHost = true;
                            nextHost.isReady = true; // 新しいホストは自動で準備完了
                            console.log(`Player ${nextHost.nickname} is now host of room ${roomId}.`);
                        }
                    }
                    io.to(roomId).emit('roomStateUpdate', room);
                }
                emitRoomList();
                console.log(`User ${socket.id} disconnected from room: ${roomId}`);
            }
        });
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// ヘルパー関数
function generateRoomId() {
    let roomId;
    do {
        // 1000から9999までのランダムな整数を生成
        roomId = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(roomId)); // 既存の部屋IDと重複しないことを確認
    return roomId;
}

function emitRoomList() {
    const publicRooms = Array.from(rooms.values())
        .filter(room => room.isVisible)
        .map(room => ({
            id: room.id,
            name: room.name,
            players: room.players,
            hostName: room.players.find(p => p.id === room.hostId)?.nickname || '不明',
            isPlaying: room.isPlaying,
            // ★変更: 最大参加人数をnullまたは削除 (クライアント側で表示しない限りどちらでもOK)
            maxPlayers: null 
        }));
    io.emit('roomList', publicRooms);
}

function shuffleArray(array) {
    const newArray = Array.from(array);
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}