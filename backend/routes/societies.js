const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/db');
const { globalRateLimiter } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Authentication validation middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. Missing authentication token.' });
  }

  jwt.verify(
    token, 
    process.env.JWT_SECRET || 'super_secure_32_character_random_jwt_secret_key_here', 
    (err, user) => {
      if (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired authentication token.' });
      }
      req.user = user;
      next();
    }
  );
};

/**
 * @route POST /api/v1/societies/onboard
 * @desc Create society record & associate with authenticated representative user (Step 2)
 * @access Private
 */
router.post('/onboard', authenticateToken, globalRateLimiter, [
  body('name').trim().notEmpty().withMessage('Society name is required.').isLength({ max: 255 }),
  body('registrationNumber').trim().notEmpty().withMessage('RCS registration number is required.'),
  body('totalUnits').isInt({ min: 1 }).withMessage('Total units must be a valid positive integer.'),
  body('address').trim().notEmpty().withMessage('Physical address is required.'),
  body('city').trim().notEmpty().withMessage('City is required.'),
  body('state').trim().notEmpty().withMessage('State is required.'),
  body('pincode').trim().isPostalCode('IN').withMessage('Valid 6-digit Indian PIN code is required.')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { name, registrationNumber, totalUnits, address, city, state, pincode } = req.body;
  const userId = req.user.id;

  // Verify registration number uniqueness
  const [existingSociety] = await pool.query('SELECT id FROM societies WHERE registration_number = ?', [registrationNumber]);
  if (existingSociety.length > 0) {
    return res.status(409).json({ success: false, message: 'A society with this registration number is already onboarded.' });
  }

  // Calculate 7-Day Free Trial expiration date
  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + 7);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Insert new society record
    const [insertResult] = await connection.query(
      `INSERT INTO societies (name, registration_number, address, city, state, pincode, total_units, plan, plan_expires_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, 'trial', ?)`,
      [name, registrationNumber, address, city, state, pincode, totalUnits, trialExpiresAt.toISOString().split('T')[0]]
    );

    const societyId = insertResult.insertId;

    // Link authenticated representative user to this society as secretary
    await connection.query('UPDATE users SET society_id = ?, role = ? WHERE id = ?', [societyId, 'secretary', userId]);

    await connection.commit();

    res.status(201).json({
      success: true,
      message: 'Society record initialized successfully with 7-Day Free Trial.',
      society: {
        id: societyId,
        name,
        registrationNumber,
        totalUnits,
        plan: 'trial',
        planExpiresAt: trialExpiresAt.toISOString().split('T')[0]
      }
    });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}));

/**
 * @route POST /api/v1/societies/domain
 * @desc Connect custom domain or subdomain to society (Step 3)
 * @access Private
 */
router.post('/domain', authenticateToken, globalRateLimiter, [
  body('domain').trim().notEmpty().withMessage('Domain or subdomain is required.')
    .matches(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/).withMessage('Please provide a valid fully qualified domain name (e.g. greenvilla.com or society.subdomain.com)')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { domain } = req.body;
  const userId = req.user.id;

  // Retrieve user's linked society
  const [userRows] = await pool.query('SELECT society_id FROM users WHERE id = ?', [userId]);
  if (userRows.length === 0 || !userRows[0].society_id) {
    return res.status(404).json({ success: false, message: 'No society associated with current user account.' });
  }

  const societyId = userRows[0].society_id;

  // Verify domain uniqueness across all tenants
  const [existingDomain] = await pool.query('SELECT id FROM societies WHERE custom_domain = ? AND id != ?', [domain, societyId]);
  if (existingDomain.length > 0) {
    return res.status(409).json({ success: false, message: 'This custom domain is already registered to another tenant.' });
  }

  // Update society record with custom domain
  await pool.query('UPDATE societies SET custom_domain = ?, domain_verified = 0 WHERE id = ?', [domain, societyId]);

  res.status(200).json({
    success: true,
    message: 'Custom domain registered successfully. Please configure your DNS CNAME records.',
    domainConfig: {
      customDomain: domain,
      cnameTarget: 'app.propertease.in',
      verificationStatus: 'Pending DNS Lookup'
    }
  });
}));

module.exports = router;
