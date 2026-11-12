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

        // กำหนดค่าเริ่มต้นของผู้เล่นแต่ละคนบน Server
        room.players[socket.id] = { 
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

        socket.emit('assigned-role', { role: role });

        // เมื่อครบ 2 คน เริ่มเกมและจับเวลา
        if (room.p1 && room.p2) {
            io.to(roomId).emit('start-match-instantly');

            if (!room.timer) {
                room.timeLeft = 60;
                room.timer = setInterval(() => {
                    if (room && room.timeLeft > 0) {
                        room.timeLeft--;
                        io.to(roomId).emit('update-timer', room.timeLeft);
                    } else {
                        if (room && room.timer) {
                            clearInterval(room.timer);
                            room.timer = null;
                        }
                        io.to(roomId).emit('time-up');
                    }
                }, 1000);
            }
        }
    });

    // รับตำแหน่งและการเคลื่อนไหวจากผู้เล่น แล้วกระจายให้อีกฝั่งเห็น
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

            socket.to(data.roomId).emit('update-players', {
                role: p.role,
                x: p.x,
                y: p.y,
                facingRight: p.facingRight,
                isBlocking: p.isBlocking,
                isAttacking: p.isAttacking,
                isUltimate: p.isUltimate,
                attackType: p.attackType
            });
        }
    });

    // ให้ Server เป็นคนกลางคำนวณการหักเลือด ป้องกันเลือดเด้งไม่ตรงกัน
    socket.on('request-damage', (data) => {
        let room = rooms[data.roomId];
        if (!room) return;

        let targetSocketId = (data.targetRole === 'p1') ? room.p1 : room.p2;
        let attackerSocketId = (data.targetRole === 'p1') ? room.p2 : room.p1;

        let target = room.players[targetSocketId];
        let attacker = room.players[attackerSocketId];

        if (target && attacker) {
            // หักเลือดบน Server
            target.hp = Math.max(0, target.hp - data.damage);
            
            // สะสมเกจพลัง (ถ้าไม่ใช่ท่าไม้ตาย)
            if (!data.isUltimate) {
                attacker.energy = Math.min(100, (attacker.energy || 0) + 25);
            } else {
                attacker.energy = 0;
            }

            // ส่งผลลัพธ์เลือดและเกจที่ถูกต้องกลับไปให้ผู้เล่นทุกคนในห้องตรงกันเป๊ะๆ
            io.to(data.roomId).emit('sync-exact-state', {
                targetRole: target.role,
                targetHp: target.hp,
                attackerRole: attacker.role,
                attackerEnergy: attacker.energy,
                damage: data.damage,
                knockback: data.knockback,
                isUltimate: data.isUltimate,
                isHeavy: data.isHeavy
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