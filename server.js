const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// เสิร์ฟไฟล์ Static จากโฟลเดอร์ปัจจุบัน (เพื่อให้โหลดหน้า index.html และไฟล์เกมได้)
app.use(express.static(path.join(__dirname)));

// เส้นทางหลักสำหรับเข้าเกม
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// เก็บข้อมูลห้องและผู้เล่น
const rooms = {};

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // ผู้เล่นสร้างหรือเข้าร่วมห้อง
    socket.on('join-room', (roomId) => {
        if (!rooms[roomId]) {
            rooms[roomId] = { players: [] };
        }

        const room = rooms[roomId];

        if (room.players.length < 2) {
            room.players.push(socket.id);
            socket.join(roomId);
            
            const role = room.players.length === 1 ? 'p1' : 'p2';
            socket.emit('assigned-role', { role, roomId });

            console.log(`Player ${socket.id} joined room ${roomId} as ${role}`);

            // ถ้าห้องเต็ม (ครบ 2 คน) แจ้งเริ่มเกม
            if (room.players.length === 2) {
                io.to(roomId).delay = setTimeout(() => {
                    io.to(roomId).emit('start-match');
                }, 1000);
            }
        } else {
            socket.emit('room-full');
        }
    });

    // รับข้อมูลการเคลื่อนไหวหรือการโจมตี แล้วส่งต่อให้อีกฝ่ายในห้อง
    socket.on('player-action', (data) => {
        socket.to(data.roomId).emit('opponent-action', data);
    });

    // จัดการเมื่อผู้เล่นหลุดการเชื่อมต่อหรือออกจากห้อง
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        for (const roomId in rooms) {
            const room = rooms[roomId];
            const index = room.players.indexOf(socket.id);
            if (index !== -1) {
                room.players.splice(index, 1);
                io.to(roomId).emit('opponent-disconnected');
                if (room.players.length === 0) {
                    delete rooms[roomId];
                }
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Rooster Fight Arena Server is running on port ${PORT}`);
});