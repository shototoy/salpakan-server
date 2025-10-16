const WebSocket = require('ws');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === 'production';

// Read HTML and CSS files
const htmlPath = path.join(__dirname, 'public', 'index.html');
const cssPath = path.join(__dirname, 'public', 'styles.css');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200);
    res.end('OK');
    return;
  }

  if (req.url === '/discover') {
    const roomList = Array.from(rooms.entries()).map(([id, room]) => {
      const playerCount = Object.keys(room.players).length;
      return {
        id,
        players: playerCount,
        roomType: room.roomType,
        gameStarted: room.gameStarted || false
      };
    });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      type: 'serverFound',
      ip: isProduction ? 'Cloud Server' : localIP,
      wsPort: port,
      serverName: isProduction ? 'Salpakan Cloud Server (Render)' : 'Salpakan Local Server',
      rooms: roomList,
      timestamp: Date.now()
    }));
    return;
  }

  if (req.url === '/styles.css') {
    if (fs.existsSync(cssPath)) {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      fs.createReadStream(cssPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('CSS not found');
    }
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(htmlPath).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(getDefaultHTML());
    }
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: false,
  clientTracking: true,
  maxPayload: 100 * 1024
});

function getLocalIP() {
  if (isProduction) return 'Cloud Server';
  
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

const localIP = getLocalIP();
const startTime = Date.now();

console.log('\n' + '='.repeat(60));
console.log('🎮  SALPAKAN SERVER');
console.log('='.repeat(60));
console.log(`\n📍  Server Type: ${isProduction ? 'CLOUD (Render)' : 'LOCAL'}`);
if (!isProduction) {
  console.log(`📍  Server IP: ${localIP}`);
  console.log(`🔌  WebSocket: ws://${localIP}:${port}`);
  console.log(`🌐  Web Interface: http://${localIP}:${port}`);
} else {
  console.log(`🔌  WebSocket: wss://salpakan-game.onrender.com`);
  console.log(`🌐  Web Interface: https://salpakan-game.onrender.com`);
}
console.log('='.repeat(60) + '\n');

server.listen(port, '0.0.0.0', () => {
  console.log(`✅ Listening on port ${port}\n`);
});

const rooms = new Map();

// Cleanup inactive rooms every 5 minutes
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, roomId) => {
    if (!room.lastActivity) room.lastActivity = now;
    
    if (now - room.lastActivity > 30 * 60 * 1000) {
      const hasPlayers = room.clients.size > 0;
      if (!hasPlayers) {
        rooms.delete(roomId);
        console.log(`🗑️  Cleaned up room: ${roomId}`);
      }
    }
  });
}, 5 * 60 * 1000);

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, 30000);
  
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.roomId && rooms.has(data.roomId)) {
        rooms.get(data.roomId).lastActivity = Date.now();
      }
      
      switch (data.type) {
        case 'getRooms': handleGetRooms(ws); break;
        case 'createRoom': handleCreateRoom(ws, data); break;
        case 'join': handleJoin(ws, data); break;
        case 'selectSlot': handleSelectSlot(ws, data); break;
        case 'toggleReady': handleToggleReady(ws, data); break;
        case 'startGame': handleStartGame(data); break;
        case 'setupComplete': handleSetupComplete(data); break;
        case 'deploymentUpdate': handleDeploymentUpdate(data); break;
        case 'move': handleMove(data); break;
        case 'gameEnd': handleGameEnd(data); break;
        case 'updateName': handleUpdateName(ws, data); break;
      }
    } catch (error) {
      console.error('❌ Error:', error);
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    handleDisconnect(ws);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

// Heartbeat mechanism
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

function handleGetRooms(ws) {
  const roomList = Array.from(rooms.entries()).map(([id, room]) => {
    const maxPlayers = room.roomType === '3player' ? 3 : 2;
    const playerCount = Object.keys(room.players).length;
    return {
      id,
      players: playerCount,
      isFull: playerCount >= maxPlayers,
      roomType: room.roomType,
      gameStarted: room.gameStarted || false
    };
  });
  
  ws.send(JSON.stringify({ type: 'roomList', rooms: roomList }));
}

function broadcastRoomListUpdate() {
  const roomList = Array.from(rooms.entries()).map(([id, room]) => {
    const maxPlayers = room.roomType === '3player' ? 3 : 2;
    const playerCount = Object.keys(room.players).length;
    return {
      id,
      players: playerCount,
      isFull: playerCount >= maxPlayers,
      roomType: room.roomType,
      gameStarted: room.gameStarted || false
    };
  });
  
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN && !ws.roomId) {
      ws.send(JSON.stringify({ type: 'roomList', rooms: roomList }));
    }
  });
}

