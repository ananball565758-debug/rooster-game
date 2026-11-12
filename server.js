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

        // กำหนดสถานะเลือดและพิกัดเริ่มต้นบน Server ตรงนี้ที่เดียว
        room.players[socket.id] = { 
            role: role, 
            x: role === 'p1' ? 200 : 750, 
            y: 460, 
            hp: 250, 
            maxHp: 250, 
            energy: 0,
            facingRight: role === 'p1' ? true : false,
            lastAtk: 0
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

    // รับตำแหน่งการเดินธรรมดา (ไม่ยุ่งกับเลือด)
    socket.on('player-action', (data) => {
        let room = rooms[data.roomId];
        if (room && room.players[socket.id]) {
            let p = room.players[socket.id];
            p.x = data.x;
            p.y = data.y;
            p.facingRight = data.facingRight;
            p.isBlocking = data.isBlocking;
            p.isAttacking = data.isAttacking;
            p.isUltimate = data.isUltimate;
            p.attackType = data.attackType;

            socket.to(data.roomId).emit('update-players', room.players);
        }
    });

    // ⭐ Server เป็นคนกลางคำนวณการตีและหักเลือดจริงแบบแม่นยำที่สุด
    socket.on('player-attack', (data) => {
        let room = rooms[data.roomId];
        if (!room) return;

        let attackerSocketId = socket.id;
        let targetSocketId = (attackerSocketId === room.p1) ? room.p2 : room.p1;
        
        let attacker = room.players[attackerSocketId];
        let target = room.players[targetSocketId];

        if (!attacker || !target) return;

        // ป้องกันการรัวคำสั่งโจมตีถี่เกินไป (Cooldown 300ms)
        let now = Date.now();
        if (now - attacker.lastAtk < 300) return;
        attacker.lastAtk = now;

        let isUlt = data.attackType === 'ultimate';
        let dmg = isUlt ? 40 : (data.attackType === 'jumpkick' ? 9 : 5);

        // Server ตรวจสอบระยะห่าง (ให้กว้างขึ้นหน่อยเผื่อดีเลย์เน็ต: 150 พิกเซล)
        let distance = Math.abs(attacker.x - target.x);
        if (distance <= 160) { 
            target.hp = Math.max(0, target.hp - dmg);

            if (!isUlt) {
                attacker.energy = Math.min(100, (attacker.energy || 0) + 25);
            } else {
                attacker.energy = 0;
            }

            let targetRole = (targetSocketId === room.p1) ? 'p1' : 'p2';

            // ส่งค่าเลือดที่ถูกต้องที่สุดจาก Server ไปอัปเดตหน้าจอทั้งสองฝั่งพร้อมกันเป๊ะๆ
            io.to(data.roomId).emit('apply-hit', { 
                targetRole: targetRole, 
                damage: dmg,
                targetHp: target.hp,
                attackerEnergy: attacker.energy,
                isUltimate: isUlt 
            });
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