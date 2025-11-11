const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const users = new Map();

function ensureUser(id) {
  if (!users.has(id)) {
    users.set(id, {
      clicks: 0,
      usdt: 0,
      counter: 30,
      autoClickEnabled: false,
      timeLeft: 3 * 3600,
      mysteryLastClaim: 0,
      quickLastClaim: 0,
      joined: false
    });
  }
}

app.get('/api/user/:id', (req, res) => {
  const id = Number(req.params.id);
  ensureUser(id);
  res.json(users.get(id));
});

app.post('/api/user/:id', (req, res) => {
  const id = Number(req.params.id);
  ensureUser(id);
  const user = users.get(id);
  Object.assign(user, req.body);
  res.json({ success: true, user });
});

app.post('/api/withdraw', (req, res) => {
  const { userId, amount, address } = req.body;
  ensureUser(userId);
  const user = users.get(userId);
  if (user.usdt < amount) return res.status(400).json({ error: 'Insufficient USDT' });

  user.usdt -= amount;
  res.json({ success: true, user });
});

module.exports = app;