function handleCreateRoom(ws, data) {
  const { roomType = '2player' } = data;
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  let playerId = 1;
  
  const room = {
    roomType,
    players: {},
    clients: new Map(),
    readyStates: {},
    setupComplete: {},
    playerNames: {},
    gameStarted: false,
    lastActivity: Date.now(),
    hostId: playerId
  };
  
  rooms.set(roomId, room);
  
  room.clients.set(playerId, ws);
  ws.roomId = roomId;
  ws.playerId = playerId;
  ws.isAlive = true;
  
  console.log(`🆕 Room ${roomId} (${roomType}) - Host P${playerId}`);
  
  ws.send(JSON.stringify({
    type: 'roomCreated',
    roomId,
    roomType,
    playerId,
    hostId: playerId,
    players: room.players,
    readyStates: room.readyStates,
    playerNames: room.playerNames
  }));
  
  broadcastRoomListUpdate();
}

function handleJoin(ws, data) {
  const { roomId } = data;
  
  if (!rooms.has(roomId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  
  const room = rooms.get(roomId);
  room.lastActivity = Date.now();
  
  if (ws.playerId && ws.roomId === roomId && room.clients.has(ws.playerId)) {
    console.log(`♻️ Player ${ws.playerId} reconnecting to ${roomId}`);
    ws.send(JSON.stringify({
      type: 'roomJoined',
      roomId,
      playerId: ws.playerId,
      hostId: room.hostId,
      players: room.players,
      readyStates: room.readyStates,
      roomType: room.roomType,
      playerNames: room.playerNames,
      gameStarted: room.gameStarted || false
    }));
    return;
  }
  
  let playerId = 1;
  const existingIds = Array.from(room.clients.keys());
  while (existingIds.includes(playerId)) {
    playerId++;
  }
  
  room.clients.set(playerId, ws);
  ws.roomId = roomId;
  ws.playerId = playerId;
  ws.isAlive = true;
  
  console.log(`➕ Player ${playerId} → ${roomId}`);
  
  ws.send(JSON.stringify({
    type: 'roomJoined',
    roomId,
    playerId,
    hostId: room.hostId,
    players: room.players,
    readyStates: room.readyStates,
    roomType: room.roomType,
    playerNames: room.playerNames,
    gameStarted: room.gameStarted || false
  }));
  
  broadcastToRoom(roomId, {
    type: 'playerJoined',
    playerId,
    hostId: room.hostId,
    players: room.players,
    readyStates: room.readyStates,
    playerNames: room.playerNames
  }, playerId);
  
  broadcastRoomListUpdate();
}

function handleSelectSlot(ws, data) {
  const { roomId, playerId, slotNum } = data;
  const room = rooms.get(roomId);
  
  if (!room) return;
  
  if (room.players[playerId] === slotNum) {
    delete room.players[playerId];
    delete room.readyStates[playerId];
    console.log(`🔓 Player ${playerId} unselected slot ${slotNum}`);
  } else {
    const slotTaken = Object.values(room.players).includes(slotNum);
    if (slotTaken) {
      ws.send(JSON.stringify({ type: 'error', message: 'Slot already taken' }));
      return;
    }
    
    if (room.players[playerId]) {
      delete room.readyStates[playerId];
    }
    
    room.lastActivity = Date.now();
    room.players[playerId] = slotNum;
    room.readyStates[playerId] = false;
    
    console.log(`🎯 Player ${playerId} → Slot ${slotNum}`);
  }
  
  broadcastToRoom(roomId, {
    type: 'slotSelected',
    playerId,
    slotNum,
    hostId: room.hostId,
    players: room.players,
    readyStates: room.readyStates,
    playerNames: room.playerNames
  });
  
  broadcastRoomListUpdate();
}

function handleUpdateName(ws, data) {
  const { roomId, playerId, name } = data;
  const room = rooms.get(roomId);
  
  if (!room) return;
  
  room.lastActivity = Date.now();
  room.playerNames[playerId] = name;
  
  broadcastToRoom(roomId, {
    type: 'nameUpdated',
    playerId,
    name,
    playerNames: room.playerNames
  });
}

function handleToggleReady(ws, data) {
  const { roomId, playerId, isReady } = data;
  const room = rooms.get(roomId);
  
  if (!room || !room.players[playerId]) {
    console.log(`⚠️ Cannot toggle ready: player ${playerId} not in slot`);
    return;
  }
  
  room.lastActivity = Date.now();
  room.readyStates[playerId] = isReady;
  
  let allReady = false;
  if (room.roomType === '3player') {
    const slot1Player = Object.keys(room.players).find(pid => room.players[pid] === 1);
    const slot2Player = Object.keys(room.players).find(pid => room.players[pid] === 2);
    allReady = slot1Player && slot2Player && 
               room.readyStates[slot1Player] && room.readyStates[slot2Player];
  } else {
    const slot1Player = Object.keys(room.players).find(pid => room.players[pid] === 1);
    const slot2Player = Object.keys(room.players).find(pid => room.players[pid] === 2);
    allReady = slot1Player && slot2Player && 
               room.readyStates[slot1Player] && room.readyStates[slot2Player];
  }
  
  console.log(`${isReady ? '✓' : '⏳'} Player ${playerId} ready: ${isReady}, All ready: ${allReady}`);
  
  broadcastToRoom(roomId, {
    type: 'playerReady',
    playerId,
    isReady,
    allReady,
    readyStates: room.readyStates
  });
}

function handleStartGame(data) {
  const { roomId } = data;
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.gameStarted = true;
  console.log(`🎮 Game started: ${roomId}`);
  
  broadcastToRoom(roomId, { type: 'gameStart' });
  broadcastRoomListUpdate();
}

function handleDeploymentUpdate(data) {
  const { roomId, playerId, piecesPlaced, board } = data;
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.lastActivity = Date.now();
  
  broadcastToRoom(roomId, {
    type: 'opponentDeploymentUpdate',
    playerId,
    piecesPlaced,
    board
  }, playerId);
}

function handleSetupComplete(data) {
  const { roomId, playerId } = data;
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.lastActivity = Date.now();
  room.setupComplete[playerId] = true;
  
  broadcastToRoom(roomId, {
    type: 'opponentSetupComplete',
    playerId
  }, playerId);
  
  let bothReady = false;
  if (room.roomType === '3player') {
    const slot1Player = Object.keys(room.players).find(pid => room.players[pid] === 1);
    const slot2Player = Object.keys(room.players).find(pid => room.players[pid] === 2);
    bothReady = slot1Player && slot2Player && 
                room.setupComplete[slot1Player] && room.setupComplete[slot2Player];
  } else {
    const slot1Player = Object.keys(room.players).find(pid => room.players[pid] === 1);
    const slot2Player = Object.keys(room.players).find(pid => room.players[pid] === 2);
    bothReady = slot1Player && slot2Player && 
                room.setupComplete[slot1Player] && room.setupComplete[slot2Player];
  }
  
  if (bothReady) {
    broadcastToRoom(roomId, { type: 'bothPlayersReady' });
  }
}

function handleMove(data) {
  const { roomId } = data;
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.lastActivity = Date.now();
  broadcastToRoom(roomId, { type: 'move', ...data });
}

function handleGameEnd(data) {
  const { roomId } = data;
  broadcastToRoom(roomId, { type: 'gameEnd', ...data });
  
  setTimeout(() => {
    rooms.delete(roomId);
    console.log(`🗑️  Room closed: ${roomId}`);
    broadcastRoomListUpdate();
  }, 5000);
}

function handleDisconnect(ws) {
  if (!ws.roomId || !ws.playerId) return;
  
  const room = rooms.get(ws.roomId);
  if (!room) return;
  
  const leavingPlayerId = ws.playerId;
  
  delete room.players[leavingPlayerId];
  room.clients.delete(leavingPlayerId);
  delete room.readyStates[leavingPlayerId];
  delete room.playerNames[leavingPlayerId];
  delete room.setupComplete[leavingPlayerId];
  room.lastActivity = Date.now();
  
  if (room.hostId === leavingPlayerId) {
    const remainingPlayers = Array.from(room.clients.keys());
    if (remainingPlayers.length > 0) {
      room.hostId = Math.min(...remainingPlayers);
      console.log(`👑 Host transferred to Player ${room.hostId} in ${ws.roomId}`);
    }
  }
  
  console.log(`➖ Player ${leavingPlayerId} left ${ws.roomId}`);
  
  broadcastToRoom(ws.roomId, {
    type: 'playerLeft',
    playerId: leavingPlayerId,
    hostId: room.hostId,
    players: room.players,
    readyStates: room.readyStates,
    playerNames: room.playerNames
  });
  
  if (room.clients.size === 0) {
    rooms.delete(ws.roomId);
    console.log(`🗑️  Room ${ws.roomId} closed (empty)`);
  }
  
  broadcastRoomListUpdate();
}

function broadcastToRoom(roomId, message, excludePlayerId = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.clients.forEach((ws, playerId) => {
    if (playerId !== excludePlayerId && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

process.on('SIGTERM', () => {
  wss.clients.forEach((ws) => {
    ws.close(1000, 'Server shutting down');
  });
  
  wss.close(() => {
    server.close(() => {
      process.exit(0);
    });
  });
  
  setTimeout(() => {
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  wss.close(() => {
    process.exit(0);
  });
});

setInterval(() => {
  const uptime = Math.floor((Date.now() - startTime) / 1000 / 60);
  console.log(`\n📊 ${rooms.size} rooms | ${wss.clients.size} connections | ${uptime}m uptime`);
}, 5 * 60 * 1000);

function getDefaultHTML() {
  const serverInfo = isProduction ? 'Cloud Server (Render)' : `${localIP}:${port}`;
  const wsUrl = isProduction ? 'wss://salpakan-game.onrender.com' : `ws://${localIP}:${port}`;
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Salpakan Game Server</title>
    <link rel="stylesheet" href="/styles.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>🎮 SALPAKAN GAME SERVER</h1>
            <p class="subtitle">Multiplayer Strategy Game</p>
        </header>

        <div class="server-info">
            <h2>Server Information</h2>
            <div class="info-grid">
                <div class="info-item">
                    <span class="label">Server:</span>
                    <span class="value">${serverInfo}</span>
                </div>
                <div class="info-item">
                    <span class="label">WebSocket:</span>
                    <span class="value">${wsUrl}</span>
                </div>
                <div class="info-item">
                    <span class="label">Status:</span>
                    <span class="value status-online">🟢 ONLINE</span>
                </div>
                <div class="info-item">
                    <span class="label">Rooms:</span>
                    <span class="value" id="roomCount">0</span>
                </div>
            </div>
        </div>

        <div class="rooms-section">
            <h2>Active Rooms</h2>
            <div id="roomsList" class="rooms-list">
                <p class="no-rooms">No active rooms</p>
            </div>
        </div>

        <footer>
            <p>Game of the Generals • Philippine Strategy Game</p>
        </footer>
    </div>

    <script>
        const ws = new WebSocket('${wsUrl}');
        
        ws.onopen = () => {
            console.log('Connected to server');
            ws.send(JSON.stringify({ type: 'getRooms' }));
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'roomList') {
                updateRoomsList(data.rooms);
            }
        };

        function updateRoomsList(rooms) {
            const roomsList = document.getElementById('roomsList');
            const roomCount = document.getElementById('roomCount');
            
            roomCount.textContent = rooms.length;

            if (rooms.length === 0) {
                roomsList.innerHTML = '<p class="no-rooms">No active rooms</p>';
                return;
            }

            roomsList.innerHTML = rooms.map(room => {
                const maxPlayers = room.roomType === '3player' ? 3 : 2;
                const statusClass = room.gameStarted ? 'status-playing' : 'status-waiting';
                const statusText = room.gameStarted ? '🎮 Playing' : '⏳ Waiting';
                const roomTypeText = room.roomType === '3player' ? '👁️ 3P' : '⚔️ 1v1';
                
                return \`
                    <div class="room-card">
                        <div class="room-header">
                            <span class="room-id">\${room.id}</span>
                            <span class="room-type">\${roomTypeText}</span>
                        </div>
                        <div class="room-info">
                            <span>Players: \${room.players}/\${maxPlayers}</span>
                            <span class="\${statusClass}">\${statusText}</span>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'getRooms' }));
            }
        }, 5000);
    </script>
</body>
</html>`;
}