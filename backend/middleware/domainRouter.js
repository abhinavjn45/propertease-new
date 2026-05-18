const { pool } = require('../config/db');

/**
 * Enterprise Canonical Domain & Subdomain Router Middleware
 * Intercepts incoming requests, matches hostname against society_domains table,
 * and issues HTTP 301 Permanent Redirects for alias domains to preserve SEO equity.
 */
const domainRouter = async (req, res, next) => {
  try {
    const hostname = req.hostname;

    // Skip localhost and main application domains during direct development or primary portal access
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === 'propertease.co.in' ||
      hostname === 'www.propertease.co.in' ||
      hostname === 'app.propertease.co.in' ||
      hostname.includes('onrender.com') ||
      hostname.includes('hostinger.com')
    ) {
      return next();
    }

    // Lookup incoming domain in society_domains
    const [domainRows] = await pool.query(
      'SELECT society_id, is_primary FROM society_domains WHERE domain = ? AND is_verified = 1',
      [hostname]
    );

    if (domainRows.length === 0) {
      // Domain not found or not verified - allow normal routing or fallback
      return next();
    }

    const currentDomain = domainRows[0];

    // If this is the primary canonical domain, attach tenant context to request and proceed
    if (currentDomain.is_primary) {
      req.tenantSocietyId = currentDomain.society_id;
      return next();
    }

    // This is a secondary alias domain -> find the primary canonical domain for this society
    const [primaryRows] = await pool.query(
      'SELECT domain FROM society_domains WHERE society_id = ? AND is_primary = 1 AND is_verified = 1',
      [currentDomain.society_id]
    );

    if (primaryRows.length > 0 && primaryRows[0].domain !== hostname) {
      const canonicalUrl = `https://${primaryRows[0].domain}${req.originalUrl}`;
      console.log(`[SEO Redirect] Canonical 301 Redirect: ${hostname} -> ${primaryRows[0].domain}`);
      return res.redirect(301, canonicalUrl);
    }

    // Fallback if no primary found
    req.tenantSocietyId = currentDomain.society_id;
    next();
  } catch (error) {
    console.error('[Domain Router Error] Failed to route domain:', error);
    next();
  }
};

module.exports = domainRouter;
