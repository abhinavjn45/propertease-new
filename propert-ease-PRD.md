# Propert-Ease — Complete Product Requirements Document
> **Version:** 1.0.0 | **Status:** DRAFT | **Team:** Abhinav, Amogh, Vishnu
> **Last Updated:** 2026-04-20 | **Optimized for:** GitHub Copilot

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Infrastructure & Hosting](#3-infrastructure--hosting)
4. [Folder Structure](#4-folder-structure)
5. [Database Schema](#5-database-schema)
6. [Module Specifications](#6-module-specifications)
   - 6.1 Public Marketing Site (Product Side)
   - 6.2 Society Onboarding & Registration
   - 6.3 Multi-Tenant Routing Engine
   - 6.4 Authentication & RBAC
   - 6.5 Member & Unit Management
   - 6.6 Maintenance Billing & Ledger
   - 6.7 Compliance Vault (RCS/DCS/RERA)
   - 6.8 Notice Board & Communication
   - 6.9 Visitor & Gate Management
   - 6.10 Admin Super-Panel
7. [Security Requirements](#7-security-requirements)
8. [API Contract (Internal)](#8-api-contract-internal)
9. [UI/UX Standards](#9-uiux-standards)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Deployment Checklist](#11-deployment-checklist)
12. [Glossary](#12-glossary)

---

## 1. Executive Summary

### 1.1 Product Vision
Propert-Ease is a **multi-tenant SaaS platform** that digitizes the governance, compliance, and financial management of Indian Residential Welfare Associations (RWAs) and Cooperative Group Housing Societies (CGHS). It replaces error-prone manual ledgers with an auditable, legally defensible "Digital Constitution" that satisfies statutory obligations under:

- **RCS Section 79** (Registrar of Cooperative Societies — annual filing)
- **DCS Act** (Delhi Cooperative Societies Act, or state-specific equivalent)
- **RERA Defect Liability Period (DLP)** tracking (Section 14(3))

### 1.2 Key Differentiators
| Feature | Status Quo | Propert-Ease |
|---|---|---|
| Meeting Minutes | WhatsApp notes | Timestamped, digitally signed vault |
| Maintenance Billing | Excel sheets | Automated, GST-compliant invoices |
| Compliance Filing | Manual reminders | Auto-alert engine with document attachments |
| RERA DLP Tracking | None | Defect log with builder escalation workflow |
| Member Disputes | Verbal | Formal digital record with committee notes |

### 1.3 Team Roles
| Person | Primary Role |
|---|---|
| Abhinav | Lead Architect, Backend, DevOps |
| Amogh | Frontend, UI/UX, JavaScript |
| Vishnu | Database, Compliance Logic, QA |

---

## 2. System Architecture

### 2.1 High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        CLOUDFLARE LAYER                          │
│                                                                  │
│  [society.propertease.in] ──CNAME──► Cloudflare Workers          │
│  [custom-domain.com]      ──CNAME──► Cloudflare Workers          │
│                                          │                       │
│              Worker injects:             │                       │
│         X-Original-Host header           │                       │
└──────────────────────────────────────────│───────────────────────┘
                                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                      HOSTINGER SHARED HOSTING                    │
│                                                                  │
│  ┌─────────────────────────┐   ┌──────────────────────────────┐  │
│  │  PRODUCT SIDE           │   │  USER/APP SIDE               │  │
│  │  propertease.           │   │  app-propertease.            │  │
│  │  abhinavjain.site       │   │  abhinavjain.site            │  │
│  │                         │   │                              │  │
│  │  /public_html/product/  │   │  /public_html/app/           │  │
│  │  - Marketing pages      │   │  - Multi-tenant dashboard    │  │
│  │  - Pricing              │   │  - All society modules       │  │
│  │  - Onboarding wizard    │   │  - Billing, compliance, etc. │  │
│  │  - Domain verification  │   │                              │  │
│  └─────────────────────────┘   └──────────────────────────────┘  │
│                                           │                      │
│                              ┌────────────▼──────────┐          │
│                              │   MySQL Database       │          │
│                              │   (Shared cPanel DB)   │          │
│                              └───────────────────────┘          │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Multi-Tenancy Model
- **Tenant Identification Strategy:** Domain-based. Every HTTP request on the app side reads `$_SERVER['HTTP_X_ORIGINAL_HOST'] ?? $_SERVER['HTTP_HOST']` to resolve the `society_id`.
- **Data Isolation:** Row-level isolation. Every table that stores tenant data has a `society_id` foreign key. No cross-tenant queries are ever permitted.
- **Tenant Onboarding:** Handled on Product Side. Once a society completes registration, their `custom_domain` record is activated in the `societies` table.

---

## 3. Infrastructure & Hosting

### 3.1 Cloudflare Workers Script (Reference)
```javascript
// cloudflare-worker.js
// Deploy this as a Worker Route on *.propertease.in/*
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const originalHost = request.headers.get('host')

  // Rewrite to Hostinger app subdomain
  const targetUrl = `https://app-propertease.abhinavjain.site${url.pathname}${url.search}`

  const modifiedRequest = new Request(targetUrl, {
    method: request.method,
    headers: {
      ...Object.fromEntries(request.headers),
      'X-Original-Host': originalHost,  // ← Critical for PHP tenant resolution
      'X-Forwarded-For': request.headers.get('CF-Connecting-IP') || '',
    },
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
    redirect: 'follow',
  })

  return fetch(modifiedRequest)
}
```

### 3.2 PHP Tenant Resolution (Reference Helper)
```php
// app/core/TenantResolver.php
function get_active_host(): string {
    return $_SERVER['HTTP_X_ORIGINAL_HOST']
        ?? $_SERVER['HTTP_HOST']
        ?? '';
}
```

### 3.3 Environment Configuration
```ini
; .env (stored OUTSIDE public_html — never committed to git)
DB_HOST=localhost
DB_NAME=propertease_db
DB_USER=propertease_user
DB_PASS=strongpasswordhere
APP_ENV=production
APP_SECRET=32-char-random-string-here
SESSION_LIFETIME=3600
MAIL_HOST=smtp.hostinger.com
MAIL_PORT=465
MAIL_USER=noreply@propertease.abhinavjain.site
MAIL_PASS=emailpassword
```

---

## 4. Folder Structure

```
/public_html/
│
├── product/                        ← Product Side (Marketing)
│   ├── index.php                   ← Landing page
│   ├── pricing.php
│   ├── register/
│   │   ├── index.php               ← Society registration wizard (Step 1)
│   │   ├── step2.php               ← Society details
│   │   ├── step3.php               ← Domain configuration
│   │   └── complete.php
│   ├── verify-domain.php           ← Cloudflare domain verification endpoint
│   └── assets/
│       ├── css/
│       ├── js/
│       └── img/
│
├── app/                            ← User/App Side (Multi-Tenant Dashboard)
│   ├── index.php                   ← Tenant resolver → routes to dashboard or login
│   ├── login.php
│   ├── logout.php
│   ├── dashboard.php
│   │
│   ├── members/
│   │   ├── index.php               ← Member directory
│   │   ├── add.php
│   │   ├── edit.php
│   │   └── profile.php
│   │
│   ├── billing/
│   │   ├── index.php               ← Ledger overview
│   │   ├── generate.php            ← Generate maintenance invoices
│   │   ├── record-payment.php
│   │   ├── pending.php
│   │   └── export.php              ← CSV/PDF export
│   │
│   ├── compliance/
│   │   ├── index.php               ← Compliance dashboard
│   │   ├── upload.php              ← Document upload to vault
│   │   ├── filings.php             ← RCS/DCS filing log
│   │   ├── rera.php                ← RERA DLP tracker
│   │   └── agm/
│   │       ├── index.php           ← AGM/SGM list
│   │       ├── create.php
│   │       └── minutes.php         ← Minutes recorder
│   │
│   ├── notices/
│   │   ├── index.php
│   │   ├── create.php
│   │   └── view.php
│   │
│   ├── visitors/
│   │   ├── index.php
│   │   ├── log-entry.php
│   │   └── log-exit.php
│   │
│   ├── settings/
│   │   ├── index.php               ← Society profile settings
│   │   ├── roles.php               ← RBAC role management
│   │   └── billing-config.php      ← Maintenance head configuration
│   │
│   └── assets/ → (symlink or copy of shared assets)
│
├── core/                           ← Shared PHP core (outside public_html ideally)
│   ├── bootstrap.php               ← Loads env, DB, session
│   ├── Database.php                ← PDO singleton
│   ├── TenantResolver.php
│   ├── Auth.php                    ← Session-based auth
│   ├── RBAC.php                    ← Role/permission checker
│   ├── Mailer.php                  ← SMTP wrapper
│   ├── FileUpload.php              ← Secure file upload handler
│   └── helpers.php                 ← Utility functions
│
├── uploads/                        ← Society document storage
│   └── {society_id}/
│       ├── compliance/
│       ├── agm_minutes/
│       └── rera_docs/
│
└── .htaccess                       ← Mod_rewrite rules + security headers
```

---

## 5. Database Schema

### 5.1 Core Tables

```sql
-- ============================================================
-- TABLE: users
-- Stores all platform users (Super Admins + Society Admins)
-- ============================================================
CREATE TABLE `users` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `society_id`    INT UNSIGNED NULL COMMENT 'NULL = Super Admin',
  `name`          VARCHAR(120) NOT NULL,
  `email`         VARCHAR(180) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'password_hash() bcrypt',
  `role`          ENUM('super_admin','secretary','president','treasurer','committee_member','resident') NOT NULL DEFAULT 'resident',
  `phone`         VARCHAR(15) NULL,
  `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at` DATETIME NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_society_role` (`society_id`, `role`),
  INDEX `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: societies
-- Core tenant registry
-- ============================================================
CREATE TABLE `societies` (
  `id`                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`                VARCHAR(255) NOT NULL,
  `registration_number` VARCHAR(100) NOT NULL UNIQUE COMMENT 'RCS Registration No.',
  `rera_id`             VARCHAR(100) NULL COMMENT 'RERA Project/Society ID',
  `address`             TEXT NOT NULL,
  `city`                VARCHAR(100) NOT NULL,
  `state`               VARCHAR(100) NOT NULL,
  `pincode`             VARCHAR(10) NOT NULL,
  `custom_domain`       VARCHAR(255) NULL UNIQUE COMMENT 'e.g. greenvilla.propertease.in',
  `domain_verified`     TINYINT(1) NOT NULL DEFAULT 0,
  `plan`                ENUM('trial','basic','professional','enterprise') NOT NULL DEFAULT 'trial',
  `plan_expires_at`     DATE NULL,
  `total_units`         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `logo_path`           VARCHAR(500) NULL,
  `gstin`               VARCHAR(20) NULL,
  `pan`                 VARCHAR(20) NULL,
  `bank_name`           VARCHAR(150) NULL,
  `bank_account`        VARCHAR(30) NULL,
  `bank_ifsc`           VARCHAR(15) NULL,
  `is_active`           TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_custom_domain` (`custom_domain`),
  INDEX `idx_plan` (`plan`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: members
-- Residents/Unit owners linked to a society
-- ============================================================
CREATE TABLE `members` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `society_id`      INT UNSIGNED NOT NULL,
  `user_id`         INT UNSIGNED NULL COMMENT 'NULL if not yet registered as user',
  `unit_number`     VARCHAR(30) NOT NULL COMMENT 'Flat/Unit identifier e.g. A-204',
  `block`           VARCHAR(30) NULL,
  `floor`           TINYINT UNSIGNED NULL,
  `name`            VARCHAR(150) NOT NULL,
  `email`           VARCHAR(180) NULL,
  `phone`           VARCHAR(15) NULL,
  `ownership_type`  ENUM('owner','tenant') NOT NULL DEFAULT 'owner',
  `move_in_date`    DATE NULL,
  `move_out_date`   DATE NULL,
  `is_active`       TINYINT(1) NOT NULL DEFAULT 1,
  `emergency_contact_name`  VARCHAR(150) NULL,
  `emergency_contact_phone` VARCHAR(15) NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  UNIQUE KEY `uq_unit_society` (`society_id`, `unit_number`),
  INDEX `idx_society_active` (`society_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: maintenance_heads
-- Configurable billing line items per society
-- ============================================================
CREATE TABLE `maintenance_heads` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `society_id`  INT UNSIGNED NOT NULL,
  `name`        VARCHAR(150) NOT NULL COMMENT 'e.g. Maintenance Charges, Sinking Fund',
  `amount`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `frequency`   ENUM('monthly','quarterly','annually','one_time') NOT NULL DEFAULT 'monthly',
  `is_gst_applicable` TINYINT(1) NOT NULL DEFAULT 0,
  `gst_percent` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE CASCADE,
  INDEX `idx_society_active` (`society_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: invoices
-- Generated maintenance invoices per member per period
-- ============================================================
CREATE TABLE `invoices` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `society_id`      INT UNSIGNED NOT NULL,
  `member_id`       INT UNSIGNED NOT NULL,
  `invoice_number`  VARCHAR(50) NOT NULL UNIQUE,
  `billing_month`   DATE NOT NULL COMMENT 'First day of billing period',
  `due_date`        DATE NOT NULL,
  `subtotal`        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `gst_amount`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `total_amount`    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `penalty_amount`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status`          ENUM('draft','sent','paid','overdue','cancelled') NOT NULL DEFAULT 'draft',
  `paid_at`         DATETIME NULL,
  `payment_mode`    ENUM('cash','upi','neft','cheque','other') NULL,
  `payment_ref`     VARCHAR(100) NULL,
  `notes`           TEXT NULL,
  `created_by`      INT UNSIGNED NOT NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  INDEX `idx_society_status` (`society_id`, `status`),
  INDEX `idx_member_billing` (`member_id`, `billing_month`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: invoice_line_items
-- Breakdown of each invoice
-- ============================================================
CREATE TABLE `invoice_line_items` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `invoice_id`  INT UNSIGNED NOT NULL,
  `head_id`     INT UNSIGNED NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `amount`      DECIMAL(10,2) NOT NULL,
  `gst_percent` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `gst_amount`  DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`head_id`) REFERENCES `maintenance_heads`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: compliance_vault
-- Central document repository for statutory filings
-- ============================================================
CREATE TABLE `compliance_vault` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `society_id`      INT UNSIGNED NOT NULL,
  `category`        ENUM('rcs_filing','dcs_filing','rera_doc','agm_minutes','sgm_minutes','bye_law','audit_report','income_tax','other') NOT NULL,
  `title`           VARCHAR(255) NOT NULL,
  `description`     TEXT NULL,
  `file_path`       VARCHAR(500) NOT NULL,
  `file_name`       VARCHAR(255) NOT NULL,
  `file_size`       INT UNSIGNED NOT NULL COMMENT 'bytes',
  `mime_type`       VARCHAR(100) NOT NULL,
  `filing_date`     DATE NULL COMMENT 'Statutory filing date if applicable',
  `expiry_date`     DATE NULL COMMENT 'For documents that expire',
  `financial_year`  VARCHAR(10) NULL COMMENT 'e.g. 2024-25',
  `reference_number` VARCHAR(100) NULL COMMENT 'RCS/DCS acknowledgement number',
  `uploaded_by`     INT UNSIGNED NOT NULL,
  `is_confidential` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  INDEX `idx_society_category` (`society_id`, `category`),
  INDEX `idx_expiry` (`expiry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: rera_defects
-- RERA Defect Liability Period tracking (Section 14(3))
-- ============================================================
CREATE TABLE `rera_defects` (
  `id`                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `society_id`        INT UNSIGNED NOT NULL,
  `reported_by`       INT UNSIGNED NOT NULL COMMENT 'member_id',
  `unit_number`       VARCHAR(30) NOT NULL,
  `defect_type`       ENUM('structural','plumbing','electrical','waterproofing','finishing','common_area','other') NOT NULL,
  `description`       TEXT NOT NULL,
  `reported_date`     DATE NOT NULL,
  `dlp_expiry_date`   DATE NOT NULL COMMENT 'Possession date + 5 years',
  `status`            ENUM('open','escalated_to_builder','acknowledged_by_builder','resolved','closed_dlp_expired') NOT NULL DEFAULT 'open',
  `escalation_date`   DATE NULL,
  `builder_response`  TEXT NULL,
  `resolution_date`   DATE NULL,
  `resolution_notes`  TEXT NULL,
  `evidence_paths`    JSON NULL COMMENT 'Array of file paths for photos/docs',
  `created_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`reported_by`) REFERENCES `members`(`id`) ON DELETE RESTRICT,
  INDEX `idx_society_status` (`society_id`, `status`),
  INDEX `idx_dlp_expiry` (`dlp_expiry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: meetings
-- AGM / SGM / Committee meeting records
-- ============================================================
CREATE TABLE `meetings` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `society_id`      INT UNSIGNED NOT NULL,
  `meeting_type`    ENUM('agm','sgm','committee','emergency') NOT NULL,
  `title`           VARCHAR(255) NOT NULL,
  `scheduled_date`  DATETIME NOT NULL,
  `venue`           VARCHAR(255) NULL,
  `quorum_required` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `quorum_present`  SMALLINT UNSIGNED NULL,
  `status`          ENUM('scheduled','completed','cancelled','adjourned') NOT NULL DEFAULT 'scheduled',
  `agenda`          TEXT NULL,
  `minutes_text`    LONGTEXT NULL,
  `minutes_doc_id`  INT UNSIGNED NULL COMMENT 'FK to compliance_vault',
  `created_by`      INT UNSIGNED NOT NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`minutes_doc_id`) REFERENCES `compliance_vault`(`id`) ON DELETE SET NULL,
  INDEX `idx_society_type` (`society_id`, `meeting_type`),
  INDEX `idx_scheduled_date` (`scheduled_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: notices
-- Official society notices and circulars
-- ============================================================
CREATE TABLE `notices` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `society_id`    INT UNSIGNED NOT NULL,
  `title`         VARCHAR(255) NOT NULL,
  `body`          LONGTEXT NOT NULL,
  `category`      ENUM('general','financial','maintenance','legal','emergency','event') NOT NULL DEFAULT 'general',
  `is_pinned`     TINYINT(1) NOT NULL DEFAULT 0,
  `published_at`  DATETIME NULL COMMENT 'NULL = draft',
  `expires_at`    DATETIME NULL,
  `created_by`    INT UNSIGNED NOT NULL,
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT,
  INDEX `idx_society_published` (`society_id`, `published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: visitor_log
-- Gate management / visitor entries
-- ============================================================
CREATE TABLE `visitor_log` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `society_id`      INT UNSIGNED NOT NULL,
  `member_id`       INT UNSIGNED NULL COMMENT 'Host unit',
  `unit_number`     VARCHAR(30) NOT NULL,
  `visitor_name`    VARCHAR(150) NOT NULL,
  `visitor_phone`   VARCHAR(15) NULL,
  `vehicle_number`  VARCHAR(20) NULL,
  `purpose`         VARCHAR(255) NULL,
  `entry_time`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `exit_time`       DATETIME NULL,
  `logged_by`       INT UNSIGNED NOT NULL COMMENT 'Guard/staff user_id',
  FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON DELETE SET NULL,
  INDEX `idx_society_entry` (`society_id`, `entry_time`),
  INDEX `idx_unit` (`unit_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: audit_log
-- Immutable system audit trail
-- ============================================================
CREATE TABLE `audit_log` (
  `id`          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `society_id`  INT UNSIGNED NULL,
  `user_id`     INT UNSIGNED NULL,
  `action`      VARCHAR(100) NOT NULL COMMENT 'e.g. invoice.created, member.deleted',
  `entity_type` VARCHAR(50) NULL COMMENT 'e.g. invoice, member',
  `entity_id`   INT UNSIGNED NULL,
  `old_values`  JSON NULL,
  `new_values`  JSON NULL,
  `ip_address`  VARCHAR(45) NULL,
  `user_agent`  VARCHAR(500) NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_society_action` (`society_id`, `action`),
  INDEX `idx_entity` (`entity_type`, `entity_id`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE: compliance_alerts
-- Auto-generated reminders for upcoming filings
-- ============================================================
CREATE TABLE `compliance_alerts` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `society_id`      INT UNSIGNED NOT NULL,
  `alert_type`      ENUM('rcs_filing_due','dcs_annual_return','rera_dlp_expiring','agm_due','audit_due','document_expiry') NOT NULL,
  `title`           VARCHAR(255) NOT NULL,
  `due_date`        DATE NOT NULL,
  `is_dismissed`    TINYINT(1) NOT NULL DEFAULT 0,
  `related_doc_id`  INT UNSIGNED NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`society_id`) REFERENCES `societies`(`id`) ON DELETE CASCADE,
  INDEX `idx_society_due` (`society_id`, `due_date`, `is_dismissed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 6. Module Specifications

### 6.1 Public Marketing Site (Product Side)
**URL:** `propertease.abhinavjain.site`
**Files:** `/public_html/product/`

#### Pages Required
| Page | File | Purpose |
|---|---|---|
| Home / Landing | `index.php` | Hero, features, social proof, CTA |
| Pricing | `pricing.php` | Plan comparison table |
| Registration Wizard | `register/` | 3-step onboarding |
| Domain Verification | `verify-domain.php` | Cloudflare CNAME check API |

#### Registration Wizard Steps
- **Step 1:** Society Admin account creation (name, email, password)
- **Step 2:** Society details (name, RCS no., RERA ID, address, total units)
- **Step 3:** Choose subdomain (e.g., `greenvilla.propertease.in`) → CNAME instructions displayed

#### Domain Verification Logic
```php
// verify-domain.php — checks if CNAME is pointed correctly
// Uses dns_get_record() to verify CNAME points to Cloudflare
$cname = dns_get_record($society_domain, DNS_CNAME);
// If CNAME target matches expected Cloudflare endpoint → mark domain_verified = 1
```

---

### 6.2 Society Onboarding & Registration
#### Coding Instructions for GitHub Copilot
1. Create `product/register/index.php` — HTML5 form with Bootstrap 5. POST to `process_step1.php`.
2. Create `product/register/process_step1.php` — Validate email uniqueness via PDO prepared statement. Hash password with `password_hash($pass, PASSWORD_BCRYPT, ['cost'=>12])`. Insert into `users` with `role='secretary'`. Store `user_id` in `$_SESSION['reg_user_id']`. Redirect to `step2.php`.
3. Create `product/register/step2.php` + `process_step2.php` — Insert into `societies`. Generate a `custom_domain` suggestion based on society name. Store `society_id` in session. Redirect to `step3.php`.
4. Create `product/register/step3.php` — Display CNAME instructions. Add AJAX polling to `verify-domain.php` every 10 seconds to check DNS propagation.
5. On verification success — Update `societies.domain_verified = 1`. Update `users.society_id`. Send welcome email via `core/Mailer.php`. Redirect admin to `app-propertease.abhinavjain.site/dashboard.php`.

---

### 6.3 Multi-Tenant Routing Engine
**File:** `app/core/TenantResolver.php`

#### Coding Instructions
```php
// Step 1: Extract host from Cloudflare Worker header
$host = $_SERVER['HTTP_X_ORIGINAL_HOST'] ?? $_SERVER['HTTP_HOST'] ?? '';
$host = strtolower(trim($host));

// Step 2: Query societies table with PDO prepared statement
$stmt = $pdo->prepare("SELECT * FROM societies WHERE custom_domain = ? AND domain_verified = 1 AND is_active = 1 LIMIT 1");
$stmt->execute([$host]);
$society = $stmt->fetch(PDO::FETCH_ASSOC);

// Step 3: If not found → 404 or redirect to product site
if (!$society) {
    header("Location: https://propertease.abhinavjain.site");
    exit;
}

// Step 4: Store in session and global scope
$_SESSION['society_id'] = $society['id'];
define('CURRENT_SOCIETY', $society);
```

---

### 6.4 Authentication & RBAC
**Files:** `app/login.php`, `core/Auth.php`, `core/RBAC.php`

#### Roles & Permissions Matrix
| Permission | super_admin | secretary | president | treasurer | committee_member | resident |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Manage Members | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Generate Invoices | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Record Payments | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Upload Compliance Docs | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Create Notices | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| View Own Invoices | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage RERA Defects | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Society Settings | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Super Admin Panel | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

#### Auth Flow
1. `login.php` POST → `core/Auth.php::login()` → PDO prepared query → `password_verify()` → set `$_SESSION['user_id']`, `$_SESSION['role']`, `$_SESSION['society_id']`
2. Every protected page calls `Auth::requireLogin()` and `RBAC::check($permission)` at the top
3. Sessions use `session_regenerate_id(true)` after login to prevent fixation
4. Failed login attempts tracked in `audit_log`; lockout after 5 attempts in 15 minutes

---

### 6.5 Member & Unit Management
**Files:** `app/members/`

#### Features
- Add/Edit/Deactivate member records
- Unit occupancy tracking (owner vs. tenant)
- Bulk CSV import of members (initial onboarding)
- Member portal access invitation via email

#### Coding Instructions
1. `members/index.php` — DataTable (vanilla JS) showing all active members. Filter by block/floor. Export to CSV button.
2. `members/add.php` — Form with unit number uniqueness check via AJAX (`/api/check-unit.php`). On submit: insert `members`, optionally create `users` record and send invite email.
3. `members/edit.php` — Pre-populated form. Log all field changes to `audit_log` with `old_values` / `new_values` JSON.

---

### 6.6 Maintenance Billing & Ledger
**Files:** `app/billing/`

#### Invoice Number Format
`PE-{SOCIETY_CODE}-{YYYY}-{MMDD}-{SEQ}` → e.g., `PE-GV-2025-0101-0042`

#### Billing Flow
1. **Configure Heads** (`settings/billing-config.php`) — Secretary defines maintenance heads, amounts, GST.
2. **Generate Invoices** (`billing/generate.php`) — Select billing month → system generates one invoice per active member → calculates line items per active heads → applies GST where applicable.
3. **Record Payment** (`billing/record-payment.php`) — Secretary marks invoice as paid, enters payment mode and reference.
4. **Overdue Detection** — Daily cron (or on-load check): if `due_date < NOW()` and `status != 'paid'` → update to `overdue`, add penalty if configured.
5. **Ledger View** (`billing/index.php`) — Filter by member/month/status. Show totals. GST-compliant PDF invoice generation.

#### Coding Instructions
```php
// billing/generate.php — Core generation logic outline
// 1. Verify RBAC: requirePermission('generate_invoices')
// 2. Get all active members for CURRENT_SOCIETY
// 3. Get all active maintenance_heads for CURRENT_SOCIETY
// 4. Loop members → begin transaction
//    a. INSERT invoices record (status='draft')
//    b. Loop heads → INSERT invoice_line_items
//    c. UPDATE invoices SET total_amount = SUM(line items)
// 5. Commit transaction → log to audit_log
// Use PDO transactions: $pdo->beginTransaction() / commit() / rollBack()
```

---

### 6.7 Compliance Vault (RCS / DCS / RERA)
**Files:** `app/compliance/`

#### Document Categories & Statutory Context
| Category | Statute | Typical Annual Deadline |
|---|---|---|
| `rcs_filing` | RCS Section 79 | 30 Sept each year |
| `dcs_filing` | DCS Act Annual Return | 31 Dec each year |
| `audit_report` | Cooperative Audit | 30 June each year |
| `agm_minutes` | Cooperative Act | Within 6 months of FY end |
| `rera_doc` | RERA 2016 | As required |
| `bye_law` | Society Constitution | On amendment |

#### RERA DLP Tracker
- Secretary enters possession date per block/society
- System auto-calculates DLP expiry (possession date + 5 years per Section 14(3))
- Members can log defects via `compliance/rera.php`
- Status workflow: `open` → `escalated_to_builder` → `acknowledged_by_builder` → `resolved`
- Escalation generates a formal letter template (HTML → PDF)

#### Compliance Alert Engine
```php
// core/ComplianceAlerts.php — Run on dashboard load or via cron
// 1. Check: Is RCS filing due within 60 days? Insert alert if not already present.
// 2. Check: Are any compliance_vault docs expiring within 30 days?
// 3. Check: Is AGM overdue? (Last AGM > 15 months ago)
// 4. Check: Are any RERA DLPs expiring within 90 days?
// All checks are society-scoped using CURRENT_SOCIETY['id']
```

---

### 6.8 Notice Board & Communication
**Files:** `app/notices/`

#### Features
- Create rich-text notices (use Quill.js CDN — lightweight, no framework)
- Pin important notices to top
- Category tagging (financial, legal, maintenance, emergency)
- Email blast to all members on publish (optional toggle)
- Public notice board accessible without login (configurable)

---

### 6.9 Visitor & Gate Management
**Files:** `app/visitors/`

#### Features
- Log visitor entry: name, phone, host unit, purpose, vehicle
- Log exit: update `exit_time`
- Search log by date range, unit, visitor name
- Pre-approved visitor list (frequent visitors)
- Daily report downloadable as CSV

---

### 6.10 Admin Super-Panel
**Files:** `app/admin/` (accessible only to `super_admin` role)

#### Features
- List all societies, their plan, and status
- Impersonate any society (set `$_SESSION['impersonating'] = true`)
- Manually verify domains
- View global audit log
- Manage pricing plans

---

## 7. Security Requirements

### 7.1 Mandatory Practices (Non-Negotiable)
- [ ] **All DB queries** use PDO prepared statements — zero raw string interpolation
- [ ] **All user input** sanitized with `htmlspecialchars(strip_tags($input))` before display
- [ ] **CSRF tokens** on every POST form: generate via `bin2hex(random_bytes(32))`, store in session, validate on submit
- [ ] **File uploads** validated by MIME type (`finfo_file()`), not extension. Whitelisted: PDF, JPG, PNG. Stored outside `public_html` or with `.htaccess` deny-all.
- [ ] **Passwords** hashed with `password_hash($p, PASSWORD_BCRYPT, ['cost' => 12])`
- [ ] **Session** config: `session.cookie_httponly=1`, `session.cookie_secure=1`, `session.use_strict_mode=1`
- [ ] **Society isolation** enforced by always including `society_id = ?` in every tenant-scoped query
- [ ] **Rate limiting** on login: 5 attempts per IP per 15 minutes (tracked in DB or APCu)

### 7.2 .htaccess Security Headers
```apache
Header always set X-Frame-Options "SAMEORIGIN"
Header always set X-Content-Type-Options "nosniff"
Header always set X-XSS-Protection "1; mode=block"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Permissions-Policy "geolocation=(), microphone=()"

# Block direct access to core/ and uploads/
<FilesMatch "\.(env|log|sql|sh|json)$">
    Require all denied
</FilesMatch>
```

---

## 8. API Contract (Internal)

All internal AJAX endpoints live under `/app/api/` and return JSON.

### Response Envelope Standard
```json
{
  "success": true | false,
  "message": "Human readable message",
  "data": { ... } | null,
  "errors": { "field": "Error message" } | null
}
```

### Endpoints Reference
| Endpoint | Method | Auth Required | Description |
|---|---|---|---|
| `/api/check-unit.php` | GET | Yes | Check if unit number exists in society |
| `/api/verify-domain.php` | GET | No | Check DNS CNAME for domain verification |
| `/api/invoice-status.php` | POST | Yes | Update invoice status |
| `/api/dismiss-alert.php` | POST | Yes | Dismiss a compliance alert |
| `/api/visitor-exit.php` | POST | Yes | Log visitor exit time |
| `/api/get-notices.php` | GET | Optional | Fetch published notices for society |

---

## 9. UI/UX Standards

### 9.1 Design System
- **Framework:** Bootstrap 5.3
- **Primary Color:** `#1A4A8A` (Deep Institutional Blue)
- **Accent Color:** `#F5A623` (Amber — denotes alerts/actions)
- **Success:** `#27AE60` | **Danger:** `#E74C3C`
- **Font:** `Mukta` (Google Fonts) — supports Devanagari for future Hindi support
- **Dashboard Layout:** Sidebar (left, collapsible) + Top navbar + Main content area

### 9.2 Page Structure Template
```html
<!-- Every app page follows this structure -->
<?php require_once '../core/bootstrap.php'; ?>
<?php Auth::requireLogin(); ?>
<?php RBAC::check('required_permission'); ?>
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Bootstrap 5.3 CDN, Mukta font, custom CSS -->
</head>
<body>
  <?php include '../partials/navbar.php'; ?>
  <?php include '../partials/sidebar.php'; ?>
  <main class="main-content">
    <?php include '../partials/alerts.php'; // Flash messages ?>
    <!-- Page content -->
  </main>
</body>
</html>
```

### 9.3 Flash Message System
```php
// Set: $_SESSION['flash'] = ['type' => 'success', 'message' => '...']
// Display in partials/alerts.php, then unset
```

---

## 10. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Page Load Time | < 2 seconds on 4G connection |
| Database Query Time | < 100ms per query (indexes mandatory on all FK columns) |
| File Upload Limit | 10MB per file (enforce in PHP + .htaccess) |
| Session Timeout | 60 minutes inactivity |
| Supported Browsers | Chrome 90+, Firefox 88+, Safari 14+, Edge 90+ |
| Mobile Responsiveness | Bootstrap breakpoints — fully functional on 375px width |
| Data Backup | Manual DB export weekly (cPanel automation) |
| Uptime Target | 99.5% (Hostinger shared SLA) |

---

## 11. Deployment Checklist

### Pre-Launch
- [ ] `.env` file exists outside `public_html` (one level up)
- [ ] `core/bootstrap.php` loads `.env` from correct relative path
- [ ] All `uploads/` directories have correct Hostinger permissions (`755` for dirs, `644` for files)
- [ ] Cloudflare Worker deployed and tested with `curl -H "X-Original-Host: test.propertease.in"`
- [ ] SSL active on both `propertease.abhinavjain.site` and `app-propertease.abhinavjain.site` via Hostinger/Cloudflare
- [ ] Database created, all tables imported, foreign keys verified
- [ ] SMTP credentials tested via `core/Mailer.php` test script
- [ ] `error_reporting(0)` in production; errors logged to file, not displayed
- [ ] Super admin account seeded manually via SQL insert

### Post-Launch
- [ ] Test full registration flow end-to-end
- [ ] Test tenant isolation: log in as two different societies and verify no data crossover
- [ ] Test invoice generation and PDF export
- [ ] Verify compliance alert engine fires correctly
- [ ] Load test login page (basic — 50 concurrent via browser)

---

## 12. Glossary

| Term | Definition |
|---|---|
| RWA | Resident Welfare Association |
| CGHS | Cooperative Group Housing Society |
| RCS | Registrar of Cooperative Societies |
| DCS Act | Delhi Cooperative Societies Act (or state equivalent) |
| RERA | Real Estate (Regulation & Development) Act, 2016 |
| DLP | Defect Liability Period (5 years post-possession under RERA Sec. 14(3)) |
| AGM | Annual General Meeting |
| SGM | Special General Meeting |
| FY | Financial Year (April 1 – March 31 in India) |
| Tenant | In this codebase, refers to a **Society** (SaaS tenant), not a flat tenant |
| Multi-Tenancy | One codebase, one database, many societies — isolated by `society_id` |
| CNAME | Canonical Name DNS record — used to point custom domain to Cloudflare |

---

*This document is the single source of truth for Propert-Ease v1.0. All code generated must conform to the constraints defined herein. Last reviewed by: Abhinav, Amogh, Vishnu.*
