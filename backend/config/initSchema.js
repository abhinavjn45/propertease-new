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
        \`custom_domain\`       VARCHAR(255) NULL UNIQUE COMMENT 'e.g. greenvilla.propertease.in',
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
        \`last_login_at\` DATETIME NULL,
        \`created_at\`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`fk_users_society\` FOREIGN KEY (\`society_id\`) REFERENCES \`societies\`(\`id\`) ON DELETE CASCADE,
        INDEX \`idx_society_role\` (\`society_id\`, \`role\`),
        INDEX \`idx_email\` (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('[Schema Migration] Users table verified.');

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

    console.log('[Schema Migration] All tables verified successfully!');
    process.exit(0);
  } catch (error) {
    console.error('[Schema Migration Error] Failed to initialize database schema:', error);
    process.exit(1);
  }
};

initSchema();
