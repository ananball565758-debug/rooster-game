const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});

const rooms = {}; // เก็บข้อมูลห้องทั้งหมด

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // 1. สร้างห้องใหม่
    socket.on('createRoom', ({ playerName, maxPlayers }) => {
        const roomId = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[roomId] = {
            host: socket.id,
            max: maxPlayers,
            players: [{ id: socket.id, name: playerName || 'HostCat', color: '#00f3ff' }],
            isStarted: false
        };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, players: rooms[roomId].players, playerIndex: 0 });
    });

    // 2. เข้าร่วมห้องด้วยรหัส
    socket.on('joinRoom', ({ roomId, playerName }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('errorMsg', 'ไม่พบห้องนี้ กรุณาตรวจสอบรหัสอีกครั้ง');
            return;
        }
        if (room.players.length >= room.max) {
            socket.emit('errorMsg', 'ห้องนี้เต็มแล้ว!');
            return;
        }
        if (room.isStarted) {
            socket.emit('errorMsg', 'เกมในห้องนี้เริ่มไปแล้ว');
            return;
        }

        const colors = ['#00f3ff', '#ff0055', '#ffe600', '#00ff66'];
        const playerIndex = room.players.length;
        
        room.players.push({
            id: socket.id,
            name: playerName || `Cat_${playerIndex + 1}`,
            color: colors[playerIndex]
        });

        socket.join(roomId);
        socket.emit('roomJoined', { roomId, players: room.players, playerIndex });
        
        io.to(roomId).emit('updateLobby', { players: room.players });
    });

    // 3. หัวหน้าห้องกดเริ่มเกม
    socket.on('startGame', (roomId) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id) {
            room.isStarted = true;
            io.to(roomId).emit('gameStarted');
        }
    });

    // 4. ผู้เล่นกดกระโดด ส่งสัญญาณบอกคนอื่นในห้อง
    socket.on('playerJump', (roomId) => {
        socket.to(roomId).emit('peerJump', socket.id);
    });

    // 5. จัดการเมื่อผู้เล่นหลุดการเชื่อมต่อ
    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const index = room.players.findIndex(p => p.id === socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                if (room.players.length === 0) {
                    delete rooms[roomId];
                } else {
                    io.to(roomId).emit('updateLobby', { players: room.players });
                }
                break;
            }
        }
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Multiplayer server running on port ${PORT}`);
});