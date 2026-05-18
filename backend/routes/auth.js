const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/db');
const { authRateLimiter } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Helper to generate secure JWT embedding token_version
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role, 
      society_id: user.society_id,
      token_version: user.token_version || 0 
    },
    process.env.JWT_SECRET || 'super_secure_32_character_random_jwt_secret_key_here',
    { expiresIn: '24h' }
  );
};

/**
 * @route GET /api/v1/auth/check-email
 * @desc Check real-time email availability during registration
 * @access Public
 */
router.get('/check-email', asyncHandler(async (req, res) => {
  const { email } = req.query;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, available: false, message: 'Invalid email format' });
  }

  const [existingUser] = await pool.query('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
  res.status(200).json({
    success: true,
    available: existingUser.length === 0
  });
}));

/**
 * @route POST /api/v1/auth/register
 * @desc Register representative user (Step 1 of Onboarding)
 * @access Public
 */
router.post('/register', authRateLimiter, [
  body('name').trim().notEmpty().withMessage('Full name is required.').isLength({ max: 120 }),
  body('email').trim().isEmail().withMessage('Please provide a valid email address.').normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.'),
  body('phone').optional().trim().isMobilePhone('en-IN').withMessage('Please provide a valid 10-digit mobile number.')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, email, password, phone, role } = req.body;
  const userRole = role || 'representative';

  // Check if user already exists
  const [existingUser] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (existingUser.length > 0) {
    return res.status(409).json({ success: false, message: 'An account with this email address already exists.' });
  }

  // Hash password securely with work factor 12
  const passwordHash = await bcrypt.hash(password, 12);

  // Insert representative user
  const [result] = await pool.query(
    'INSERT INTO users (name, email, password_hash, role, phone, token_version) VALUES (?, ?, ?, ?, ?, 0)',
    [name, email, passwordHash, userRole, phone || null]
  );

  const newUser = {
    id: result.insertId,
    name,
    email,
    role: userRole,
    society_id: null,
    token_version: 0
  };

  const token = generateToken(newUser);

  res.status(201).json({
    success: true,
    message: 'User registered successfully. Proceeding to society onboarding.',
    token,
    user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role, society_id: newUser.society_id }
  });
}));

/**
 * @route POST /api/v1/auth/login
 * @desc Authenticate user & return JWT token
 * @access Public
 */
router.post('/login', authRateLimiter, [
  body('email').trim().isEmail().withMessage('Please provide a valid email address.').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required.')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, password } = req.body;

  // Retrieve user record including token_version
  const [rows] = await pool.query(
    'SELECT id, name, email, password_hash, role, society_id, is_active, token_version FROM users WHERE email = ?',
    [email]
  );

  if (rows.length === 0) {
    return res.status(401).json({ success: false, message: 'Invalid authentication credentials.' });
  }

  const user = rows[0];

  if (!user.is_active) {
    return res.status(401).json({ success: false, code: 'TOKEN_REVOKED', message: 'Your user account has been deactivated. Please contact support.' });
  }

  // Check if OAuth-only user
  if (!user.password_hash) {
    return res.status(401).json({ success: false, message: 'This account was created via Google OAuth. Please sign in with Google.' });
  }

  // Validate password
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid authentication credentials.' });
  }

  // Update last login timestamp
  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

  const token = generateToken(user);

  res.status(200).json({
    success: true,
    message: 'Successfully authenticated.',
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, society_id: user.society_id }
  });
}));

/**
 * @route POST /api/v1/auth/google
 * @desc Authenticate or register user via Google OAuth identity token
 * @access Public
 */
router.post('/google', authRateLimiter, [
  body('token').notEmpty().withMessage('OAuth ID Token is required.'),
  body('email').isEmail().normalizeEmail(),
  body('name').trim().notEmpty(),
  body('googleId').notEmpty()
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { email, name, googleId, role, action } = req.body;
  const userRole = role || 'representative';

  // Check if user exists by email or oauth_uid including token_version
  const [rows] = await pool.query(
    'SELECT id, name, email, password_hash, oauth_provider, role, society_id, is_active, token_version FROM users WHERE email = ? OR oauth_uid = ?',
    [email, googleId]
  );

  let user;

  if (rows.length > 0) {
    user = rows[0];
    if (!user.is_active) {
      return res.status(401).json({ success: false, code: 'TOKEN_REVOKED', message: 'Your user account has been deactivated.' });
    }

    // Strict Authentication Provider Isolation:
    if (user.password_hash && user.oauth_provider !== 'google') {
      return res.status(403).json({
        success: false,
        message: 'This account was registered using email and password. Please sign in using your email and password.'
      });
    }

    await pool.query('UPDATE users SET last_login_at = NOW(), oauth_provider = ?, oauth_uid = ? WHERE id = ?', [
      'google', googleId, user.id
    ]);
  } else {
    // Brand new user
    const [result] = await pool.query(
      'INSERT INTO users (name, email, oauth_provider, oauth_uid, role, token_version) VALUES (?, ?, ?, ?, ?, 0)',
      [name, email, 'google', googleId, userRole]
    );

    user = {
      id: result.insertId,
      name,
      email,
      role: userRole,
      society_id: null,
      token_version: 0
    };
  }

  const token = generateToken(user);

  res.status(200).json({
    success: true,
    message: rows.length > 0 ? 'Successfully authenticated via Google.' : 'Google account linked and registered successfully.',
    token,
    isNewUser: rows.length === 0,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, society_id: user.society_id }
  });
}));

/**
 * @route GET /api/v1/auth/verify
 * @desc Verify session validity in real-time & return latest user/society info
 * @access Private
 */
router.get('/verify', authenticateToken, asyncHandler(async (req, res) => {
  const user = req.user;
  let society = null;

  if (user.society_id) {
    const [socRows] = await pool.query('SELECT id, name, custom_domain FROM societies WHERE id = ?', [user.society_id]);
    if (socRows.length > 0) {
      society = socRows[0];
    }
  }

  res.status(200).json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      society_id: user.society_id
    },
    society
  });
}));

/**
 * @route POST /api/v1/auth/logout
 * @desc Securely revoke user session across all devices by incrementing token_version
 * @access Private
 */
router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
  await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = ?', [req.user.id]);
  res.status(200).json({ success: true, message: 'Session successfully revoked across all devices.' });
}));

module.exports = router;
