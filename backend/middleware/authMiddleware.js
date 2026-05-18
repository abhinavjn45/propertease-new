const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

/**
 * Enterprise Zero-Trust Token Verification Middleware
 * Validates JWT cryptographically AND performs real-time MySQL query
 * to ensure user record exists, is active, and token_version has not been revoked.
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, code: 'MISSING_TOKEN', message: 'Access denied. Missing authentication token.' });
  }

  jwt.verify(
    token, 
    process.env.JWT_SECRET || 'super_secure_32_character_random_jwt_secret_key_here', 
    async (err, decoded) => {
      if (err) {
        return res.status(401).json({ success: false, code: 'TOKEN_EXPIRED', message: 'Invalid or expired authentication token.' });
      }

      try {
        // Zero-Trust Active Database Verification
        const [userRows] = await pool.query(
          'SELECT id, name, email, role, society_id, is_active, token_version FROM users WHERE id = ?',
          [decoded.id]
        );

        if (userRows.length === 0) {
          return res.status(401).json({ success: false, code: 'TOKEN_REVOKED', message: 'User account no longer exists. Session revoked.' });
        }

        const user = userRows[0];

        if (!user.is_active) {
          return res.status(401).json({ success: false, code: 'TOKEN_REVOKED', message: 'User account has been deactivated. Session revoked.' });
        }

        if (decoded.token_version !== undefined && user.token_version !== decoded.token_version) {
          return res.status(401).json({ success: false, code: 'TOKEN_REVOKED', message: 'Security credentials modified or session revoked across devices. Please log in again.' });
        }

        req.user = user;
        next();
      } catch (dbError) {
        console.error('[Auth Middleware Error] Failed database session lookup:', dbError);
        return res.status(500).json({ success: false, message: 'Internal server error during session verification.' });
      }
    }
  );
};

module.exports = { authenticateToken };
