const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

let io;

const init = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // Authentication Middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error("Authentication error: No token provided"));
        }

        try {
            const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET);
            socket.user = { id: decoded.userId };
            console.log(`🔒 [Socket.io] Authenticated: ${decoded.userId}`);
            next();
        } catch (err) {
            return next(new Error("Authentication error: Invalid token"));
        }
    });

    io.on('connection', (socket) => {
        console.log(`📡 [Socket.io] New client connected: ${socket.id} (User: ${socket.user.id})`);

        // Join personal room automatically
        socket.join(`user_${socket.user.id}`);

        socket.on('join_room', (room) => {
            socket.join(room);
            console.log(`🏠 [Socket.io] Socket ${socket.id} joined room: ${room}`);
        });

        socket.on('disconnect', () => {
            console.log(`🔌 [Socket.io] Client disconnected: ${socket.id}`);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error("Socket.io not initialized!");
    }
    return io;
};

module.exports = {
    init,
    getIO
};
