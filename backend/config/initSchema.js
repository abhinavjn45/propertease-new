const { pool } = require('./db');

const initSchema = async () => {
  try {
    console.log('[Schema Migration] Starting database schema initialization...');

    // 1. Create societies table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`societies\` (
        \`id\`                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`name\`                VARCHAR(255) NOT NULL,
        \`registration_number\` VARCHAR(100) NOT NULL UNIQUE COMMENT 'RCS Registration No.',
        \`rera_id\`             VARCHAR(100) NULL COMMENT 'RERA Project/Society ID',
        \`address\`             TEXT NOT NULL,
        \`city\`                VARCHAR(100) NOT NULL,
        \`state\`               VARCHAR(100) NOT NULL,
        \`pincode\`             VARCHAR(10) NOT NULL,
        \`custom_domain\`       VARCHAR(255) NULL UNIQUE COMMENT 'e.g. greenvilla.propertease.co.in',
        \`domain_verified\`     TINYINT(1) NOT NULL DEFAULT 0,
        \`plan\`                ENUM('trial','basic','professional','enterprise') NOT NULL DEFAULT 'trial',
        \`plan_expires_at\`     DATE NULL,
        \`total_units\`         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
        \`logo_path\`           VARCHAR(500) NULL,
        \`gstin\`               VARCHAR(20) NULL,
        \`pan\`                 VARCHAR(20) NULL,
        \`bank_name\`           VARCHAR(150) NULL,
        \`bank_account\`        VARCHAR(30) NULL,
        \`bank_ifsc\`           VARCHAR(15) NULL,
        \`is_active\`           TINYINT(1) NOT NULL DEFAULT 1,
        \`created_at\`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX \`idx_custom_domain\` (\`custom_domain\`),
        INDEX \`idx_plan\` (\`plan\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Schema Migration] Societies table verified.');

    // 2. Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`users\` (
        \`id\`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`society_id\`    INT UNSIGNED NULL COMMENT 'NULL = Super Admin or pending registration',
        \`name\`          VARCHAR(120) NOT NULL,
        \`email\`         VARCHAR(180) NOT NULL UNIQUE,
        \`password_hash\` VARCHAR(255) NULL COMMENT 'Nullable for OAuth users',
        \`oauth_provider\` VARCHAR(50) NULL COMMENT 'google, apple, microsoft',
        \`oauth_uid\`     VARCHAR(255) NULL UNIQUE COMMENT 'OAuth unique identifier',
        \`role\`          ENUM('super_admin','representative','secretary','president','treasurer','committee_member','resident') NOT NULL DEFAULT 'representative',
        \`phone\`         VARCHAR(15) NULL,
        \`is_active\`     TINYINT(1) NOT NULL DEFAULT 1,
        \`token_version\` INT UNSIGNED NOT NULL DEFAULT 0,
        \`last_login_at\` DATETIME NULL,
        \`created_at\`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`fk_users_society\` FOREIGN KEY (\`society_id\`) REFERENCES \`societies\`(\`id\`) ON DELETE CASCADE,
        INDEX \`idx_society_role\` (\`society_id\`, \`role\`),
        INDEX \`idx_email\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Schema Migration] Users table verified.');

    // Ensure token_version column exists on existing users table
    try {
      await pool.query('ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0');
      console.log('[Schema Migration] Added token_version column to users table.');
    } catch (colErr) {}

    // 3. Create members table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`members\` (
        \`id\`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`society_id\`      INT UNSIGNED NOT NULL,
        \`user_id\`         INT UNSIGNED NULL COMMENT 'NULL if not yet registered as user',
        \`unit_number\`     VARCHAR(30) NOT NULL COMMENT 'Flat/Unit identifier e.g. A-204',
        \`block\`           VARCHAR(30) NULL,
        \`floor\`           TINYINT UNSIGNED NULL,
        \`name\`            VARCHAR(150) NOT NULL,
        \`email\`           VARCHAR(180) NULL,
        \`phone\`           VARCHAR(15) NULL,
        \`ownership_type\`  ENUM('owner','tenant') NOT NULL DEFAULT 'owner',
        \`move_in_date\`    DATE NULL,
        \`move_out_date\`   DATE NULL,
        \`is_active\`       TINYINT(1) NOT NULL DEFAULT 1,
        \`emergency_contact_name\`  VARCHAR(150) NULL,
        \`emergency_contact_phone\` VARCHAR(15) NULL,
        \`created_at\`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (\`society_id\`) REFERENCES \`societies\`(\`id\`) ON DELETE CASCADE,
        FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\` ) ON DELETE SET NULL,
        UNIQUE KEY \`uq_unit_society\` (\`society_id\`, \`unit_number\`),
        INDEX \`idx_society_active\` (\`society_id\`, \`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Schema Migration] Members table verified.');

    // 4. Create society_domains table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`society_domains\` (
        \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`society_id\` INT UNSIGNED NOT NULL,
        \`domain\` VARCHAR(255) NOT NULL UNIQUE COMMENT 'e.g. greenvilla.propertease.co.in or greenvilla-rwa.com',
        \`is_primary\` TINYINT(1) NOT NULL DEFAULT 0,
        \`is_verified\` TINYINT(1) NOT NULL DEFAULT 0,
        \`ssl_status\` ENUM('pending', 'active', 'failed') NOT NULL DEFAULT 'pending',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT \`fk_society_domains\` FOREIGN KEY (\`society_id\`) REFERENCES \`societies\`(\`id\`) ON DELETE CASCADE,
        INDEX \`idx_domain_lookup\` (\`domain\`),
        INDEX \`idx_society_domains\` (\`society_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Schema Migration] Society domains table verified.');

    // Auto-sync any existing custom_domain from societies table into society_domains
    const [existingSocieties] = await pool.query('SELECT id, custom_domain FROM societies WHERE custom_domain IS NOT NULL');
    for (const s of existingSocieties) {
      await pool.query(`
        INSERT IGNORE INTO society_domains (society_id, domain, is_primary, is_verified, ssl_status)
        VALUES (?, ?, 1, 1, 'active')
      `, [s.id, s.custom_domain]);
    }
    console.log(`[Schema Migration] Synced ${existingSocieties.length} existing domains.`);

    // 5. Create indian_cities table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`indian_cities\` (
        \`id\` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        \`city\` VARCHAR(100) NOT NULL,
        \`state\` VARCHAR(100) NOT NULL,
        \`pincode\` VARCHAR(10) NOT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY \`uq_city_state\` (\`city\`, \`state\`),
        INDEX \`idx_city\` (\`city\`),
        INDEX \`idx_pincode\` (\`pincode\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Schema Migration] Indian cities table verified.');

    // Seed indian_cities table
    await pool.query(`
      INSERT IGNORE INTO \`indian_cities\` (\`city\`, \`state\`, \`pincode\`) VALUES
      ('Mumbai', 'Maharashtra', '400001'), ('Pune', 'Maharashtra', '411001'), ('Nagpur', 'Maharashtra', '440001'), ('Thane', 'Maharashtra', '400601'), ('Nashik', 'Maharashtra', '422001'), ('Aurangabad', 'Maharashtra', '431001'), ('Solapur', 'Maharashtra', '413001'),
      ('Delhi', 'Delhi', '110001'), ('New Delhi', 'Delhi', '110002'), ('Dwarka', 'Delhi', '110075'), ('Rohini', 'Delhi', '110085'),
      ('Gurugram', 'Haryana', '122001'), ('Faridabad', 'Haryana', '121001'), ('Panipat', 'Haryana', '132103'), ('Ambala', 'Haryana', '134003'), ('Karnal', 'Haryana', '132001'),
      ('Noida', 'Uttar Pradesh', '201301'), ('Greater Noida', 'Uttar Pradesh', '201308'), ('Ghaziabad', 'Uttar Pradesh', '201001'), ('Lucknow', 'Uttar Pradesh', '226001'), ('Kanpur', 'Uttar Pradesh', '208001'), ('Varanasi', 'Uttar Pradesh', '221001'), ('Agra', 'Uttar Pradesh', '282001'), ('Prayagraj', 'Uttar Pradesh', '211001'), ('Meerut', 'Uttar Pradesh', '250001'),
      ('Bengaluru', 'Karnataka', '560001'), ('Mysuru', 'Karnataka', '570001'), ('Mangaluru', 'Karnataka', '575001'), ('Hubballi', 'Karnataka', '580001'), ('Belagavi', 'Karnataka', '590001'),
      ('Chennai', 'Tamil Nadu', '600001'), ('Coimbatore', 'Tamil Nadu', '641001'), ('Madurai', 'Tamil Nadu', '625001'), ('Tiruchirappalli', 'Tamil Nadu', '620001'), ('Salem', 'Tamil Nadu', '636001'),
      ('Hyderabad', 'Telangana', '500001'), ('Warangal', 'Telangana', '506001'), ('Nizamabad', 'Telangana', '503001'),
      ('Kolkata', 'West Bengal', '700001'), ('Howrah', 'West Bengal', '711101'), ('Durgapur', 'West Bengal', '713201'), ('Asansol', 'West Bengal', '713301'), ('Siliguri', 'West Bengal', '734001'),
      ('Ahmedabad', 'Gujarat', '380001'), ('Surat', 'Gujarat', '395001'), ('Vadodara', 'Gujarat', '390001'), ('Rajkot', 'Gujarat', '360001'), ('Gandhinagar', 'Gujarat', '382010'), ('Bhavnagar', 'Gujarat', '364001'), ('Jamnagar', 'Gujarat', '361001'),
      ('Jaipur', 'Rajasthan', '302001'), ('Jodhpur', 'Rajasthan', '342001'), ('Udaipur', 'Rajasthan', '313001'), ('Kota', 'Rajasthan', '324001'), ('Bikaner', 'Rajasthan', '334001'), ('Ajmer', 'Rajasthan', '305001'),
      ('Bhopal', 'Madhya Pradesh', '462001'), ('Indore', 'Madhya Pradesh', '452001'), ('Gwalior', 'Madhya Pradesh', '474001'), ('Jabalpur', 'Madhya Pradesh', '482001'), ('Ujjain', 'Madhya Pradesh', '456001'),
      ('Patna', 'Bihar', '800001'), ('Gaya', 'Bihar', '823001'), ('Bhagalpur', 'Bihar', '812001'), ('Muzaffarpur', 'Bihar', '842001'),
      ('Thiruvananthapuram', 'Kerala', '695001'), ('Kochi', 'Kerala', '682001'), ('Kozhikode', 'Kerala', '673001'), ('Thrissur', 'Kerala', '680001'), ('Kollam', 'Kerala', '691001'),
      ('Visakhapatnam', 'Andhra Pradesh', '530001'), ('Vijayawada', 'Andhra Pradesh', '520001'), ('Guntur', 'Andhra Pradesh', '522001'), ('Nellore', 'Andhra Pradesh', '524001'), ('Kurnool', 'Andhra Pradesh', '518001'),
      ('Bhubaneswar', 'Odisha', '751001'), ('Cuttack', 'Odisha', '753001'), ('Rourkela', 'Odisha', '769001'), ('Berhampur', 'Odisha', '760001'),
      ('Guwahati', 'Assam', '781001'), ('Dibrugarh', 'Assam', '786001'), ('Jorhat', 'Assam', '785001'),
      ('Ranchi', 'Jharkhand', '834001'), ('Jamshedpur', 'Jharkhand', '831001'), ('Dhanbad', 'Jharkhand', '826001'), ('Bokaro', 'Jharkhand', '827001'),
      ('Raipur', 'Chhattisgarh', '492001'), ('Bhilai', 'Chhattisgarh', '490001'), ('Bilaspur', 'Chhattisgarh', '495001'),
      ('Dehradun', 'Uttarakhand', '248001'), ('Haridwar', 'Uttarakhand', '249401'), ('Roorkee', 'Uttarakhand', '247667'), ('Haldwani', 'Uttarakhand', '263139'),
      ('Shimla', 'Himachal Pradesh', '171001'), ('Dharamshala', 'Himachal Pradesh', '176215'), ('Mandi', 'Himachal Pradesh', '175001'),
      ('Chandigarh', 'Chandigarh', '160001'), ('Puducherry', 'Puducherry', '605001'), ('Panaji', 'Goa', '403001'), ('Margao', 'Goa', '403601'),
      ('Srinagar', 'Jammu and Kashmir', '190001'), ('Jammu', 'Jammu and Kashmir', '180001'),
      ('Agartala', 'Tripura', '799001'), ('Shillong', 'Meghalaya', '793001'), ('Imphal', 'Manipur', '795001'), ('Aizawl', 'Mizoram', '796001'), ('Kohima', 'Nagaland', '797001'), ('Itanagar', 'Arunachal Pradesh', '791111'), ('Gangtok', 'Sikkim', '737101');
    `);
    console.log('[Schema Migration] Indian cities seeded.');

    console.log('[Schema Migration] All tables verified successfully!');
    process.exit(0);
  } catch (error) {
    console.error('[Schema Migration Error] Failed to initialize database schema:', error);
    process.exit(1);
  }
};

initSchema();
