const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');

const app = express();

// إعدادات الحماية
app.use(helmet({ contentSecurityPolicy: false }));

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7
});

// السماح بقراءة الملفات من المجلد الرئيسي ومن مجلد public إن وجد
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// توجيه الصفحة الرئيسية مباشرة إلى index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'), (err) => {
    if (err) {
      // في حال كان الملف داخل مجلد public
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });
});

// تخزين المستخدمين المتصلين
const connectedUsers = {};

io.on('connection', (socket) => {
  socket.on('join-room', ({ username, password, room, avatar }) => {
    const isNameTaken = Object.values(connectedUsers).some(
      user => user.username.toLowerCase() === username.toLowerCase()
    );

    if (isNameTaken) {
      socket.emit('login-error', 'يوجد هذا الاسم بالفعل، يرجى اختيار اسم مستخدم آخر للدخول (مثال: ' + username + '1)');
      return;
    }

    connectedUsers[socket.id] = { username, room, avatar: avatar || null };
    socket.join(room);

    socket.emit('login-success', { username, room });
    updateRoomUsers(room);
  });

  socket.on('request-communication', ({ targetSocketId, type }) => {
    const sender = connectedUsers[socket.id];
    if (sender) {
      io.to(targetSocketId).emit('incoming-request', {
        fromSocketId: socket.id,
        callerName: sender.username,
        callerAvatar: sender.avatar,
        type
      });
    }
  });

  socket.on('accept-request', ({ targetSocketId, signalData, type }) => {
    io.to(targetSocketId).emit('request-accepted', {
      fromSocketId: socket.id,
      signalData,
      type
    });
  });

  socket.on('reject-request', ({ targetSocketId }) => {
    io.to(targetSocketId).emit('request-rejected', {
      fromSocketId: socket.id
    });
  });

  socket.on('send-chat-msg', ({ targetSocketId, message }) => {
    const sender = connectedUsers[socket.id];
    io.to(targetSocketId).emit('receive-chat-msg', {
      senderName: sender ? sender.username : 'مجهول',
      message
    });
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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
