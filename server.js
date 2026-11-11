const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let rooms = {};

io.on('connection', (socket) => {
    console.log('มีผู้เล่นเชื่อมต่อเข้ามา:', socket.id);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        if (!rooms[roomId]) {
            rooms[roomId] = { players: {}, gameStarted: false };
        }

        let room = rooms[roomId];
        let existingIds = Object.keys(room.players);

        if (existingIds.length >= 2) {
            socket.emit('room-full');
            return;
        }

        let role = existingIds.length === 0 ? 'p1' : 'p2';
        
        room.players[socket.id] = { 
            id: socket.id,
            role: role, 
            x: role === 'p1' ? 200 : 750, 
            y: 460, 
            hp: 250, 
            maxHp: 250,
            energy: 0,
            facingRight: role === 'p1',
            isBlocking: false,
            isAttacking: false,
            isUltimate: false,
            attackType: null
        };

        socket.emit('assigned-role', { role, roomId });
        io.to(roomId).emit('update-players', room.players);

        if (Object.keys(room.players).length === 2 && !room.gameStarted) {
            room.gameStarted = true;
            io.to(roomId).emit('start-countdown');
        }
    });

    socket.on('player-action', (data) => {
        let roomId = data.roomId;
        if (rooms[roomId] && rooms[roomId].players[socket.id]) {
            let p = rooms[roomId].players[socket.id];
            p.x = data.x;
            p.y = data.y;
            // ไม่ทับค่า hp/energy โดยตรงจาก action ทั่วไป ป้องกันเลือดดีดกลับ
            p.facingRight = data.facingRight;
            p.isBlocking = data.isBlocking;
            p.isAttacking = data.isAttacking;
            p.isUltimate = data.isUltimate;
            p.attackType = data.attackType;

            socket.to(roomId).emit('update-players', rooms[roomId].players);
        }
    });

    socket.on('player-attack', (data) => {
        let roomId = data.roomId;
        if (!rooms[roomId]) return;
        
        let room = rooms[roomId];
        let attacker = room.players[socket.id];
        if (!attacker) return;

        let opponentSocketId = Object.keys(room.players).find(id => id !== socket.id);
        if (!opponentSocketId) return;
        let opponent = room.players[opponentSocketId];

        let damage = data.damage || (data.attackType === 'ultimate' ? 75 : (data.attackType === 'jumpkick' ? 18 : 10));
        let isUlt = (data.attackType === 'ultimate');

        opponent.hp = Math.max(0, opponent.hp - damage);
        attacker.energy = Math.min(100, attacker.energy + (isUlt ? 0 : 18));

        io.to(roomId).emit('apply-hit', {
            targetRole: opponent.role,
            damage: damage,
            isUltimate: isUlt,
            x: opponent.x,
            y: opponent.y
        });
        io.to(roomId).emit('update-players', room.players);
    });

    socket.on('disconnect', () => {
        console.log('ผู้เล่นออกจากการเชื่อมต่อ:', socket.id);
        for (let roomId in rooms) {
            let room = rooms[roomId];
            if (room.players[socket.id]) {
                delete room.players[socket.id];
                room.gameStarted = false;
                io.to(roomId).emit('update-players', room.players);
                io.to(roomId).emit('opponent-disconnected');
                if (Object.keys(room.players).length === 0) {
                    delete rooms[roomId];
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`เซิร์ฟเวอร์เกมออนไลน์กำลังทำงานที่พอร์ต: ${PORT}`);
});