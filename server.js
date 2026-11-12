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
            rooms[roomId] = { p1: null, p2: null, players: {}, timeLeft: 60, timer: null };
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

        // เก็บพิกัดเริ่มต้นแยกฝั่งชัดเจน
        room.players[socket.id] = { 
            role: role, 
            x: role === 'p1' ? 200 : 750, 
            y: 460, 
            facingRight: role === 'p1' ? true : false
        };
        
        socket.emit('assigned-role', { role: role });

        if (room.p1 && room.p2) {
            io.to(roomId).emit('start-countdown');

            setTimeout(() => {
                if (rooms[roomId] && !rooms[roomId].timer) {
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
            }, 3000);
        }
    });

    // รับตำแหน่งและการเคลื่อนไหวเพื่อส่งอ