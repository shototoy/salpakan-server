const WebSocket = require('ws');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === 'production';
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
    const roomList = Array.from(rooms.entries())
      .filter(([id, room]) => Object.keys(room.players).length > 0)
      .map(([id, room]) => ({
        id,
        players: Object.keys(room.players).length
      }));

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

console.log('\n' + '='.repeat(50));
console.log('🎮  SALPAKAN SERVER');
console.log('='.repeat(50));
console.log(`📍  Type: ${isProduction ? 'CLOUD (Render)' : 'LOCAL'}`);
if (isProduction) {
  console.log(`🌐  URL: https://salpakan-server.onrender.com`);
  console.log(`🔌  WSS: wss://salpakan-server.onrender.com`);
} else {
  console.log(`📍  IP: ${localIP}`);
  console.log(`🌐  URL: http://${localIP}:${port}`);
  console.log(`🔌  WS: ws://${localIP}:${port}`);
}
console.log('='.repeat(50) + '\n');

server.listen(port, '0.0.0.0', () => {
  console.log(`✅ Ready on port ${port}\n`);
});

const rooms = new Map();

setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, roomId) => {
    if (!room.lastActivity) room.lastActivity = now;
    if (now - room.lastActivity > 30 * 60 * 1000) {
      if (Object.keys(room.players).length === 0) {
        rooms.delete(roomId);
        console.log(`🗑️  Cleaned: ${roomId}`);
      }
    }
  });
}, 5 * 60 * 1000);

wss.on('connection', (ws, req) => {
  console.log(`📡 Connection from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
  
  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, 30000);
  
  ws.on('pong', () => { ws.isAlive = true; });
  
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

  ws.on('error', (error) => console.error('❌ WS error:', error));
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

function handleGetRooms(ws) {
  const roomList = Array.from(rooms.entries())
    .filter(([id, room]) => Object.keys(room.players).length > 0)
    .map(([id, room]) => ({
      id,
      players: Object.keys(room.players).length
    }));
  ws.send(JSON.stringify({ type: 'roomList', rooms: roomList }));
}

function handleCreateRoom(ws, data) {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  rooms.set(roomId, {
    players: {},
    clients: new Map(),
    readyStates: {},
    setupComplete: {},
    playerNames: {},
    lastActivity: Date.now()
  });
  console.log(`🆕 Room: ${roomId}`);
  ws.send(JSON.stringify({ type: 'roomCreated', roomId }));
}

function handleJoin(ws, data) {
  const { roomId } = data;
  if (!rooms.has(roomId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
    return;
  }
  
  const room = rooms.get(roomId);
  room.lastActivity = Date.now();
  
  if (Object.keys(room.players).length >= 2) {
    ws.send(JSON.stringify({ type: 'error', message: 'Room full' }));
    return;
  }
  
  let playerId = 1;
  const existingIds = Object.keys(room.players).map(Number);
  while (existingIds.includes(playerId)) playerId++;
  
  room.clients.set(playerId, ws);
  ws.roomId = roomId;
  ws.playerId = playerId;
  ws.isAlive = true;
  
  console.log(`✅ P${playerId} → ${roomId}`);
  
  ws.send(JSON.stringify({
    type: 'roomJoined',
    roomId,
    playerId,
    players: room.players,
    readyStates: room.readyStates,
    playerNames: room.playerNames
  }));
  
  broadcastToRoom(roomId, {
    type: 'playerJoined',
    players: room.players,
    readyStates: room.readyStates,
    playerNames: room.playerNames
  }, playerId);
}

function handleSelectSlot(ws, data) {
  const { roomId, playerId, slotNum } = data;
  const room = rooms.get(roomId);
  if (!room) return;
  
  if (Object.values(room.players).includes(slotNum)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Slot taken' }));
    return;
  }
  
  if (room.players[playerId]) {
    ws.send(JSON.stringify({ type: 'error', message: 'Already have slot' }));
    return;
  }
  
  room.lastActivity = Date.now();
  room.players[playerId] = slotNum;
  room.readyStates[playerId] = false;
  
  broadcastToRoom(roomId, {
    type: 'slotSelected',
    playerId,
    slotNum,
    players: room.players,
    readyStates: room.readyStates,
    playerNames: room.playerNames
  });
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
  if (!room) return;
  
  if (!room.players[playerId]) {
    ws.send(JSON.stringify({ type: 'error', message: 'Select slot first' }));
    return;
  }
  
  room.lastActivity = Date.now();
  room.readyStates[playerId] = isReady;
  
  const playerCount = Object.keys(room.players).length;
  const fullRoom = playerCount >= 2;
  const allReady = fullRoom && Object.values(room.readyStates).every(r => r);
  
  broadcastToRoom(roomId, {
    type: 'playerReady',
    playerId,
    isReady,
    allReady,
    readyStates: room.readyStates
  });
}

function handleStartGame(data) {
  broadcastToRoom(data.roomId, { type: 'gameStart' });
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
  
  broadcastToRoom(roomId, { type: 'opponentSetupComplete', playerId }, playerId);
  
  const bothReady = Object.values(room.setupComplete).filter(Boolean).length === 2;
  
  if (bothReady) {
    broadcastToRoom(roomId, { type: 'bothPlayersReady' });
  }
}

function handleMove(data) {
  const { roomId, playerId } = data;
  const room = rooms.get(roomId);
  if (!room) return;
  room.lastActivity = Date.now();
  broadcastToRoom(roomId, { type: 'move', ...data }, playerId);
}

function handleGameEnd(data) {
  const { roomId } = data;
  broadcastToRoom(roomId, { type: 'gameEnd', ...data });
  setTimeout(() => rooms.delete(roomId), 5000);
}

function handleDisconnect(ws) {
  if (!ws.roomId || !ws.playerId) return;
  const room = rooms.get(ws.roomId);
  if (!room) return;
  
  delete room.players[ws.playerId];
  room.clients.delete(ws.playerId);
  delete room.readyStates[ws.playerId];
  delete room.playerNames[ws.playerId];
  room.lastActivity = Date.now();
  
  broadcastToRoom(ws.roomId, {
    type: 'playerLeft',
    playerId: ws.playerId,
    players: room.players,
    readyStates: room.readyStates,
    playerNames: room.playerNames
  });
  
  if (Object.keys(room.players).length === 0) {
    rooms.delete(ws.roomId);
  }
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
  console.log('\n⚠️  Shutting down...');
  wss.clients.forEach(ws => ws.close(1000, 'Server shutdown'));
  wss.close(() => {
    server.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000);
});

process.on('SIGINT', () => {
  console.log('\n👋 Bye');
  wss.close(() => process.exit(0));
});

setInterval(() => {
  const uptime = Math.floor((Date.now() - startTime) / 1000 / 60);
  console.log(`📊 ${rooms.size} rooms, ${wss.clients.size} conns, ${uptime}m up`);
}, 5 * 60 * 1000);

function getDefaultHTML() {
  const serverInfo = isProduction ? 'Cloud Server (Render)' : `${localIP}:${port}`;
  const wsUrl = isProduction ? 'wss://salpakan-server.onrender.com' : `ws://${localIP}:${port}`;
  
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
                return \`
                    <div class="room-card">
                        <div class="room-header">
                            <span class="room-id">\${room.id}</span>
                        </div>
                        <div class="room-info">
                            <span>Players: \${room.players}/2</span>
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