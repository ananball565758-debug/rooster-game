const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let rooms = {};

io.on('connection', (socket) => {
    console.log('ผู้เล่นเชื่อมต่อ:', socket.id);

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = { p1: null, p2: null, timeLeft: 60, timer: null };
        }

        let room = rooms[roomId];
        let role = '';

        if (!room.p1) {
            room.p1 = socket.id;
            role = 'p1';
        } else if (!room.p2 && room.p1 !== socket.id) {
            room.p2 = socket.id;
            role = 'p2';
        } else {
            socket.emit('room-full');
            return;
        }
        
        socket.emit('assigned-role', { role: role });

        if (room.p1 && room.p2) {
            io.to(roomId).emit('start-match-instantly');

            if (!rooms[roomId].timer) {
                rooms[roomId].timeLeft = 60;
                rooms[roomId].timer = setInterval(() => {
                    if (rooms[roomId] && rooms[roomId].timeLeft > 0) {
                        rooms[roomId].timeLeft--;
                        io.to(roomId).emit('update-timer', rooms[roomId].timeLeft);
                    } else {
                        if (rooms[roomId] && rooms[roomId].timer) {
                            clearInterval(rooms[roomId].timer);
                            rooms[roomId].timer = null;
                        }
                        io.to(roomId).emit('time-up');
                    }
                }, 1000);
            }
        }
    });

    socket.on('player-action', (data) => {
        socket.to(data.roomId).emit('update-players', data);
    });

    socket.on('force-take-damage', (data) => {
        socket.to(data.roomId).emit('sync-damage', data);
    });

    socket.on('disconnect', () => {
        console.log('ผู้เล่นตัดการเชื่อมต่อ:', socket.id);
        for (let roomId in rooms) {
            let room = rooms[roomId];
            if (room.p1 === socket.id || room.p2 === socket.id) {
                if (room.timer) clearInterval(room.timer);
                delete rooms[roomId];
                io.to(roomId).emit('room-full');
            }
        }
    });
});

server.listen(3000, () => {
    console.log('Server เปิดใช้งานแล้วที่ http://localhost:3000');
});