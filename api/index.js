const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');

const app = express();
app.use(cors());
app.use(express.json());

function getDb() {
  let url = (process.env.TURSO_DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
  let authToken = (process.env.TURSO_AUTH_TOKEN || '').trim().replace(/^["']|["']$/g, '');

  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL atau TURSO_AUTH_TOKEN belum terpasang di Vercel.');
  }

  if (url.startsWith('https://')) {
    url = url.replace('https://', 'libsql://');
  } else if (!url.startsWith('libsql://')) {
    url = 'libsql://' + url;
  }

  return createClient({ url, authToken });
}

// Otomatis Buat Tabel Database
async function ensureTables(db) {
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
      min_stock INTEGER DEFAULT 5,
      image_url TEXT
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
  await db.execute(`
    CREATE TABLE IF NOT EXISTS store_hours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day_name TEXT UNIQUE,
      open_time TEXT,
      close_time TEXT,
      is_closed INTEGER DEFAULT 0
    );
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS store_holidays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      holiday_date TEXT UNIQUE,
      description TEXT
    );
  `);

  // Seed default Jam Operasional jika belum ada
  const checkHours = await db.execute("SELECT COUNT(*) as count FROM store_hours");
  if (Number(checkHours.rows[0]?.count || 0) === 0) {
    const days = [
      ['Senin', '08:00', '20:00', 0],
      ['Selasa', '08:00', '20:00', 0],
      ['Rabu', '08:00', '20:00', 0],
      ['Kamis', '08:00', '20:00', 0],
      ['Jumat', '08:00', '20:00', 0],
      ['Sabtu', '08:00', '21:00', 0],
      ['Minggu', '09:00', '17:00', 0]
    ];
    for (const d of days) {
      await db.execute({
        sql: `INSERT INTO store_hours (day_name, open_time, close_time, is_closed) VALUES (?, ?, ?, ?)`,
        args: d
      });
    }
  }
}

// GET ROUTES
app.get('/api/kpi', async (req, res) => {
  try {
    const db = getDb();
    await ensureTables(db);
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
    const db = getDb();
    await ensureTables(db);
    const result = await db.execute("SELECT * FROM bookings ORDER BY booking_date ASC, booking_time ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    const db = getDb();
    await ensureTables(db);
    const result = await db.execute("SELECT * FROM inventory ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pets', async (req, res) => {
  try {
    const db = getDb();
    await ensureTables(db);
    const result = await db.execute("SELECT * FROM pets ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET STORE HOURS & HOLIDAYS
app.get('/api/store-hours', async (req, res) => {
  try {
    const db = getDb();
    await ensureTables(db);
    const hours = await db.execute("SELECT * FROM store_hours");
    const holidays = await db.execute("SELECT * FROM store_holidays");
    res.json({ hours: hours.rows, holidays: holidays.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST STORE HOURS
app.post('/api/store-hours', async (req, res) => {
  try {
    const db = getDb();
    await ensureTables(db);
    const { day_name, open_time, close_time, is_closed } = req.body;
    await db.execute({
      sql: `UPDATE store_hours SET open_time = ?, close_time = ?, is_closed = ? WHERE day_name = ?`,
      args: [open_time, close_time, is_closed ? 1 : 0, day_name]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST ADD HOLIDAY
app.post('/api/store-holidays', async (req, res) => {
  try {
    const db = getDb();
    await ensureTables(db);
    const { holiday_date, description } = req.body;
    await db.execute({
      sql: `INSERT OR REPLACE INTO store_holidays (holiday_date, description) VALUES (?, ?)`,
      args: [holiday_date, description || 'Toko Libur']
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST BOOKING (Grooming / Dokter / Penitipan)
app.post('/api/bookings', async (req, res) => {
  try {
    const db = getDb();
    await ensureTables(db);
    const { customer_name, pet_name, pet_type, service_type, booking_date, booking_time } = req.body;
    await db.execute({
      sql: `INSERT INTO bookings (customer_name, pet_name, pet_type, service_type, booking_date, booking_time) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        customer_name || 'Pemilik',
        pet_name || 'Anabul',
        pet_type || 'Kucing',
        service_type || 'Full Grooming',
        booking_date || '-',
        booking_time || '-'
      ]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const db = getDb();
    await ensureTables(db);
    const { name, category, price, stock, min_stock, image_url } = req.body;
    await db.execute({
      sql: `INSERT INTO inventory (name, category, price, stock, min_stock, image_url) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        name || 'Produk Baru',
        category || 'Umum',
        Number(price) || 0,
        Number(stock) || 0,
        Number(min_stock) || 5,
        image_url || 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=300'
      ]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/pets', async (req, res) => {
  try {
    const db = getDb();
    await ensureTables(db);
    const { name, type, breed, owner_name, owner_phone } = req.body;
    await db.execute({
      sql: `INSERT INTO pets (name, type, breed, owner_name, owner_phone, medical_history) VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        name || 'Anabul',
        type || 'Kucing',
        breed || '-',
        owner_name || 'Pemilik',
        owner_phone || '-',
        '-'
      ]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = app;
