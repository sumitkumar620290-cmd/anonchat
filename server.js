
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

// In-memory state
let users = new Map();
let communityMessages = []; 
let privateRooms = new Map(); // Store active private sessions
let communityTimerEnd = Date.now() + 30 * 60 * 1000;
let siteTimerEnd = Date.now() + 120 * 60 * 1000;

// Reset community every 30 minutes
const resetCommunity = () => {
  communityMessages = [];
  communityTimerEnd = Date.now() + 30 * 60 * 1000;
  io.emit('RESET_COMMUNITY', { nextReset: communityTimerEnd });
  console.log('Community reset triggered');
};

// Reset site every 2 hours
const resetSite = () => {
  users.clear();
  communityMessages = [];
  privateRooms.clear();
  communityTimerEnd = Date.now() + 30 * 60 * 1000;
  siteTimerEnd = Date.now() + 120 * 60 * 1000;
  io.emit('RESET_SITE', { nextReset: siteTimerEnd });
  console.log('Site reset triggered');
};

setInterval(resetCommunity, 30 * 60 * 1000);
setInterval(resetSite, 120 * 60 * 1000);

// Cleanup expired community messages (older than 5 mins) and expired private rooms
setInterval(() => {
  const now = Date.now();
  communityMessages = communityMessages.filter(m => now - m.timestamp < 300000);
  
  for (let [id, room] of privateRooms.entries()) {
    if (now > room.expiresAt) {
      privateRooms.delete(id);
      console.log(`Private room ${id} expired.`);
    }
  }
}, 60000);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.emit('INIT_STATE', {
    communityMessages,
    communityTimerEnd,
    siteTimerEnd
  });

  socket.on('HEARTBEAT', (data) => {
    if (!data.user) return;
    users.set(socket.id, { ...data.user, socketId: socket.id });
    socket.broadcast.emit('HEARTBEAT', { 
      user: data.user,
      communityTimerEnd,
      siteTimerEnd
    });
  });

  socket.on('MESSAGE', (data) => {
    if (data.message.roomId === 'community') {
      communityMessages.push(data.message);
      if (communityMessages.length > 200) communityMessages.shift();
    }
    io.emit('MESSAGE', data);
  });

  socket.on('CHAT_REQUEST', (data) => {
    console.log(`Chat request from ${data.request.fromName} to ${data.request.toId}`);
    // Broadcast to everyone; clients filter based on toId
    socket.broadcast.emit('CHAT_REQUEST', data);
  });

  socket.on('CHAT_ACCEPT', (data) => {
    console.log(`Chat accepted for room ${data.room.id}`);
    privateRooms.set(data.room.id, data.room);
    io.emit('CHAT_ACCEPT', data);
  });

  socket.on('CHAT_REJOIN', (data) => {
    // data: { reconnectCode }
    console.log(`User rejoining with code: ${data.reconnectCode}`);
    let found = false;
    for (let room of privateRooms.values()) {
      if (room.reconnectCode === data.reconnectCode) {
        socket.emit('CHAT_ACCEPT', { room });
        found = true;
        break;
      }
    }
    if (!found) {
      socket.emit('ERROR', { message: 'Invalid or Expired Secret Key' });
    }
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
  });
});

const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`AnonChat Server running on port ${PORT}`);
});
