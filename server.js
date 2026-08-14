const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname)));

// تخزين المستخدمين المتصلين: socket.id -> { username, room }
const users = {};

io.on('connection', (socket) => {
  console.log('مستخدم جديد اتصل:', socket.id);

  // 1. تسجيل اسم المستخدم وانضمامه للغرفة
  socket.on('join-room', ({ username, room }) => {
    users[socket.id] = { username, room };
    socket.join(room);

    // تحديث قائمة المستخدمين في هذه الغرفة
    updateRoomUsers(room);
  });

  // 2. إرسال طلب اتصال خاص لشخص معين (1-on-1)
  socket.on('call-user', ({ targetSocketId, signalData }) => {
    const caller = users[socket.id];
    io.to(targetSocketId).emit('incoming-call', {
      fromSocketId: socket.id,
      callerName: caller ? caller.username : 'شخص ما',
      signalData
    });
  });

  // 3. قبول الاتصال المباشر
  socket.on('accept-call', ({ targetSocketId, signalData }) => {
    io.to(targetSocketId).emit('call-accepted', { signalData });
  });

  // 4. رفض أو إنهاء المكالمة
  socket.on('reject-call', ({ targetSocketId }) => {
    io.to(targetSocketId).emit('call-rejected');
  });

  // عند انقطاع الاتصال
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      const room = user.room;
      delete users[socket.id];
      updateRoomUsers(room);
    }
  });

  function updateRoomUsers(room) {
    const roomUsers = Object.entries(users)
      .filter(([id, u]) => u.room === room)
      .map(([id, u]) => ({ socketId: id, username: u.username }));

    io.to(room).emit('room-users', roomUsers);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
