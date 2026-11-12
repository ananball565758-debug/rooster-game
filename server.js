const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// เสิร์ฟหน้าเว็บ HTML โค้ดเดี่ยวโดยตรงผ่าน Route หลัก
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rooster Fight Arena</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #1a1a1a;
            font-family: Arial, sans-serif;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        #game-container {
            width: 1000px;
            height: 680px;
            background: #2b2b2b;
            border: 4px solid #444;
            border-radius: 8px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.7);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        #menu-screen {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            height: 100%;
            text-align: center;
            padding: 20px;
        }
        #menu-screen h1 {
            font-size: 3rem;
            color: #ffcc00;
            margin-bottom: 10px;
            text-shadow: 2px 2px #ff3300;
        }
        .input-group {
            margin-top: 20px;
        }
        input[type="text"] {
            padding: 12px 18px;
            font-size: 1rem;
            border: none;
            border-radius: 4px 0 0 4px;
            outline: none;
            width: 220px;
        }
        button {
            padding: 12px 24px;
            font-size: 1rem;
            background-color: #ff3300;
            color: white;
            border: none;
            border-radius: 0 4px 4px 0;
            cursor: pointer;
            font-weight: bold;
            transition: background 0.2s;
        }
        button:hover {
            background-color: #cc2900;
        }
        .hidden {
            display: none !important;
        }
        #play-screen {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        #ui-bar {
            height: 80px;
            background: #111;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 20px;
            border-bottom: 2px solid #333;
        }
        .player-hud {
            width: 380px;
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .health-bar {
            width: 100%;
            height: 18px;
            background: #444;
            border-radius: 9px;
            overflow: hidden;
            border: 2px solid #666;
        }
        .hp-fill {
            width: 100%;
            height: 100%;
            background: #2ecc71;
            transition: width 0.1s linear;
        }
        .energy-bar {
            width: 100%;
            height: 8px;
            background: #333;
            border-radius: 4px;
            overflow: hidden;
        }
        .energy-fill {
            width: 0%;
            height: 100%;
            background: #3498db;
            transition: width 0.1s linear;
        }
        #vs-text {
            font-size: 1.5rem;
            font-weight: bold;
            color: #e74c3c;
        }
        #gameCanvas {
            background: linear-gradient(to bottom, #34495e, #2c3e50);
            display: block;
        }
        #controls-hint {
            height: 40px;
            background: #111;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 0.85rem;
            color: #aaa;
        }
    </style>
    <script src="/socket.io/socket.io.js"></script>
