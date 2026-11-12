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

// เก็บข้อมูลห้องและผู้เล่น
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
            // ถ้าเต็มหรือไอดีซ้ำ
            socket.emit('room-full');
            return;
        }

        room.players[socket.id] = { role: role, x: role === 'p1' ? 200 : 750, hp: 250, maxHp: 250, energy: 0 };
        socket.emit('assigned-role', { role: role });

        console.log(`ห้อง ${roomId} -> P1: ${room.p1 ? 'มีแล้ว' : 'ว่าง'}, P2: ${room.p2 ? 'มีแล้ว' : 'ว่าง'}`);

        // ถ้ามีผู้เล่นครบ 2 คนแล้ว เริ่มนับถอยหลังเข้าเกมและรัน Timer กลางจาก Server
        if (room.p1 && room.p2) {
            console.log(`เริ่มเกมในห้อง: ${roomId}`);
            io.to(roomId).emit('start-countdown');

            // เริ่มระบบจับเวลาหลังจากนับถอยหลัง 3 วิเสร็จ
            setTimeout(() => {
                if (rooms[roomId] && !rooms[roomId].timer) {
                    rooms[roomId].timeLeft = 60;
                    rooms[roomId].timer = setInterval(() => {
                        if (rooms[roomId] && rooms[roomId].timeLeft > 0) {
                            rooms[roomId].timeLeft--;
                            // ส่งเวลาปัจจุบันให้ผู้เล่นทุกคนในห้องตรงกันเป๊ะ
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
            }, 3000); // ดีเลย์ 3 วินาทีรอช่วงนับถอยหลัง FIGHT!
        }
    });

    socket.on('player-action', (data) => {
        let room = rooms[data.roomId];
        if (room && room.players[socket.id]) {
            let p = room.players[socket.id];
            p.x = data.x;
            p.y = data.y;
            // ไม่รับค่า hp และ energy ตรงๆ จาก Client เพื่อป้องกันข้อมูลตีกัน
            p.maxHp = data.maxHp;
            p.facingRight = data.facingRight;
            p.isBlocking = data.isBlocking;
            p.isAttacking = data.isAttacking;
            p.isUltimate = data.isUltimate;
            p.attackType = data.attackType;

            socket.to(data.roomId).emit('update-players', room.players);
        }
    });

    socket.on('player-attack', (data) => {
        let room = rooms[data.roomId];
        if (room && room.players[socket.id]) {
            let attacker = room.players[socket.id];
            let targetSocketId = (socket.id === room.p1) ? room.p2 : room.p1;
            let target = room.players[targetSocketId];

            if (!target) return;

            // ⭐ ให้ Server เป็นคนคำนวณดาเมจและเกจ SP ทั้งหมด เพื่อความถูกต้องตรงกัน
            if (data.attackType !== 'ultimate') {
                attacker.energy = Math.min(100, (attacker.energy || 0) + 25);
            } else {
                attacker.energy = 0;
            }

            let dmg = data.attackType === 'ultimate' ? 40 : (data.attackType === 'jumpkick' ? 9 : 5);
            target.hp = Math.max(0, target.hp - dmg);

            let targetRole = (socket.id === room.p1) ? 'p2' : 'p1';
            
            // ส่งผลลัพธ์การโจมตีกลับไปให้ทุกจอแสดงผลเอฟเฟกต์ตรงกัน
            io.to(data.roomId).emit('apply-hit', { 
                targetRole: targetRole, 
                damage: dmg, 
                isUltimate: data.attackType === 'ultimate' 
            });

            // อัปเดตสถานะเลือดและเกจใหม่ให้ผู้เล่นทุกคนในห้อง
            io.to(data.roomId).emit('update-players', room.players);
        }
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