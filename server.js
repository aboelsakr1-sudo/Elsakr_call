const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// السماح بتقديم الملفات الثابتة
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    console.log('مستخدم متصل:', socket.id);
    
    // إبلاغ الجميع بالاتصال
    socket.broadcast.emit('user-connected', socket.id);

    // استقبال وإعادة إرسال رسائل الدردشة
    socket.on('chat message', (msg) => {
        io.emit('chat message', { sender: socket.id, text: msg });
    });

    // إشارات مكالمة الفيديو (WebRTC Signaling)
    socket.on('offer', (data) => {
        socket.broadcast.emit('offer', data);
    });

    socket.on('answer', (data) => {
        socket.broadcast.emit('answer', data);
    });

    socket.on('ice-candidate', (data) => {
        socket.broadcast.emit('ice-candidate', data);
    });

    socket.on('hangup', () => {
        socket.broadcast.emit('hangup');
    });

    socket.on('disconnect', () => {
        console.log('قطع الاتصال:', socket.id);
        socket.broadcast.emit('user-disconnected', socket.id);
    });
});
// التكيف مع المنفذ الذي تحدده المنصة أو استخدام 3000 كمحلي
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ: ${PORT}`);
});
