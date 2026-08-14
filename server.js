const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7 });

app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const rootIndex = path.join(__dirname, 'index.html');
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(rootIndex)) res.sendFile(rootIndex);
  else if (fs.existsSync(publicIndex)) res.sendFile(publicIndex);
  else res.send('<h2>index.html not found</h2>');
});

const connectedUsers = {};

io.on('connection', (socket) => {
  console.log('مستخدم جديد متصل:', socket.id);

  socket.on('join-room', ({ username, password, room, avatar }) => {
    const isNameTaken = Object.values(connectedUsers).some(
      user => user.username.toLowerCase() === username.toLowerCase()
    );
    if (isNameTaken) {
      socket.emit('login-error', 'اسم المستخدم مستخدم بالفعل، اختر اسماً آخر.');
      return;
    }
    connectedUsers[socket.id] = { username, room, avatar: avatar || null };
    socket.join(room);
    socket.emit('login-success', { username, room });
    updateRoomUsers(room);
  });

  // --- 📹 إشارات الصوت والفيديو (WebRTC Signaling) ---
  socket.on('call-user', ({ targetSocketId, offer, type }) => {
    const sender = connectedUsers[socket.id];
    io.to(targetSocketId).emit('incoming-call', {
      fromSocketId: socket.id,
      callerName: sender ? sender.username : 'مجهول',
      offer,
      type
    });
  });

  socket.on('make-answer', ({ targetSocketId, answer }) => {
    io.to(targetSocketId).emit('call-accepted', {
      fromSocketId: socket.id,
      answer
    });
  });

  socket.on('ice-candidate', ({ targetSocketId, candidate }) => {
    io.to(targetSocketId).emit('ice-candidate', {
      fromSocketId: socket.id,
      candidate
    });
  });

  socket.on('reject-call', ({ targetSocketId }) => {
    io.to(targetSocketId).emit('call-rejected');
  });

  socket.on('end-call', ({ targetSocketId }) => {
    io.to(targetSocketId).emit('call-ended');
  });

  // --- 💬 الدردشة الكتابية ---
  socket.on('send-chat-msg', ({ targetSocketId, message }) => {
    const sender = connectedUsers[socket.id];
    console.log(`💬 [رسالة شات] من ${sender ? sender.username : 'مجهول'}: ${message}`);
    io.to(targetSocketId).emit('receive-chat-msg', {
      senderName: sender ? sender.username : 'مجهول',
      message
    });
  });

  // --- 🎮 غرف التحدي والألعاب الأونلاين ---
  socket.on('send-game-challenge', ({ targetSocketId, gameType }) => {
    const sender = connectedUsers[socket.id];
    io.to(targetSocketId).emit('incoming-game-challenge', {
      fromSocketId: socket.id,
      challengerName: sender ? sender.username : 'مجهول',
      gameType
    });
  });

  socket.on('accept-game-challenge', ({ targetSocketId, gameType }) => {
    io.to(targetSocketId).emit('game-challenge-accepted', {
      fromSocketId: socket.id,
      gameType
    });
  });

  socket.on('reject-game-challenge', ({ targetSocketId }) => {
    io.to(targetSocketId).emit('game-challenge-rejected');
  });

  socket.on('game-move', ({ targetSocketId, moveData }) => {
    io.to(targetSocketId).emit('receive-game-move', moveData);
  });

  socket.on('disconnect', () => {
    const user = connectedUsers[socket.id];
    if (user) {
      const room = user.room;
      delete connectedUsers[socket.id];
      updateRoomUsers(room);
    }
  });

  function updateRoomUsers(room) {
    const roomUsers = Object.entries(connectedUsers)
      .filter(([id, u]) => u.room === room)
      .map(([id, u]) => ({ socketId: id, username: u.username, avatar: u.avatar }));
    io.to(room).emit('room-users', roomUsers);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
