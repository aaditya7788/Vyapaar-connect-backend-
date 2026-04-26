# 🚀 Vyapaar Connect - System Reset & Onboarding Guide

This document outlines the procedure for performing a clean slate reset of the development data and initializing the system with correct categories and AI-powered icons.

## 🛠 Prerequisites
- Node.js installed
- Environment variables configured in `backend/.env`
- Database (PostgreSQL) is reachable

---

## 🏗 Step 1: Data Purge (Clean Slate)
To remove all existing mock shops, services, and ratings while preserving user accounts and communities:

```bash
cd backend
node purge_mock_data.js
```

---

## 📂 Step 2: Initialize Categories
Populate the database with the official category and subcategory structure (supporting Phase 13 features like Mascots and Quantity-based booking):

```bash
node seed_categories.js
```

---

## 🎨 Step 3: AI Icon Synchronization
Pull high-quality icons from Icons8 for all newly created categories using the AI matching logic:

```bash
node scripts/sync_icons8.js
```

---

## 🏪 Step 4: Seed Mock Shops & Services
Generate fresh, properly categorized shop data for the primary test provider:

```bash
node seed_shops_v2.js
```

---

## 👨‍💼 Primary Provider Reference
All new shops created via scripts or manual entry should be linked to the primary test provider:
- **Provider ID**: `dbe567da-77c4-47db-9719-c21da72df8d0`

---

## 📝 Script Audit (Clean State)
The following scripts have been retained for core system management:
- `purge_mock_data.js`: Atomic database cleaning.
- `seed_categories.js`: Category schema initialization.
- `scripts/sync_icons8.js`: AI Icon engine.
- `scripts/sync_icons8_direct.js`: Direct icon engine.

*All legacy seed scripts and utility diagnostics have been removed for project health.*