</head>
<body>
    <div id="game-container">
        <div id="menu-screen">
            <h1>Rooster Fight Arena</h1>
            <p>เกมต่อสู้ไก่ชนออนไลน์แบบ Real-time</p>
            <div class="input-group">
                <input type="text" id="room-input" placeholder="กรอกชื่อห้อง (เช่น room1)">
                <button id="join-btn">เข้าสู่ห้องแข่งขัน</button>
            </div>
            <div id="status-message"></div>
        </div>

        <div id="play-screen" class="hidden">
            <div id="ui-bar">
                <div class="player-hud" id="p1-hud">
                    <span id="p1-name">Player 1</span>
                    <div class="health-bar"><div id="p1-hp" class="hp-fill"></div></div>
                    <div class="energy-bar"><div id="p1-energy" class="energy-fill"></div></div>
                </div>
                <div id="vs-text">VS</div>
                <div class="player-hud" id="p2-hud">
                    <span id="p2-name">Player 2</span>
                    <div class="health-bar"><div id="p2-hp" class="hp-fill"></div></div>
                    <div class="energy-bar"><div id="p2-energy" class="energy-fill"></div></div>
                </div>
            </div>

            <canvas id="gameCanvas" width="1000" height="600"></canvas>
            
            <div id="controls-hint">
                [A / D] เดินซ้าย-ขวา | [W] กระโดด | [J] โจมตีปกติ | [K] กระโดดเตะ | [L] ป้องกัน | [I] ท่าไม้ตาย (Ultimate)
            </div>
        </div>
    </div>

    <script>
        const socket = io();

        const menuScreen = document.getElementById('menu-screen');
        const playScreen = document.getElementById('play-screen');
        const roomInput = document.getElementById('room-input');
        const joinBtn = document.getElementById('join-btn');
        const statusMsg = document.getElementById('status-message');

        const canvas = document.getElementById('gameCanvas');
        const ctx = canvas.getContext('2d');

        let myRole = null;
        let currentRoom = null;
        let players = {};
        let gameStarted = false;
        let countdownTimer = 3;
        let isCountingDown = false;

        const keys = { w: false, a: false, d: false };

        joinBtn.addEventListener('click', () => {
            const roomId = roomInput.value.trim();
            if (!roomId) {
                statusMsg.innerText = 'กรุณากรอกชื่อห้องก่อน!';
                statusMsg.style.color = '#e74c3c';
                return;
            }
            currentRoom = roomId;
            statusMsg.innerText = 'กำลังเชื่อมต่อเข้าสู่ห้อง...';
            socket.emit('join-room', roomId);
        });

        socket.on('room-full', () => {
            statusMsg.innerText = 'ห้องนี้เต็มแล้ว (มีผู้เล่นครบ 2 คน)';
            statusMsg.style.color = '#e74c3c';
        });

        socket.on('assigned-role', (data) => {
            myRole = data.role;
            menuScreen.classList.add('hidden');
            playScreen.classList.remove('hidden');
            statusMsg.innerText = \`คุณคือบทบาท: \${myRole.toUpperCase()}\`;
        });

        socket.on('update-players', (serverPlayers) => {
            players = serverPlayers;
        });

        socket.on('start-countdown', () => {
            gameStarted = true;
            isCountingDown = true;
            countdownTimer = 3;
            let timerInterval = setInterval(() => {
                countdownTimer--;
                if (countdownTimer <= 0) {
                    clearInterval(timerInterval);
                    isCountingDown = false;
                }
            }, 1000);
        });

        socket.on('opponent-disconnected', () => {
            alert('คู่ต่อสู้ออกจากเกมแล้ว!');
            location.reload();
        });

        window.addEventListener('keydown', (e) => {
            if (!gameStarted || isCountingDown) return;
            if (e.key === 'w' || e.key === 'W') keys.w = true;
            if (e.key === 'a' || e.key === 'A') keys.a = true;
            if (e.key === 'd' || e.key === 'D') keys.d = true;

            let myPlayer = Object.values(players).find(p => p.role === myRole);
            if (!myPlayer) return;

            if (e.key === 'j' || e.key === 'J') {
                myPlayer.isAttacking = true;
                myPlayer.attackType = 'normal';
                socket.emit('player-attack', { roomId: currentRoom, attackType: 'normal' });
                setTimeout(() => { myPlayer.isAttacking = false; }, 200);
            }
            if (e.key === 'k' || e.key === 'K') {
                myPlayer.isAttacking = true;
                myPlayer.attackType = 'jumpkick';
                socket.emit('player-attack', { roomId: currentRoom, attackType: 'jumpkick' });
                setTimeout(() => { myPlayer.isAttacking = false; }, 250);
            }
            if (e.key === 'l' || e.key === 'L') {
                myPlayer.isBlocking = true;
            }
            if (e.key === 'i' || e.key === 'I') {
                if (myPlayer.energy >= 100) {
                    myPlayer.isUltimate = true;
                    myPlayer.energy = 0;
                    socket.emit('player-attack', { roomId: currentRoom, attackType: 'ultimate' });
                    setTimeout(() => { myPlayer.isUltimate = false; }, 400);
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'w' || e.key === 'W') keys.w = false;
            if (e.key === 'a' || e.key === 'A') keys.a = false;
            if (e.key === 'd' || e.key === 'D') keys.d = false;

            let myPlayer = Object.values(players).find(p => p.role === myRole);
            if (myPlayer && (e.key === 'l' || e.key === 'L')) {
                myPlayer.isBlocking = false;
            }
        });

        function gameLoop() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#1e272e';
            ctx.fillRect(0, 520, canvas.width, 80);

            if (gameStarted && players) {
                let myPlayer = Object.values(players).find(p => p.role === myRole);
                let opponent = Object.values(players).find(p => p.role !== myRole);

                if (myPlayer && !isCountingDown) {
                    const speed = 4;
                    if (keys.a) {
                        myPlayer.x = Math.max(20, myPlayer.x - speed);
                        myPlayer.facingRight = false;
                    }
                    if (keys.d) {
                        myPlayer.x = Math.min(canvas.width - 60, myPlayer.x + speed);
                        myPlayer.facingRight = true;
                    }
                    if (keys.w && myPlayer.y === 460) {
                        myPlayer.y = 330;
                        setTimeout(() => { myPlayer.y = 460; }, 400);
                    }

                    socket.emit('player-action', {
                        roomId: currentRoom,
                        x: myPlayer.x,
                        y: myPlayer.y,
                        hp: myPlayer.hp,
                        energy: myPlayer.energy,
                        facingRight: myPlayer.facingRight,
                        isBlocking: myPlayer.isBlocking,
                        isAttacking: myPlayer.isAttacking,
                        isUltimate: myPlayer.isUltimate,
                        attackType: myPlayer.attackType
                    });
                }

                for (let id in players) {
                    let p = players[id];
                    ctx.fillStyle = p.role === 'p1' ? '#e74c3c' : '#3498db';
                    ctx.fillRect(p.x, p.y, 50, 60);

                    ctx.fillStyle = '#f1c40f';
                    let eyeX = p.facingRight ? p.x + 35 : p.x + 10;
                    ctx.fillRect(eyeX, p.y + 10, 10, 10);

                    if (p.isAttacking) {
                        ctx.fillStyle = '#fff';
                        ctx.fillRect(p.facingRight ? p.x + 50 : p.x - 20, p.y + 20, 20, 20);
                    }
                }

                if (myPlayer && opponent) {
                    let p1 = myRole === 'p1' ? myPlayer : opponent;
                    let p2 = myRole === 'p1' ? opponent : myPlayer;

                    document.getElementById('p1-hp').style.width = \`\${(p1.hp / p1.maxHp) * 100}%\`;
                    document.getElementById('p1-energy').style.width = \`\${p1.energy}%\`;

                    document.getElementById('p2-hp').style.width = \`\${(p2.hp / p2.maxHp) * 100}%\`;
                    document.getElementById('p2-energy').style.width = \`\${p2.energy}%\`;
                }
            }

            if (isCountingDown) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                ctx.fillStyle = '#ffcc00';
                ctx.font = 'bold 60px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(countdownTimer > 0 ? countdownTimer : 'FIGHT!', canvas.width / 2, canvas.height / 2);
            }

            requestAnimationFrame(gameLoop);
        }

        requestAnimationFrame(gameLoop);
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

    socket.on('player-attack', (data) => {
        let roomId = data.roomId;
        if (!rooms[roomId]) return;
        
        let room = rooms[roomId];
        let attacker = room.players[socket.id];
        if (!attacker) return;

        let opponentSocketId = Object.keys(room.players).find(id => id !== socket.id);
        if (!opponentSocketId) return;
        let opponent = room.players[opponentSocketId];

        let damage = data.attackType === 'ultimate' ? 75 : (data.attackType === 'jumpkick' ? 18 : 10);
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