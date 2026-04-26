const prisma = require('../../../db');
const { getIO } = require('../../../utils/socket');
const { getFirestore, admin } = require('../../../utils/firebase');
const notificationService = require('../booking/booking.notification');

class ChatService {
    constructor() {
        this.roomPresence = new Map(); // roomId -> Set of userIds
        this.globalActiveUsers = new Set(); // Set of userIds
    }
    /**
     * Get or create a chat room for a booking.
     */
    async getOrCreateRoom(bookingId) {
        let room = await prisma.chatRoom.findUnique({
            where: { bookingId }
        });

        if (!room) {
            room = await prisma.chatRoom.create({
                data: { bookingId, isLocked: false } // Unlock by default if requested?
            });
        }
        return room;
    }

    /**
     * Create a locked chat room for a booking.
     */
    async createRoom(bookingId) {
        return await prisma.chatRoom.create({
            data: { bookingId, isLocked: true }
        });
    }

    /**
     * Unlock a chat room when booking is confirmed.
     */
    async unlockRoom(bookingId) {
        const room = await prisma.chatRoom.update({
            where: { bookingId },
            data: { isLocked: false }
        });

        // Notify participants via socket
        const io = getIO();
        io.to(`chat_${room.id}`).emit('chat_unlocked', { roomId: room.id });

        return room;
    }

    /**
     * Save a message and broadcast to the room.
     */
    async sendMessage(roomId, senderId, { content, type, customServiceData }) {
        // 1. Check if room exists and is not locked
        const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
        if (!room) throw new Error('Chat room not found.');
        if (room.isLocked) throw new Error('Chat is locked until booking is confirmed.');

        // 2. Check Presence for immediate READ status
        const presence = this.roomPresence.get(roomId) || new Set();
        const isRecipientPresent = Array.from(presence).some(uid => uid !== senderId);

        console.log(`💬 [Chat] sendMessage in room ${roomId} by ${senderId}`);
        console.log(`💬 [Chat] Room presence: [${Array.from(presence).join(', ')}], recipientPresent: ${isRecipientPresent}`);

        // 3. Save Message to DB (SQL)
        const message = await prisma.message.create({
            data: {
                roomId,
                senderId,
                content,
                type: type || 'TEXT',
                status: isRecipientPresent ? 'READ' : 'SENT',
                seenAt: isRecipientPresent ? new Date() : null,
                deliveredAt: isRecipientPresent ? new Date() : null,
                customServiceData: customServiceData || null,
                approvalStatus: type === 'CUSTOM_SERVICE' ? 'PENDING' : null
            }
        });

        // 3. Mirror to Firestore for Real-time
        try {
            const firestore = getFirestore();
            if (firestore) {
                await firestore.collection('chats').doc(roomId).collection('messages').doc(message.id).set({
                    ...message,
                    createdAt: admin.firestore.Timestamp.fromDate(new Date(message.createdAt))
                });
            }
        } catch (e) {
            console.error('⚠️ [Firestore] Sync failed:', e.message);
        }

        // 4. Emit via Socket
        const io = getIO();
        io.to(`chat_${roomId}`).emit('receive_message', message);

        // 5. Trigger Push for recipient (runs async, don't await)
        console.log(`📤 [Chat] Triggering push notification check for room ${roomId}...`);
        this.triggerPushForRecipient(roomId, senderId, message);

        return message;
    }

    async triggerPushForRecipient(roomId, senderId, message) {
        try {
            // Recipient Check: Determine who is on the other side of this booking
            const room = await prisma.chatRoom.findUnique({
                where: { id: roomId },
                include: {
                    booking: {
                        include: {
                            user: { select: { id: true, fullName: true } },
                            shop: { 
                                include: { 
                                    providerProfile: { select: { userId: true } }
                                } 
                            }
                        }
                    }
                }
            });
            
            if (!room || !room.booking) return;
            const booking = room.booking;

            // Resolve recipient correctly
            // If sender is the booking user (customer), recipient is the provider's USER ID
            // If sender is NOT the booking user, recipient is the booking user (customer)
            const recipientId = (senderId === booking.userId)
                ? (booking.shop?.providerProfile?.userId || booking.shop?.userId)
                : booking.userId;

            if (!recipientId) {
                console.warn(`⚠️ [Push] Could not resolve recipientId for room ${roomId}`);
                return;
            }

            // Only skip push if recipient is ACTIVELY in room AND has socket focus
            const presence = this.roomPresence.get(roomId) || new Set();
            const isRecipientInRoom = presence.has(recipientId);

            if (isRecipientInRoom) {
                console.log(`✉️ [Push] Recipient ${recipientId} is in room ${roomId}. Skipping push.`);
                return;
            }

            console.log(`📤 [Push] Recipient ${recipientId} not in room. Sending push...`);

            // Resolve sender name for display
            let senderName = "User";
            const isProviderSender = (senderId !== booking.userId);
            
            if (isProviderSender) {
                senderName = booking.shop?.name || "Service Provider";
            } else {
                senderName = booking.user?.fullName || "Customer";
            }

            await notificationService.sendChatPush(
                recipientId,
                senderName,
                message.content,
                {
                    roomId,
                    senderId,
                    bookingId: booking.id,
                    bookingUserId: booking.userId,
                    type: 'CHAT_MESSAGE'
                }
            );
        } catch (e) {
            console.error('⚠️ [Push] Chat signaling failed:', e.message);
        }
    }

