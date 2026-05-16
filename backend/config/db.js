const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const isRemoteHost = process.env.DB_HOST && process.env.DB_HOST !== 'localhost' && process.env.DB_HOST !== '127.0.0.1';

// Create a robust connection pool optimized for Hostinger Remote MySQL
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'propertease_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  ...(isRemoteHost ? { ssl: { rejectUnauthorized: false } } : {})
});

// Helper function to test pool connection on startup
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log(`[Database] Successfully connected to MySQL pool at host: ${process.env.DB_HOST || 'localhost'}`);
    connection.release();
    return true;
  } catch (error) {
    console.error('[Database Error] Failed to connect to MySQL database:', error.message);
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[Database Alert] Running in development mode without active SQL connection.');
    }
    return false;
  }
};

module.exports = {
  pool,
  testConnection
};
