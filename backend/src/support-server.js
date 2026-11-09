require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const origins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || origins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS origin denied'));
  },
}));
app.use(express.json({limit: '16kb'}));
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
}));
app.get('/api/health', (req, res) => res.json({status: 'ok', service: 'roomrent-support-api'}));
app.use('/api/support', require('./modules/support/routes'));
app.use((req, res) => res.status(404).json({
  error: {code: 'NOT_FOUND', message: 'Route not found'},
}));
app.use((error, req, res, next) => {
  if (error.status >= 500 || !error.status) console.error('[Support API Error]', error.message);
  const status = error.status || 500;
  return res.status(status).json({
    error: {
      code: status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      message: status === 500 ? 'Support service error' : error.message,
    },
  });
});

const port = Number(process.env.SUPPORT_PORT || process.env.PORT || 5000);
const server = app.listen(port, () => {
  console.log(`RoomRent support API listening on :${port}`);
});

function shutdown() {
  server.close(error => {
    if (error) {
      console.error('[Support API shutdown failed]', error.message);
      process.exitCode = 1;
    }
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
