
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
let communityMessages = []; // Last 5 mins
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
  communityTimerEnd = Date.now() + 30 * 60 * 1000;
  siteTimerEnd = Date.now() + 120 * 60 * 1000;
  io.emit('RESET_SITE', { nextReset: siteTimerEnd });
  console.log('Site reset triggered');
};

setInterval(resetCommunity, 30 * 60 * 1000);
setInterval(resetSite, 120 * 60 * 1000);

// Cleanup expired community messages (older than 5 mins) every minute
setInterval(() => {
  const now = Date.now();
  communityMessages = communityMessages.filter(m => now - m.timestamp < 300000);
}, 60000);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Send current state to new joiner
  socket.emit('INIT_STATE', {
    communityMessages,
    communityTimerEnd,
    siteTimerEnd
  });

  socket.on('HEARTBEAT', (data) => {
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
      // Limit buffer size
      if (communityMessages.length > 200) communityMessages.shift();
    }
    io.emit('MESSAGE', data);
  });

  socket.on('CHAT_REQUEST', (data) => {
    socket.broadcast.emit('CHAT_REQUEST', data);
  });

  socket.on('CHAT_ACCEPT', (data) => {
    io.emit('CHAT_ACCEPT', data);
  });

  socket.on('CHAT_REJOIN', (data) => {
    io.emit('CHAT_REJOIN', data);
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
