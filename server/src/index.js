require('dotenv').config();

const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const { setupGameSocket } = require('./socket/gameSocket');

const app = express();
const server = http.createServer(app);

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const io = new Server(server, {
  cors: {
    origin: [CLIENT_URL, BASE_URL],
    methods: ['GET', 'POST'],
  },
});

app.use(cors({ origin: [CLIENT_URL, BASE_URL] }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/auth', authRoutes);

// Serve client build in production
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

setupGameSocket(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Hitster server running on port ${PORT}`);
  console.log(`Base URL: ${BASE_URL}`);
});
