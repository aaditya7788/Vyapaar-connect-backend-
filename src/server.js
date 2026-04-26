require('dotenv').config();
const http = require('http');
const app = require('./app');
const socketUtils = require('./utils/socket');

const env = require('./config/env');

const PORT = env.PORT || 5000;

// Create HTTP Server
const server = http.createServer(app);

// Initialize Socket.io
socketUtils.init(server);

// Initialize Firebase Admin
const { initializeFirebase } = require('./utils/firebase');
initializeFirebase();

server.listen(PORT, () => {
    console.log(`🚀 Server running in ${env.APP_ENV.toUpperCase()} mode on port ${PORT}`);
});
