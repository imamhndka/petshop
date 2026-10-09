const express = require('express');
const cors = require('cors');
const { createClient } = require('@libsql/client');

const app = express();
app.use(cors());
app.use(express.json());

// Helper Inisialisasi Database Turso
function getDb() {
  let url = (process.env.TURSO_DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
  let authToken = (process.env.TURSO_AUTH_TOKEN || '').trim().replace(/^["']|["']$/g, '');

  if (!url || !authToken) {
    throw new Error('TURSO_DATABASE_URL atau TURSO_AUTH_TOKEN belum diatur di Vercel.');
  }

  if (url.startsWith('https://')) {
    url = url.replace('https://', 'libsql://');
  } else if (!url.startsWith('libsql://')) {
    url = 'libsql://' + url;
  }

  return createClient({ url, authToken });
}

// Helper Buat Tabel Database
async function createTables(db) {
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
}

// ENDPOINT SEED (/api/seed)
app.get('/api/seed', async (req, res) => {
  try {
    const db = getDb();
    await createTables(db);

    await db.execute(`DELETE FROM inventory`);
    const dummyProducts = [
      ['Royal Canin Adult Cat 2kg', 'Makanan Kucing', 285000, 18, 5, 'https://images.unsplash.com/photo-1589924691995-400dc9ecc119?w=300'],
      ['Whiskas Wet Food Pouch 85g', 'Makanan Kucing', 8500, 45, 10, 'https://images.unsplash.com/photo-1535294435445-d7249524ef2e?w=300'],
      ['Pro Plan Dog Puppy 2.5kg', 'Makanan Anjing', 320000, 12, 3, 'https://images.unsplash.com/photo-1568640347023-a616a30bc3bd?w=300'],
      ['Shampoo Anti Kutu Anabul 250ml', 'Obat & Aksesori', 65000, 3, 5, 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300'],
      ['Kalung Kucing Lonceng Lucu', 'Aksesori', 15000, 25, 5, 'https://images.unsplash.com/photo-1601758228041-f3b2795255f1?w=300']
    ];
    for (const p of dummyProducts) {
      await db.execute({
        sql: `INSERT INTO inventory (name, category, price, stock, min_stock, image_url) VALUES (?, ?, ?, ?, ?, ?)`,
        args: p
      });
    }

    await db.execute(`DELETE FROM bookings`);
    const dummyBookings = [
      ['Budi Santoso', 'Milo', 'Kucing', 'Full Grooming', '2026-10-10', '09:00'],
      ['Siti Rahma', 'Rocky', 'Anjing', 'Penitipan Hotel', '2026-10-10', '11:00'],
      ['Dewi Lestari', 'Mochi', 'Kucing', 'Grooming Anti Kutu', '2026-10-11', '14:00']
    ];
    for (const b of dummyBookings) {
      await db.execute({
        sql: `INSERT INTO bookings (customer_name, pet_name, pet_type, service_type, booking_date, booking_time) VALUES (?, ?, ?, ?, ?, ?)`,
        args: b
      });
    }

    await db.execute(`DELETE FROM pets`);
    const dummyPets = [
      ['Milo', 'Kucing', 'Persian Longhair', 'Budi Santoso', '08123456789', '-'],
      ['Rocky', 'Anjing', 'Poodle', 'Siti Rahma', '08987654321', '-'],
      ['Mochi', 'Kucing', 'Domestic Shorthair', 'Dewi Lestari', '08556677889', '-']
    ];
    for (const pt of dummyPets) {
      await db.execute({
        sql: `INSERT INTO pets (name, type, breed, owner_name, owner_phone, medical_history) VALUES (?, ?, ?, ?, ?, ?)`,
        args: pt
      });
    }

    res.json({ success: true, message: 'Data dummy berhasil disimpan!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET ROUTES
app.get('/api/kpi', async (req, res) => {
  try {
    const db = getDb();
    const bookings = await db.execute("SELECT COUNT(*) as total FROM bookings");
    const lowStock = await db.execute("SELECT COUNT(*) as total FROM inventory WHERE stock <= min_stock");
    res.json({
      todayBookings: Number(bookings.rows[0]?.total || 0),
      lowStock: Number(lowStock.rows[0]?.total || 0)
    });
  } catch (err) {
    res.json({ todayBookings: 0, lowStock: 0 });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute("SELECT * FROM bookings ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/inventory', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute("SELECT * FROM inventory ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/pets', async (req, res) => {
  try {
    const db = getDb();
    const result = await db.execute("SELECT * FROM pets ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    res.json([]);
  }
});

// POST ROUTES (Dengan Sanitasi Argumen Bebas Undefined)
app.post('/api/bookings', async (req, res) => {
  try {
    const db = getDb();
    await createTables(db);
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
    await createTables(db);
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
    await createTables(db);
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