    /**
     * Get chat history with pagination.
     */
    async getHistory(roomId, limit = 50, before = null) {
        const query = {
            where: { roomId },
            take: limit,
            orderBy: { createdAt: 'desc' } // Newest first for pagination
        };

        if (before) {
            query.where.createdAt = { lt: new Date(before) };
        }

        const messages = await prisma.message.findMany(query);
        return messages.reverse(); // Return in chronological order
    }

    /**
     * Get NEW messages since a timestamp (for reconnect sync).
     */
    async getNewMessagesSince(roomId, since) {
        return await prisma.message.findMany({
            where: {
                roomId,
                createdAt: { gt: new Date(since) }
            },
            orderBy: { createdAt: 'asc' }
        });
    }

    /**
     * Handle Custom Service Approval
     */
    async updateMessageApproval(messageId, status) {
        const message = await prisma.message.update({
            where: { id: messageId },
            data: { approvalStatus: status }
        });

        const io = getIO();
        io.to(`chat_${message.roomId}`).emit('message_updated', message);

        return message;
    }

    /**
     * Signal a call initiation (VOIP simulation)
     */
    async signalCall(roomId, senderId, action) {
        const io = getIO();
        const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, include: { booking: true } });
        if (!room) return;

        // Broadcast to Firestore for Real-time Signaling
        try {
            const firestore = getFirestore();
            if (firestore) {
                await firestore.collection('chats').doc(roomId).update({
                    lastCall: {
                        senderId,
                        action,
                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                    }
                });
            }
        } catch (e) {
            console.error('⚠️ [Firestore] Signaling failed:', e.message);
        }

        io.to(`chat_${roomId}`).emit('call_event', {
            roomId,
            senderId,
            action, // 'STARTING', 'ENDING', 'RINGING'
            booking: room.booking
        });

        // Trigger Call Push if STARTING
        if (action === 'STARTING') {
            const sender = await prisma.user.findUnique({ where: { id: senderId } });
            const recipientId = (senderId === room.booking.userId)
                ? room.booking.shop.userId
                : room.booking.userId;

            await notificationService.sendCallPush(
                recipientId,
                sender?.fullName || 'Provider',
                {
                    roomId,
                    action,
                    bookingId: room.booking.id,
                    bookingUserId: room.booking.userId
                }
            );
        }
    }

    /**
     * Mark a specific message as delivered.
     */
    async markAsDelivered(messageId, roomId) {
        const message = await prisma.message.update({
            where: { id: messageId },
            data: {
                status: 'DELIVERED',
                deliveredAt: new Date()
            }
        });

        const io = getIO();
        io.to(`chat_${roomId}`).emit('message_updated', message);
    }

    /**
     * Mark all messages in a room as read for a user.
     */
    async markAsRead(roomId, userId) {
        await prisma.message.updateMany({
            where: {
                roomId,
                senderId: { not: userId },
                status: { not: 'READ' }
            },
            data: {
                status: 'READ',
                seenAt: new Date()
            }
        });

        const io = getIO();
        io.to(`chat_${roomId}`).emit('messages_read', { roomId, userId });
    }

    /**
     * Handle user joining a room (Presence + Read Sync)
     */
    async handleJoin(roomId, userId, socket) {
        if (!this.roomPresence.has(roomId)) {
            this.roomPresence.set(roomId, new Set());
        }
        this.roomPresence.get(roomId).add(userId);

        // 1. Sync Read status
        await this.markAsRead(roomId, userId);

        // 2. Broadcast Presence update
        const io = getIO();
        io.to(`chat_${roomId}`).emit('presence_update', {
            roomId,
            onlineCount: this.roomPresence.get(roomId).size
        });

        // 3. Fetch the other participant and send their REAL status to the joining user
        try {
            const room = await prisma.chatRoom.findUnique({
                where: { id: roomId },
                include: {
                    booking: {
                        include: {
                            user: { select: { id: true, isOnline: true, lastSeen: true } },
                            shop: {
                                include: {
                                    providerProfile: {
                                        include: {
                                            user: { select: { id: true, isOnline: true, lastSeen: true } }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            if (room) {
                const booking = room.booking;
                const providerUserId = booking.shop?.providerProfile?.userId;
                const otherUserId = (userId === booking.userId)
                    ? providerUserId
                    : booking.userId;

                const otherUser = (userId === booking.userId)
                    ? booking.shop?.providerProfile?.user
                    : booking.user;

                if (otherUser && otherUserId) {
                    // Check in-memory first (more accurate for real-time)
                    const isOtherOnline = this.globalActiveUsers.has(otherUserId);

                    const statusPayload = {
                        userId: otherUserId,
                        status: isOtherOnline ? 'ONLINE' : 'OFFLINE',
                        lastSeen: otherUser.lastSeen
                    };

                    console.log(`📡 [Chat] Sending ${statusPayload.status} status of user ${otherUserId} to joining user ${userId}`);

                    // Emit DIRECTLY to the joining socket (not room broadcast)
                    if (socket) {
                        socket.emit('user_status_update', statusPayload);
                    } else {
                        // Fallback: emit to user's personal room
                        io.to(`user_${userId}`).emit('user_status_update', statusPayload);
                    }
                }

                // Also notify the OTHER user that this user just came online (room broadcast)
                io.to(`chat_${roomId}`).emit('user_status_update', {
                    userId: userId,
                    status: 'ONLINE'
                });
            }
        } catch (e) {
            console.error('⚠️ [Chat] handleJoin status fetch failed:', e.message);
        }
    }

    /**
     * Handle user leaving a room
     */
    handleLeave(roomId, userId) {
        if (this.roomPresence.has(roomId)) {
            this.roomPresence.get(roomId).delete(userId);

            const io = getIO();
            io.to(`chat_${roomId}`).emit('presence_update', {
                roomId,
                onlineCount: this.roomPresence.get(roomId).size
            });
        }
    }

    /**
     * Handle global user connection
     */
    async handleGlobalConnect(userId) {
        this.globalActiveUsers.add(userId);

        // Persist to DB
        await prisma.user.update({
            where: { id: userId },
            data: { isOnline: true }
        }).catch(err => console.error('Presence DB Error:', err.message));

        const io = getIO();
        io.emit('user_status_update', { userId, status: 'ONLINE' });
        console.log(`👤 [Presence] User ${userId} is now ONLINE`);
    }

    /**
     * Handle global user disconnection
     */
    async handleGlobalDisconnect(userId) {
        this.globalActiveUsers.delete(userId);

        // Persist to DB
        await prisma.user.update({
            where: { id: userId },
            data: {
                isOnline: false,
                lastSeen: new Date()
            }
        }).catch(err => console.error('Presence DB Error:', err.message));

        const io = getIO();
        io.emit('user_status_update', { userId, status: 'OFFLINE', lastSeen: new Date() });
        console.log(`👤 [Presence] User ${userId} is now OFFLINE`);
    }

    /**
     * Check if a user is online
     */
    isUserOnline(userId) {
        return this.globalActiveUsers.has(userId);
    }

    /**
     * Handle Typing Status
     */
    handleTyping(roomId, userId, isTyping) {
        const io = getIO();
        io.to(`chat_${roomId}`).emit('typing_status', {
            roomId,
            userId,
            isTyping
        });
    }
    /**
     * Get all chat rooms for a user (Inbox).
     */
    async getUserRooms(userId, roles = [], includeAll = false, page = 1, limit = 15) {
        const isProvider = Array.isArray(roles) && roles.includes('provider');
        const skip = (page - 1) * limit;

        // Find rooms where the user is either the customer (booking.userId)
        // or the provider (booking.shop.providerProfile.userId)
        const whereClause = {
            booking: {
                OR: [
                    { userId: userId },
                    { shop: { providerProfile: { userId: userId } } }
                ]
            }
        };

        /**
         * ROLE-BASED FILTERING (Phase Hardening)
         * 1. Customers: Always see a per-booking clean view. Completed jobs disappear from Inbox.
         * 2. Providers: Keep rooms visible for history/records as per shop context.
         */
        if (!includeAll && !isProvider) {
            whereClause.booking.status = {
                notIn: ['COMPLETED', 'CANCELLED', 'DECLINED', 'EXPIRED']
            };
        }

        const [rooms, totalCount] = await Promise.all([
            prisma.chatRoom.findMany({
                where: whereClause,
                take: limit,
                skip: skip,
                include: {
                    booking: {
                        include: {
                            user: { select: { id: true, fullName: true, avatar: true } },
                            shop: { 
                                include: { 
                                    providerProfile: { 
                                        include: { 
                                            user: { select: { id: true, fullName: true, avatar: true } } 
                                        } 
                                    } 
                                } 
                            }
                        }
                    },
                    messages: {
                        take: 1,
                        orderBy: { createdAt: 'desc' }
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            }),
            prisma.chatRoom.count({ where: whereClause })
        ]);

        // Map to inject unread count and flatten last message
        const roomsWithMeta = await Promise.all(rooms.map(async (room) => {
            const unreadCount = await prisma.message.count({
                where: {
                    roomId: room.id,
                    senderId: { not: userId },
                    status: { not: 'READ' }
                }
            });

            return {
                ...room,
                lastMessage: room.messages[0] || null,
                unreadCount
            };
        }));

        // Sort by last message date primarily, then by room update date
        const sortedRooms = roomsWithMeta.sort((a, b) => {
            const dateA = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(a.updatedAt);
            const dateB = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(b.updatedAt);
            return dateB - dateA;
        });

        return {
            rooms: sortedRooms,
            totalCount,
            totalPages: Math.ceil(totalCount / limit),
            currentPage: parseInt(page)
        };
    }
}

module.exports = new ChatService();
