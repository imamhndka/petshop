const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');

const app = express();
app.use(cors());
app.use(express.json());

// Inisialisasi DB Turso via Environment Variables Vercel
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let isMigrated = false;
async function initDb() {
  if (isMigrated) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT,
      pet_name TEXT,
      pet_type TEXT,
      service_type TEXT,
      booking_date TEXT,
      booking_time TEXT,
      status TEXT DEFAULT 'Pending'
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      category TEXT,
      price INTEGER,
      stock INTEGER,
      min_stock INTEGER DEFAULT 5
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      type TEXT,
      breed TEXT,
      owner_name TEXT,
      owner_phone TEXT,
      medical_history TEXT
    );
  `);
  isMigrated = true;
}

app.use(async (req, res, next) => {
  try {
    await initDb();
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database connection error: ' + err.message });
  }
});

// API Routes
app.get('/api/kpi', async (req, res) => {
  try {
    const bookings = await db.execute("SELECT COUNT(*) as total FROM bookings");
    const lowStock = await db.execute("SELECT COUNT(*) as total FROM inventory WHERE stock <= min_stock");
    res.json({
      todayBookings: Number(bookings.rows[0]?.total || 0),
      lowStock: Number(lowStock.rows[0]?.total || 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM bookings ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    const { customer_name, pet_name, pet_type, service_type, booking_date, booking_time } = req.body;
    await db.execute({
      sql: `INSERT INTO bookings (customer_name, pet_name, pet_type, service_type, booking_date, booking_time) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [customer_name, pet_name, pet_type, service_type, booking_date, booking_time]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM inventory ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const { name, category, price, stock, min_stock } = req.body;
    await db.execute({
      sql: `INSERT INTO inventory (name, category, price, stock, min_stock) VALUES (?, ?, ?, ?, ?)`,
      args: [name, category, price, stock, min_stock || 5]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pets', async (req, res) => {
  try {
    const result = await db.execute("SELECT * FROM pets ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pets', async (req, res) => {
  try {
    const { name, type, breed, owner_name, owner_phone, medical_history } = req.body;
    await db.execute({
      sql: `INSERT INTO pets (name, type, breed, owner_name, owner_phone, medical_history) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [name, type, breed, owner_name, owner_phone, medical_history]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;