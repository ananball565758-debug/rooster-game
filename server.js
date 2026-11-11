const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ฝังหน้าเว็บ HTML ทั้งหมดไว้ในเซิร์ฟเวอร์โดยตรง ไม่ต้องแยกไฟล์
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ROOSTER ARENA - ไก่ชนสายพันธุ์ดุ</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #111;
            color: #fff;
            font-family: 'Kanit', sans-serif, Arial;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            overflow: hidden;
        }
        h1 { margin: 5px; color: #ffcc00; text-shadow: 2px 2px #ff0000; }
        #game-container {
            position: relative;
            box-shadow: 0 0 20px rgba(255, 0, 0, 0.6);
            border: 4px solid #333;
            border-radius: 8px;
            background: #222;
        }
        canvas {
            display: block;
            background: linear-gradient(to bottom, #4a90e2, #e0f7fa);
        }
        #ui {
            margin-top: 10px;
            font-size: 18px;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <h1>🐓 ROOSTER ARENA 🐓</h1>
    <div id="game-container">
        <canvas id="gameCanvas" width="900" height="550"></canvas>
    </div>
    <div id="ui">กำลังเชื่อมต่อเข้าสู่สังเวียน...</div>

    <script src="/socket.io/socket.io.js"></script>
    <script>
        const socket = io();
        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');
        const uiDiv = document.getElementById('ui');

        let roomId = "main-room";
        let myRole = null;
        let players = {};
        let gameStarted = false;

        socket.emit('join-room', roomId);

        socket.on('assigned-role', (data) => {
            myRole = data.role;
            uiDiv.innerHTML = "คุณได้รับบทเป็น: " + (myRole === 'p1' ? '🔴 ไก่แดง (P1)' : '🔵 ไก่เขียว (P2)') + " | รอผู้เล่นคนที่ 2...";
        });

        socket.on('room-full', () => {
            uiDiv.innerHTML = "❌ ห้องเต็มแล้ว! มีผู้เล่นครบ 2 คนแล้ว";
        });

        socket.on('update-players', (serverPlayers) => {
            players = serverPlayers;
        });

        socket.on('start-countdown', () => {
            gameStarted = true;
            uiDiv.innerHTML = "🔥 สังเวียนเดือด! เริ่มการประลองได้!";
        });

        socket.on('apply-hit', (data) => {
            // เอฟเฟกต์โดนตี
        });

        socket.on('opponent-disconnected', () => {
            gameStarted = false;
            uiDiv.innerHTML = "⚠️ คู่ต่อสู้หลุดจากการเชื่อมต่อ รอผู้เล่นใหม่...";
        });

        let keys = {};
        window.addEventListener('keydown', (e) => { keys[e.key] = true; });
        window.addEventListener('keyup', (e) => { keys[e.key] = false; });

        function update() {
            if (!gameStarted || !myRole || !players[socket.id]) return;
            let p = players[socket.id];

            let speed = 5;
            if (keys['ArrowLeft'] || keys['a']) { p.x -= speed; p.facingRight = false; }
            if (keys['ArrowRight'] || keys['d']) { p.x += speed; p.facingRight = true; }

            // ส่งค่าตำแหน่งให้เซิร์ฟเวอร์
            socket.emit('player-action', {
                roomId: roomId,
                x: p.x,
                y: p.y,
                hp: p.hp,
                energy: p.energy,
                facingRight: p.facingRight,
                isBlocking: false,
                isAttacking: false,
                isUltimate: false,
                attackType: null
            });
        }

        function draw() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // วาดพื้นสนาม
            ctx.fillStyle = '#555';
            ctx.fillRect(0, 500, canvas.width, 50);

            // วาดตัวละครผู้เล่นทั้งหมด
            for (let id in players) {
                let p = players[id];
                ctx.fillStyle = p.role === 'p1' ? '#ff3333' : '#3333ff';
                ctx.fillRect(p.x - 25, p.y - 50, 50, 50);

                // หลอดเลือด
                ctx.fillStyle = '#000';
                ctx.fillRect(p.x - 30, p.y - 70, 60, 8);
                ctx.fillStyle = '#00ff00';
                ctx.fillRect(p.x - 30, p.y - 70, (p.hp / p.maxHp) * 60, 8);
            }
        }

        function loop() {
            update();
            draw();
            requestAnimationFrame(loop);
        }
        loop();
    </script>
</body>
</html>
    `);
});

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
            p.hp = data.hp;
            p.energy = data.energy;
            p.facingRight = data.facingRight;
            p.isBlocking = data.isBlocking;
            p.isAttacking = data.isAttacking;
            p.isUltimate = data.isUltimate;
            p.attackType = data.attackType;

            socket.to(roomId).emit('update-players', rooms[roomId].players);
        }
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
    console.log(`Multiplayer server running on port ${PORT}`);
});