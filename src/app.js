const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const routes = require('./routes');

const app = express();

// Trust proxy (necessary for express-rate-limit when behind a proxy)
app.set('trust proxy', 1);

// Standard Middlewares
app.use(helmet());
app.use(cors());
app.use(require('compression')());
app.use(express.json());
app.use(morgan('dev'));

// Static Folders
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/', express.static(path.join(__dirname, '../public')));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5000// limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// API Routes
app.use('/api', routes);

app.use('/', (req, res) => {
  res.json({
    "welcome": "Welcome to the backend of LocalConnect"
  })
})

// Global Error Handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  // console.error(`[API ERROR] ${status} - ${err.message}`);

  res.status(status).json({
    status: 'error',
    message: err.message || 'Internal Server Error'
  });
});

module.exports = app;
