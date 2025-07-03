const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

const rooms = new Map();
const quizData = {};

function loadQuizData(filename) {
    try {
        const filePath = path.join(__dirname, filename);
        const data = fs.readFileSync(filePath, 'utf8');
        const lines = data.split(/\r?\n/).filter(line => line.trim() !== '');
        return lines.map(line => {
            const parts = line.split(',');
            if (parts.length >= 2) {
                return { q: parts[0], a: parts[1] };
            }
            return null;
        }).filter(item => item !== null);
    } catch (error) {
        console.error(`Failed to load quiz data from ${filename}:`, error);
        return [];
    }
}

quizData.kokumei = loadQuizData('kokumei.csv');
quizData.shutomei = loadQuizData('shutomei.csv');

console.log(`Loaded kokumei questions: ${quizData.kokumei.length}`);
console.log(`Loaded shutomei questions: ${quizData.shutomei.length}`);

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    emitRoomList();

    socket.on('createRoom', ({ roomName, nickname }) => {
        const roomId = generateRoomId();
        const player = { id: socket.id, nickname, isHost: true, isReady: true, wins: 0, inputMethod: null };
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
            quizSet: ''
        };
        rooms.set(roomId, newRoom);
        socket.join(roomId);
        socket.emit('roomCreated', newRoom);
        io.to(roomId).emit('roomStateUpdate', newRoom);
        emitRoomList();
    });

    socket.on('joinRoom', ({ roomId, nickname }) => {
        const room = rooms.get(roomId);
        if (!room) return socket.emit('roomError', '指定された部屋が見つかりません。');
        if (room.players.some(p => p.id === socket.id)) return socket.emit('roomError', '既に参加しています。');

        const player = { id: socket.id, nickname, isHost: false, isReady: false, wins: 0, inputMethod: null };
        room.players.push(player);
        socket.join(roomId);
        io.to(roomId).emit('roomStateUpdate', room);
        socket.emit('joinedRoom', room);
        emitRoomList();
    });

    socket.on('getRoomState', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) io.to(roomId).emit('roomStateUpdate', room);
    });

    socket.on('setReady', ({ roomId, isReady }) => {
        const room = rooms.get(roomId);
        const player = room?.players.find(p => p.id === socket.id);
        if (player) {
            player.isReady = isReady;
            io.to(roomId).emit('roomStateUpdate', room);
        }
    });

    socket.on('setPlayerInputMethod', ({ roomId, method }) => {
        const room = rooms.get(roomId);
        const player = room?.players.find(p => p.id === socket.id);
        if (player) {
            player.inputMethod = method;
            io.to(roomId).emit('roomStateUpdate', room);
        }
    });

    socket.on('leaveRoom', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        room.players = room.players.filter(p => p.id !== socket.id);
        socket.leave(roomId);

        if (room.players.length === 0) {
            rooms.delete(roomId);
        } else {
            if (room.hostId === socket.id) {
                const nextHost = room.players[0];
                room.hostId = nextHost.id;
                nextHost.isHost = true;
                nextHost.isReady = true;
            }
            io.to(roomId).emit('roomStateUpdate', room);
        }
        emitRoomList();
    });

    socket.on('selectQuizType', ({ roomId, quizFile, quizTitle, quizSet }) => {
        const room = rooms.get(roomId);
        if (room && room.hostId === socket.id) {
            room.quizFile = quizFile;
            room.quizTitle = quizTitle;
            room.quizSet = quizSet;
            io.to(roomId).emit('roomStateUpdate', room);
            io.to(roomId).emit('quizModeSelected', quizSet);
        }
    });

    socket.on('toggleRoomVisibility', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room && room.hostId === socket.id) {
            room.isVisible = !room.isVisible;
            io.to(roomId).emit('roomStateUpdate', room);
            emitRoomList();
        }
    });

    socket.on('startGame', ({ roomId, quizSet, quizTitle, numQuestions }) => {
        const room = rooms.get(roomId);
        if (room && room.hostId === socket.id && room.quizFile) {
            const selectedQuiz = quizData[quizSet];
            if (!selectedQuiz || selectedQuiz.length === 0) {
                socket.emit('roomError', '選択されたクイズデータが見つかりません。');
                return;
            }

            const shuffledQuestions = shuffleArray(selectedQuiz);
            const gameQuestions = shuffledQuestions.slice(0, 1);

            room.isPlaying = true;
            room.gameStartTime = Date.now();

            // ゲーム開始時にplayerの回答情報をクリアする
            room.players.forEach(p => {
                p.finalTime = null;
                p.score = null;
            });

            const host = room.players.find(p => p.id === socket.id);
            const gameData = {
                questions: gameQuestions,
                quizSet,
                quizTitle,
                gameStartTime: room.gameStartTime,
                inputMethod: host?.inputMethod || 'flick'
            };

            io.to(roomId).emit('gameStarted', gameData);
            io.to(roomId).emit('roomStateUpdate', room);
        }
    });

    socket.on('playerFinished', ({ roomId, finalTime, score }) => {
        const room = rooms.get(roomId);
        const player = room?.players.find(p => p.id === socket.id);
        if (player) {
            player.finalTime = finalTime;
            player.score = score;
            if (score === 1) player.wins = (player.wins || 0) + 1;

            if (score === 1) {
                // 誰かが正解したら即ゲーム終了処理
                room.isPlaying = false;
                room.gameStartTime = null;

                io.to(roomId).emit('gameFinished', { players: room.players });

                // プレイヤーの回答状態はゲーム終了でリセットしない（ロビーに戻るまで状態保持）
                io.to(roomId).emit('roomStateUpdate', room);
            } else {
                // 正解者がまだいない場合は特に何もしない
                // もしくは全員回答済みかチェックしても良いが、今回はスコア1で即終了のため不要
            }
        }
    });

    socket.on('returnToLobby', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (room) {
            room.isPlaying = false;
            room.gameStartTime = null;
            room.players.forEach(p => {
                p.finalTime = null;
                p.score = null;
                p.isReady = p.isHost;
            });
            io.to(roomId).emit('roomStateUpdate', room);
            emitRoomList();
        }
    });

    socket.on('disconnect', () => {
        rooms.forEach((room, roomId) => {
            const idx = room.players.findIndex(p => p.id === socket.id);
            if (idx !== -1) {
                room.players.splice(idx, 1);
                socket.leave(roomId);

                if (room.players.length === 0) {
                    rooms.delete(roomId);
                } else {
                    if (room.hostId === socket.id) {
                        const newHost = room.players[0];
                        room.hostId = newHost.id;
                        newHost.isHost = true;
                        newHost.isReady = true;
                    }
                    io.to(roomId).emit('roomStateUpdate', room);
                }
                emitRoomList();
            }
        });
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

function generateRoomId() {
    let roomId;
    do {
        roomId = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(roomId));
    return roomId;
}

function emitRoomList() {
    const publicRooms = Array.from(rooms.values()).filter(r => r.isVisible).map(r => ({
        id: r.id,
        name: r.name,
        players: r.players,
        hostName: r.players.find(p => p.id === r.hostId)?.nickname || '不明',
        isPlaying: r.isPlaying,
        maxPlayers: null
    }));
    io.emit('roomList', publicRooms);
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
