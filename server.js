const WebSocket = require('ws');
const http = require('http');
const os = require('os');

const port = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === 'production';

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
      .filter(([id, room]) => room.players.filter(p => p !== null).length > 0)
      .map(([id, room]) => ({
        id,
        players: room.players.filter(p => p !== null).length
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
    console.log(`🔍 Discovery from ${req.socket.remoteAddress}`);
    return;
  }

  if (req.url === '/' || req.url === '/status') {
    const roomList = Array.from(rooms.entries())
      .filter(([id, room]) => room.players.filter(p => p !== null).length > 0)
      .map(([id, room]) => ({
        id,
        players: room.players.filter(p => p !== null).length
      }));

    const totalPlayers = roomList.reduce((sum, r) => sum + r.players, 0);
    const serverType = isProduction ? 'Cloud (Render)' : 'Local';

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salpakan Server - ${serverType}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      background: linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%);
      color: #fbbf24;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: rgba(0, 0, 0, 0.8);
      border: 4px solid #ca8a04;
      border-radius: 12px;
      padding: 40px;
      max-width: 600px;
      text-align: center;
      box-shadow: 0 20px 60px rgba(251, 191, 36, 0.3);
    }
    h1 {
      font-size: 36px;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 3px;
    }
    .status {
      color: #10b981;
      font-size: 18px;
      margin-bottom: 30px;
    }
    .server-type {
      background: ${isProduction ? 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)' : 'linear-gradient(135deg, #3b82f6 0%, #1e3a8a 100%)'};
      border: 2px solid ${isProduction ? '#a78bfa' : '#60a5fa'};
      border-radius: 8px;
      padding: 15px;
      margin: 20px 0;
      font-size: 20px;
      font-weight: bold;
    }
    .ip-box {
      background: #000;
      border: 2px solid #fbbf24;
      border-radius: 8px;
      padding: 20px;
      margin: 30px 0;
    }
    .ip-label {
      font-size: 14px;
      opacity: 0.7;
      margin-bottom: 10px;
    }
    .ip-address {
      font-size: ${isProduction ? '24px' : '48px'};
      font-weight: bold;
      color: #fbbf24;
      letter-spacing: 2px;
      text-shadow: 0 0 20px rgba(251, 191, 36, 0.5);
      word-break: break-all;
    }
    .info {
      background: rgba(59, 130, 246, 0.1);
      border: 1px solid #3b82f6;
      border-radius: 6px;
      padding: 15px;
      margin-top: 20px;
      font-size: 14px;
      color: #93c5fd;
      text-align: left;
    }
    .stats {
      display: flex;
      justify-content: space-around;
      margin-top: 30px;
      gap: 20px;
    }
    .stat {
      flex: 1;
    }
    .stat-value {
      font-size: 32px;
      font-weight: bold;
    }
    .stat-label {
      font-size: 12px;
      opacity: 0.7;
      margin-top: 5px;
    }
    .rooms-list {
      margin-top: 20px;
      max-height: 200px;
      overflow-y: auto;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 6px;
      padding: 10px;
    }
    .room-item {
      background: rgba(251, 191, 36, 0.1);
      border: 1px solid #fbbf24;
      border-radius: 4px;
      padding: 8px;
      margin: 5px 0;
      display: flex;
      justify-content: space-between;
      font-size: 12px;
    }
    .uptime {
      font-size: 12px;
      opacity: 0.6;
      margin-top: 20px;
    }
  </style>
</head>
<body>  
  <div class="container">
    <h1>🎮 SALPAKAN</h1>
    <div class="status">● SERVER RUNNING</div>
    
    <div class="server-type">
      ${isProduction ? '☁️ CLOUD SERVER (Render)' : '🏠 LOCAL SERVER'}
    </div>

    ${isProduction ? `
    <div class="ip-box">
      <div class="ip-label">WEBSOCKET URL</div>
      <div class="ip-address">wss://salpakan-game.onrender.com</div>
    </div>

    <div class="info">
      💡 <strong>How to connect:</strong><br>
      1. Open Salpakan game on your phone or computer<br>
      2. The cloud server is automatically available<br>
      3. Create or join rooms from the multiplayer lobby<br>
      <br>
      <strong>Note:</strong> This is a free Render instance. It may sleep after 15 minutes of inactivity and take ~30 seconds to wake up on first connection.
    </div>
    ` : `
    <div class="ip-box">
      <div class="ip-label">SERVER IP ADDRESS</div>
      <div class="ip-address">${localIP}</div>
    </div>

    <div class="info">
      💡 <strong>To connect:</strong><br>
      1. Make sure your device is on the same WiFi network<br>
      2. Open Salpakan game on your phone<br>
      3. Go to Settings → Add Local Server<br>
      4. Enter this IP: <strong>${localIP}</strong>
    </div>
    `}

    <div class="stats">
      <div class="stat">
        <div class="stat-value" id="rooms">${roomList.length}</div>
        <div class="stat-label">Active Rooms</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="players">${totalPlayers}</div>
        <div class="stat-label">Players Online</div>
      </div>
      <div class="stat">
        <div class="stat-value" id="connections">${wss.clients.size}</div>
        <div class="stat-label">Connections</div>
      </div>
    </div>

    <div class="rooms-list" id="roomsList">
      ${roomList.length > 0 ? roomList.map(room => `
        <div class="room-item">
          <span>Room: ${room.id}</span>
          <span>Players: ${room.players}/2</span>
        </div>
      `).join('') : '<div style="opacity: 0.5; padding: 20px;">No active rooms</div>'}
    </div>

    <div class="uptime" id="uptime">Uptime: 0s</div>
  </div>

  <script>
    const startTime = Date.now();
    
    function updateStats() {
      fetch('/discover')
        .then(r => r.json())
        .then(data => {
          document.getElementById('rooms').textContent = data.rooms.length;
          const totalPlayers = data.rooms.reduce((sum, r) => sum + r.players, 0);
          document.getElementById('players').textContent = totalPlayers;
          
          const roomsList = document.getElementById('roomsList');
          if (data.rooms.length > 0) {
            roomsList.innerHTML = data.rooms.map(room => \`
              <div class="room-item">
                <span>Room: \${room.id}</span>
                <span>Players: \${room.players}/2</span>
              </div>
            \`).join('');
          } else {
            roomsList.innerHTML = '<div style="opacity: 0.5; padding: 20px;">No active rooms</div>';
          }
        })
        .catch(() => {});
    }

    function updateUptime() {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      const seconds = uptime % 60;
      document.getElementById('uptime').textContent = 
        \`Uptime: \${hours}h \${minutes}m \${seconds}s\`;
    }

    setInterval(updateStats, 2000);
    setInterval(updateUptime, 1000);
    updateStats();
    updateUptime();
  </script>
</body>
</html>
    `);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocket.Server({ 
  server,
  // Render-specific optimizations
  perMessageDeflate: false, // Disable compression for lower latency
  clientTracking: true,
  maxPayload: 100 * 1024 // 100KB max message size
});

// ============================================
// NETWORK UTILITIES
// ============================================

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

// ============================================
// WEBSOCKET SERVER
// ============================================

console.log('\n' + '='.repeat(60));
console.log('🎮  SALPAKAN SERVER');
console.log('='.repeat(60));
console.log(`\n📍  Server Type: ${isProduction ? 'CLOUD (Render)' : 'LOCAL'}`);
if (!isProduction) {
  console.log(`📍  Server IP: ${localIP}`);
  console.log(`\n📱  To connect from your phone:`);
  console.log(`    1. Connect to the same WiFi network`);
  console.log(`    2. Open Salpakan → Settings → Add Local Server`);
  console.log(`    3. Enter IP: ${localIP}\n`);
  console.log(`🌐  Status page: http://${localIP}:${port}`);
  console.log(`🔌  WebSocket: ws://${localIP}:${port}`);
} else {
  console.log(`🌐  Status page: https://salpakan-game.onrender.com`);
  console.log(`🔌  WebSocket: wss://salpakan-game.onrender.com`);
}
console.log(`🔍  Discovery: /discover endpoint available`);
console.log('='.repeat(60) + '\n');

server.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server ready on port ${port}`);
  if (isProduction) {
    console.log(`☁️  Running on Render cloud platform\n`);
  } else {
    console.log(`🏠  Running on local network\n`);
  }
});

const rooms = new Map();

// Cleanup inactive rooms periodically (important for free tier)
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, roomId) => {
    if (!room.lastActivity) room.lastActivity = now;
    
    // Remove rooms inactive for 30 minutes
    if (now - room.lastActivity > 30 * 60 * 1000) {
      const hasPlayers = room.players.some(p => p !== null);
      if (!hasPlayers) {
        rooms.delete(roomId);
        console.log(`🗑️  Cleaned up inactive room: ${roomId}`);
      }
    }
  });
}, 5 * 60 * 1000); // Check every 5 minutes

wss.on('connection', (ws, req) => {
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`📡 New connection from ${clientIP}`);
  
  // Send ping every 30 seconds to keep connection alive (important for Render)
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
      console.log(`📨 Received: ${data.type} ${data.roomId ? `(${data.roomId})` : ''}`);
      
      // Update room activity
      if (data.roomId && rooms.has(data.roomId)) {
        rooms.get(data.roomId).lastActivity = Date.now();
      }
      
      switch (data.type) {
        case 'getRooms': handleGetRooms(ws); break;
        case 'join': handleJoin(ws, data); break;
        case 'toggleReady': handleToggleReady(ws, data); break;
        case 'startGame': handleStartGame(data); break;
        case 'setupComplete': handleSetupComplete(data); break;
        case 'deploymentUpdate': handleDeploymentUpdate(data); break;
        case 'move': handleMove(data); break;
        case 'gameEnd': handleGameEnd(data); break;
      }
    } catch (error) {
      console.error('❌ Error:', error);
    }
  });

  ws.on('close', () => {
    clearInterval(pingInterval);
    console.log('🔌 Connection closed');
    handleDisconnect(ws);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

// Ping all connections every 30 seconds to detect dead connections
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log('💀 Terminating dead connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

function handleGetRooms(ws) {
  const roomList = Array.from(rooms.entries())
    .filter(([id, room]) => {
      const activePlayers = room.players.filter(p => p !== null).length;
      return activePlayers > 0;
    })
    .map(([id, room]) => ({
      id,
      players: room.players.filter(p => p !== null).length,
      isFull: room.players.filter(p => p !== null).length >= 2
    }));
  
  ws.send(JSON.stringify({ type: 'roomList', rooms: roomList }));
}

function handleJoin(ws, data) {
  const { roomId } = data;
  
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      players: [null, null],
      clients: new Map(),
      readyStates: { 1: false, 2: false },
      setupComplete: { 1: false, 2: false },
      lastActivity: Date.now()
    });
    console.log(`🆕 Room created: ${roomId}`);
  }
  
  const room = rooms.get(roomId);
  room.lastActivity = Date.now();
  
  let playerId = null;
  if (room.players[0] === null) {
    playerId = 1;
    room.players[0] = 1;
  } else if (room.players[1] === null) {
    playerId = 2;
    room.players[1] = 2;
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
    return;
  }
  
  room.clients.set(playerId, ws);
  ws.roomId = roomId;
  ws.playerId = playerId;
  ws.isAlive = true;
  
  console.log(`✅ Player ${playerId} joined room ${roomId}`);
  
  ws.send(JSON.stringify({
    type: 'roomJoined',
    roomId,
    playerId,
    players: room.players,
    readyStates: room.readyStates
  }));
  
  const opponentId = playerId === 1 ? 2 : 1;
  const opponentWs = room.clients.get(opponentId);
  
  if (opponentWs && opponentWs.readyState === WebSocket.OPEN) {
    opponentWs.send(JSON.stringify({
      type: 'playerJoined',
      players: room.players,
      readyStates: room.readyStates
    }));
  }
}

function handleToggleReady(ws, data) {
  const { roomId, playerId, isReady } = data;
  const room = rooms.get(roomId);
  
  if (!room) {
    console.log(`❌ Room ${roomId} not found`);
    return;
  }
  
  room.lastActivity = Date.now();
  room.readyStates[playerId] = isReady;
  const allReady = room.readyStates[1] && room.readyStates[2] && room.players.filter(p => p !== null).length === 2;
  
  console.log(`🎯 Player ${playerId} ready: ${isReady}, all ready: ${allReady}`);
  
  const message = {
    type: 'playerReady',
    playerId,
    isReady,
    allReady,
    readyStates: room.readyStates
  };
  
  room.clients.forEach((clientWs, clientPlayerId) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(message));
    }
  });
}

function handleStartGame(data) {
  const { roomId } = data;
  console.log(`🎮 Game starting: ${roomId}`);
  broadcastToRoom(roomId, { type: 'gameStart' });
}

function handleDeploymentUpdate(data) {
  const { roomId, playerId, piecesPlaced, board } = data;
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.lastActivity = Date.now();
  
  const opponentId = playerId === 1 ? 2 : 1;
  const opponentWs = room.clients.get(opponentId);
  
  if (opponentWs) {
    opponentWs.send(JSON.stringify({
      type: 'opponentDeploymentUpdate',
      piecesPlaced,
      board
    }));
  }
}

function handleSetupComplete(data) {
  const { roomId, playerId } = data;
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.lastActivity = Date.now();
  room.setupComplete[playerId] = true;
  console.log(`✅ Player ${playerId} setup complete`);
  
  const opponentId = playerId === 1 ? 2 : 1;
  const opponentWs = room.clients.get(opponentId);
  
  if (opponentWs) {
    opponentWs.send(JSON.stringify({
      type: 'opponentSetupComplete',
      playerId
    }));
  }
  
  if (room.setupComplete[1] && room.setupComplete[2]) {
    console.log(`🎮 Both players ready: ${roomId}`);
    broadcastToRoom(roomId, { type: 'bothPlayersReady' });
  }
}

function handleMove(data) {
  const { roomId, playerId } = data;
  console.log(`♟️  Move by Player ${playerId}`);
  
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.lastActivity = Date.now();
  
  const opponentId = playerId === 1 ? 2 : 1;
  const opponentWs = room.clients.get(opponentId);
  if (opponentWs) {
    opponentWs.send(JSON.stringify({ type: 'move', ...data }));
  }
}

function handleGameEnd(data) {
  const { roomId } = data;
  console.log(`🏆 Game ended: ${roomId}`);
  broadcastToRoom(roomId, { type: 'gameEnd', ...data });
  
  setTimeout(() => {
    rooms.delete(roomId);
    console.log(`🗑️  Room deleted: ${roomId}`);
  }, 5000);
}

function handleDisconnect(ws) {
  if (!ws.roomId || !ws.playerId) return;
  
  const room = rooms.get(ws.roomId);
  if (!room) return;
  
  console.log(`👋 Player ${ws.playerId} left room ${ws.roomId}`);
  
  const playerIndex = ws.playerId - 1;
  room.players[playerIndex] = null;
  room.clients.delete(ws.playerId);
  room.readyStates[ws.playerId] = false;
  room.lastActivity = Date.now();
  
  broadcastToRoom(ws.roomId, {
    type: 'playerLeft',
    playerId: ws.playerId,
    players: room.players
  });
  
  if (room.players.every(p => p === null)) {
    rooms.delete(ws.roomId);
    console.log(`🗑️  Empty room deleted: ${ws.roomId}`);
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received, shutting down gracefully...');
  
  wss.clients.forEach((ws) => {
    ws.close(1000, 'Server shutting down');
  });
  
  wss.close(() => {
    console.log('✅ WebSocket server closed');
    server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
  });
  
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  wss.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Log stats every 5 minutes
setInterval(() => {
  const uptime = Math.floor((Date.now() - startTime) / 1000 / 60);
  console.log(`\n📊 Stats: ${rooms.size} rooms, ${wss.clients.size} connections, ${uptime}m uptime`);
}, 5 * 60 * 1000);