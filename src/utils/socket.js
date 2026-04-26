const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

let io;
// Track how many sockets each user has (userId -> count)
const userSocketCount = new Map();

const init = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },
        pingInterval: 10000,  // Ping every 10s
        pingTimeout: 5000,    // If no pong in 5s, consider disconnected
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

        // Track socket count per user
        const userId = socket.user.id;
        userSocketCount.set(userId, (userSocketCount.get(userId) || 0) + 1);
        console.log(`📊 [Socket.io] User ${userId} now has ${userSocketCount.get(userId)} active socket(s)`);

        // Track all chat rooms this socket is in
        socket.chatRooms = new Set();

        // Global Online Status (only on FIRST connection)
        const chatService = require('../modules/common/chat/chat.service');
        if (userSocketCount.get(userId) === 1) {
            chatService.handleGlobalConnect(userId);
        }

        socket.on('join_room', (room) => {
            socket.join(room);
            console.log(`🏠 [Socket.io] Socket ${socket.id} joined room: ${room}`);
        });

        // --- Chat Events (Phase 112.1) ---
        socket.on('join_chat', async (roomId) => {
            socket.join(`chat_${roomId}`);
            socket.chatRooms.add(roomId); // Track all rooms
            
            const chatService = require('../modules/common/chat/chat.service');
            await chatService.handleJoin(roomId, socket.user.id, socket);
            
            console.log(`💬 [Socket.io] User ${socket.user.id} joined chat: ${roomId}`);
        });

        socket.on('leave_chat', async (roomId) => {
            socket.leave(`chat_${roomId}`);
            socket.chatRooms.delete(roomId);
            
            const chatService = require('../modules/common/chat/chat.service');
            chatService.handleLeave(roomId, socket.user.id);
        });

        socket.on('send_message', async (data) => {
            const chatService = require('../modules/common/chat/chat.service');
            try {
                const { roomId, content, type, customServiceData } = data;
                await chatService.sendMessage(roomId, socket.user.id, { content, type, customServiceData });
            } catch (err) {
                socket.emit('error', { message: err.message });
            }
        });

        socket.on('message_delivered', async (data) => {
            const chatService = require('../modules/common/chat/chat.service');
            try {
                const { messageId, roomId } = data;
                await chatService.markAsDelivered(messageId, roomId);
            } catch (err) {
                console.error('Failed to mark delivered:', err.message);
            }
        });

        socket.on('typing_status', (data) => {
            const chatService = require('../modules/common/chat/chat.service');
            const { roomId, isTyping } = data;
            chatService.handleTyping(roomId, socket.user.id, isTyping);
        });

        // --- WebRTC Calling Events (Enhanced) ---
        socket.on('call_initiate', async (data) => {
            const callService = require('../modules/common/call/call.service');
            try {
                const { roomId, type } = data;
                await callService.initiateCall(roomId, socket.user.id, type);
            } catch (err) {
                socket.emit('error', { message: err.message });
            }
        });

        socket.on('call_accept', (data) => {
            const callService = require('../modules/common/call/call.service');
            const { roomId } = data;
            callService.acceptCall(roomId, socket.user.id);
        });

        socket.on('webrtc_signal', (data) => {
            const callService = require('../modules/common/call/call.service');
            const { roomId, signal } = data;
            callService.relaySignal(roomId, socket.user.id, signal);
        });

        socket.on('call_end', (data) => {
            const callService = require('../modules/common/call/call.service');
            const { roomId, reason } = data;
            callService.handleEndCall(roomId, socket.user.id, reason);
        });

        socket.on('disconnect', () => {
            const uid = socket.user.id;
            console.log(`🔌 [Socket.io] Client disconnected: ${socket.id} (User: ${uid})`);
            
            const chatService = require('../modules/common/chat/chat.service');
            
            // Decrement socket count
            const count = (userSocketCount.get(uid) || 1) - 1;
            if (count <= 0) {
                userSocketCount.delete(uid);
                // Only mark globally offline when ALL sockets for this user are gone
                chatService.handleGlobalDisconnect(uid);
                console.log(`👤 [Socket.io] User ${uid} fully offline (0 sockets)`);
            } else {
                userSocketCount.set(uid, count);
                console.log(`📊 [Socket.io] User ${uid} still has ${count} socket(s)`);
            }

            // Cleanup ALL chat room presences for this socket
            if (socket.chatRooms && socket.chatRooms.size > 0) {
                for (const roomId of socket.chatRooms) {
                    chatService.handleLeave(roomId, uid);
                }
            }
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
