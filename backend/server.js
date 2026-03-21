const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

// Load env vars
dotenv.config();

if (!process.env.MONGODB_URI) {
  console.error('Missing MONGODB_URI environment variable. Please set it in your .env file.');
  process.exit(1);
}

const NODE_ENV = process.env.NODE_ENV || 'development';

// Connect to database
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database: ${conn.connection.name}`);
  } catch (err) {
    console.error(`❌ MongoDB Connection Error: ${err.message}`);
    console.log('TIP: Ensure your MongoDB Atlas IP Whitelist allows this connection or use a local MongoDB instance.');
    process.exit(1); // Exit process with failure
  }
};

connectDB();

const app = express();

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Enable CORS
app.use(cors());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Static folder for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// Route files
const auth = require('./routes/auth');
const kyc = require('./routes/kyc');

// Mount routers
app.use('/api/auth', auth);
app.use('/api/kyc', kyc);

app.get('/', (req, res) => {
  res.send('✅ KYC Compliance Backend is running');
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running in ${NODE_ENV} mode on port ${PORT}`);
  console.log(`📍 Backend URL: http://localhost:${PORT}`);
  console.log(`📍 MongoDB URI: ${process.env.MONGODB_URI}`);
});
