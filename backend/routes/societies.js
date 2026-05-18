const express = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../config/db');
const { globalRateLimiter } = require('../middleware/security');
const { asyncHandler } = require('../middleware/errorHandler');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

// Explicit CSRF Protection Middleware for state-changing API endpoints
const requireCsrfHeader = (req, res, next) => {
  // Ensure the custom header is present, blocking simple cross-site form submissions
  const clientHeader = req.headers['x-requested-with'] || req.headers['x-propertease-client'];
  if (!clientHeader) {
    return res.status(403).json({ success: false, message: 'Strict CSRF validation failed. Missing required custom security header.' });
  }
  next();
};

/**
 * @route GET /api/v1/societies/domain-info
 * @desc Get public society info by custom domain/subdomain for Coming Soon portal
 * @access Public
 */
router.get('/domain-info', asyncHandler(async (req, res) => {
  const { hostname } = req.query;
  if (!hostname) {
    return res.status(400).json({ success: false, message: 'Hostname query parameter is required.' });
  }

  const cleanHostname = hostname.trim().toLowerCase();
  
  // For seamless localhost testing (e.g. jainsociety.localhost -> jainsociety.propertease.co.in)
  let targetDomain = cleanHostname;
  if (targetDomain.endsWith('.localhost')) {
    targetDomain = targetDomain.replace(/\.localhost(:\d+)?$/, '.propertease.co.in');
  }
  
  // Lookup domain in society_domains table
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.city, s.state, s.pincode, s.total_units, s.logo_path, s.plan, s.created_at, sd.is_verified, sd.ssl_status 
     FROM society_domains sd 
     JOIN societies s ON sd.society_id = s.id 
     WHERE sd.domain = ?`,
    [targetDomain]
  );

  if (rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Society domain record not found.' });
  }

  const society = rows[0];

  res.status(200).json({
    success: true,
    society: {
      id: society.id,
      name: society.name,
      city: society.city,
      state: society.state,
      pincode: society.pincode,
      total_units: society.total_units,
      logo_path: society.logo_path,
      is_verified: society.is_verified === 1,
      established_year: new Date(society.created_at).getFullYear()
    }
  });
}));

/**
 * @route GET /api/v1/societies/check-domain
 * @desc Check real-time subdomain or custom domain availability
 * @access Private
 */
router.get('/check-domain', authenticateToken, asyncHandler(async (req, res) => {
  const { domain, more } = req.query;
  if (!domain) {
    return res.status(400).json({ success: false, available: false, message: 'Domain query parameter required' });
  }

  let prefix = domain.trim().toLowerCase().replace(/\.propertease\.co\.in$/i, '').replace(/[^a-z0-9-]/g, '');
  if (!prefix) prefix = 'society';

  const fullDomain = `${prefix}.propertease.co.in`;
  const [existingDom] = await pool.query('SELECT id FROM society_domains WHERE domain = ?', [fullDomain]);
  const [existingSoc] = await pool.query('SELECT id FROM societies WHERE custom_domain = ?', [fullDomain]);
  const isTaken = existingDom.length > 0 || existingSoc.length > 0;

  if (!isTaken && more !== 'true') {
    return res.status(200).json({
      success: true,
      available: true,
      fullDomain,
      suggestions: []
    });
  }

  // Generate alternative candidates based on standard or 'more' request
  let candidatePrefixes = [];
  if (more === 'true') {
    const r1 = Math.floor(Math.random() * 90 + 10);
    const r2 = Math.floor(Math.random() * 90 + 10);
    candidatePrefixes = [
      `${prefix}-heights`,
      `${prefix}-towers`,
      `${prefix}-apartments`,
      `${prefix}-greens`,
      `${prefix}-enclave`,
      `${prefix}-residency`,
      `${prefix}-villas`,
      `${prefix}-homes`,
      `${prefix}-elite`,
      `${prefix}-pinnacle`,
      `${prefix}-mansion`,
      `${prefix}-crest`,
      `${prefix}-park`,
      `${prefix}-${r1}`,
      `${prefix}-${r2}`
    ];
  } else {
    candidatePrefixes = [
      `${prefix}-rwa`,
      `society-${prefix}`,
      `${prefix}-one`,
      `my-${prefix}`,
      `the-${prefix}`,
      `${prefix}-connect`,
      `${prefix}-living`,
      `${prefix}-online`
    ];
  }

  const candidateDomains = candidatePrefixes.map(p => `${p}.propertease.co.in`);
  const placeholders = candidateDomains.map(() => '?').join(',');

  const [takenRows] = await pool.query(`SELECT domain FROM society_domains WHERE domain IN (${placeholders})`, candidateDomains);
  const [takenSocRows] = await pool.query(`SELECT custom_domain FROM societies WHERE custom_domain IN (${placeholders})`, candidateDomains);
  
  const takenSet = new Set([
    ...takenRows.map(r => r.domain),
    ...takenSocRows.filter(r => r.custom_domain).map(r => r.custom_domain)
  ]);

  const availableSuggestions = candidatePrefixes.filter(p => !takenSet.has(`${p}.propertease.co.in`)).slice(0, 6);

  res.status(200).json({
    success: true,
    available: !isTaken,
    fullDomain,
    suggestions: availableSuggestions
  });
}));

/**
 * @route GET /api/v1/societies/search-city
 * @desc Search Indian cities from local high-performance database table
 * @access Public
 */
router.get('/search-city', asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) {
    return res.status(200).json({ success: true, results: [] });
  }

  const searchParam = `%${q.trim()}%`;
  const [rows] = await pool.query(
    'SELECT city, state, pincode FROM indian_cities WHERE city LIKE ? OR pincode LIKE ? LIMIT 10',
    [searchParam, searchParam]
  );

  const results = rows.map(r => ({
    display_name: `${r.city}, ${r.state}, India - ${r.pincode}`,
    address: {
      city: r.city,
      state: r.state,
      postcode: r.pincode
    }
  }));

  return res.status(200).json({ success: true, results });
}));

/**
 * @route POST /api/v1/societies/onboard
 * @desc Create society record & associate with authenticated representative user (Step 2)
 * @access Private
 */
router.post('/onboard', authenticateToken, requireCsrfHeader, globalRateLimiter, [
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
 * @desc Connect custom domain or subdomain to society (Step 3 Setup)
 * @access Private
 */
router.post('/domain', authenticateToken, requireCsrfHeader, globalRateLimiter, [
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

  // Verify domain uniqueness across all tenants in both tables
  const [existingDom] = await pool.query('SELECT id FROM society_domains WHERE domain = ? AND society_id != ?', [domain, societyId]);
  const [existingSoc] = await pool.query('SELECT id FROM societies WHERE custom_domain = ? AND id != ?', [domain, societyId]);
  if (existingDom.length > 0 || existingSoc.length > 0) {
    return res.status(409).json({ success: false, message: 'This custom domain is already registered to another tenant.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Demote existing domains for this society to non-primary if this is being set as primary
    await connection.query('UPDATE society_domains SET is_primary = 0 WHERE society_id = ?', [societyId]);
    
    // Insert into society_domains as primary
    const isPropertEaseSub = domain.endsWith('.propertease.co.in');
    await connection.query(`
      INSERT INTO society_domains (society_id, domain, is_primary, is_verified, ssl_status)
      VALUES (?, ?, 1, ?, 'active')
      ON DUPLICATE KEY UPDATE is_primary = 1, is_verified = ?
    `, [societyId, domain, isPropertEaseSub ? 1 : 0, isPropertEaseSub ? 1 : 0]);

    // Keep societies table in sync
    await connection.query('UPDATE societies SET custom_domain = ?, domain_verified = ? WHERE id = ?', [domain, isPropertEaseSub ? 1 : 0, societyId]);
    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  res.status(200).json({
    success: true,
    message: 'Custom domain registered successfully. Please configure your DNS CNAME records.',
    domainConfig: {
      customDomain: domain,
      cnameTarget: 'app.propertease.co.in',
      verificationStatus: domain.endsWith('.propertease.co.in') ? 'Verified' : 'Pending DNS Lookup'
    }
  });
}));

/**
 * @route GET /api/v1/societies/domains
 * @desc Get all custom domains linked to the authenticated user's society
 * @access Private
 */
router.get('/domains', authenticateToken, asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const [userRows] = await pool.query('SELECT society_id FROM users WHERE id = ?', [userId]);
  if (userRows.length === 0 || !userRows[0].society_id) {
    return res.status(404).json({ success: false, message: 'No society associated with current user.' });
  }
  const societyId = userRows[0].society_id;
  const [domains] = await pool.query('SELECT id, domain, is_primary, is_verified, ssl_status, created_at FROM society_domains WHERE society_id = ? ORDER BY is_primary DESC, created_at ASC', [societyId]);
  res.status(200).json({ success: true, domains });
}));

/**
 * @route POST /api/v1/societies/domains
 * @desc Connect an additional alias domain to society
 * @access Private
 */
router.post('/domains', authenticateToken, requireCsrfHeader, globalRateLimiter, [
  body('domain').trim().notEmpty().withMessage('Domain is required.')
    .matches(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/).withMessage('Please provide a valid fully qualified domain name.')
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { domain } = req.body;
  const userId = req.user.id;
  const [userRows] = await pool.query('SELECT society_id FROM users WHERE id = ?', [userId]);
  if (userRows.length === 0 || !userRows[0].society_id) {
    return res.status(404).json({ success: false, message: 'No society associated with current user.' });
  }
  const societyId = userRows[0].society_id;

  const [existingDom] = await pool.query('SELECT id FROM society_domains WHERE domain = ?', [domain]);
  const [existingSoc] = await pool.query('SELECT id FROM societies WHERE custom_domain = ?', [domain]);
  if (existingDom.length > 0 || existingSoc.length > 0) {
    return res.status(409).json({ success: false, message: 'This domain is already registered.' });
  }

  const isPropertEaseSub = domain.endsWith('.propertease.co.in');
  const [result] = await pool.query(`
    INSERT INTO society_domains (society_id, domain, is_primary, is_verified, ssl_status)
    VALUES (?, ?, 0, ?, 'active')
  `, [societyId, domain, isPropertEaseSub ? 1 : 0]);

  res.status(201).json({
    success: true,
    message: 'Alias domain added successfully.',
    domain: { id: result.insertId, domain, is_primary: 0, is_verified: isPropertEaseSub ? 1 : 0, ssl_status: 'active' }
  });
}));

/**
 * @route PUT /api/v1/societies/domains/:id/set-primary
 * @desc Set a selected alias domain as canonical primary
 * @access Private
 */
router.put('/domains/:id/set-primary', authenticateToken, requireCsrfHeader, asyncHandler(async (req, res) => {
  const domainId = req.params.id;
  const userId = req.user.id;
  const [userRows] = await pool.query('SELECT society_id FROM users WHERE id = ?', [userId]);
  if (userRows.length === 0 || !userRows[0].society_id) return res.status(404).json({ success: false, message: 'No society associated with current user.' });
  const societyId = userRows[0].society_id;

  const [target] = await pool.query('SELECT domain, is_verified FROM society_domains WHERE id = ? AND society_id = ?', [domainId, societyId]);
  if (target.length === 0) return res.status(404).json({ success: false, message: 'Domain not found in your society account.' });

  const targetDomain = target[0].domain;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('UPDATE society_domains SET is_primary = 0 WHERE society_id = ?', [societyId]);
    await connection.query('UPDATE society_domains SET is_primary = 1 WHERE id = ?', [domainId]);
    await connection.query('UPDATE societies SET custom_domain = ?, domain_verified = ? WHERE id = ?', [targetDomain, target[0].is_verified ? 1 : 0, societyId]);
    await connection.commit();
    res.status(200).json({ success: true, message: 'Primary canonical domain updated successfully.', primaryDomain: targetDomain });
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}));

/**
 * @route DELETE /api/v1/societies/domains/:id
 * @desc Delete an alias domain
 * @access Private
 */
router.delete('/domains/:id', authenticateToken, requireCsrfHeader, asyncHandler(async (req, res) => {
  const domainId = req.params.id;
  const userId = req.user.id;
  const [userRows] = await pool.query('SELECT society_id FROM users WHERE id = ?', [userId]);
  if (userRows.length === 0 || !userRows[0].society_id) return res.status(404).json({ success: false, message: 'No society associated with current user.' });
  const societyId = userRows[0].society_id;

  const [target] = await pool.query('SELECT domain, is_primary FROM society_domains WHERE id = ? AND society_id = ?', [domainId, societyId]);
  if (target.length === 0) return res.status(404).json({ success: false, message: 'Domain not found in your society account.' });
  if (target[0].is_primary) return res.status(400).json({ success: false, message: 'Cannot delete the primary canonical domain. Please set another domain as primary first.' });

  await pool.query('DELETE FROM society_domains WHERE id = ? AND society_id = ?', [domainId, societyId]);
  res.status(200).json({ success: true, message: 'Alias domain deleted successfully.' });
}));

module.exports = router;
