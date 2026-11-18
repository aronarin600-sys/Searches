# SPACFX — Gold Market Mastery & Daily Performance System

Welcome to your SPACFX website and daily performance tracking system! This project has been built using clean, accessible web technologies, paired with Supabase for persistent, secure database storage and administrator authentication.

---

## 1. Framework & Tools Inspection

Your project is built with:
* **Frontend:** Semantic **HTML5**, modern **CSS3** (utilizing custom variables, flexbox, grid, and backdrop filters), and native **vanilla JavaScript (ES6+)**.
* **Charting:** High-performance native **HTML5 Canvas** (no bulky external charting libraries, completely offline-compatible and lightweight).
* **Backend & Database:** **Supabase** (powered by PostgreSQL), utilizing official Supabase client libraries via CDN.
* **Authentication & Authorization:** **Supabase Auth** paired with PostgreSQL **Row Level Security (RLS)** policies to enforce data security at the database engine level.

---

## 2. What Was Added & Preserved

1. **Brand Identity & Structure Preserved:**
   - Kept the homepage structure, navigation, hero section, about section, official contact channels, and social links.
   - Upgraded to the **premium black-and-gold SPACFX aesthetic** with gold gradients, dark surface cards, and responsive layouts.

2. **Daily Performance Tracker:**
   - Fields: Trading Date, Daily Net Realized P/L, Trading Status (Profit, Loss, Break-even, No Trading), Trades count (optional), Market Notes (optional), and Publication Status (Draft/Published).
   - Prevents duplicate entries on the same reporting date using database constraints.
   - Calculates total net P/L, win rate (%), days breakdown, and renders an interactive calendar and an equity curve chart from real published records.
   - Pure realized results: Never includes floating P/L, deposits, or withdrawals.

3. **Advanced Training & Mentorship Section:**
   - Exact required title: **“ADVANCED TRAINING & MENTORSHIP”**
   - Exact required subtitle: **“A MORE IN-DEPTH APPROACH TO UNDERSTANDING THE GOLD MARKET.”**
   - Exact required description, feature card, and direct contact area pointing to official contact channels.
   - No pricing, discounts, or installment plans displayed.

4. **Student Mentorship Reviews:**
   - Section titled: **“EXPERIENCES FROM THE MENTORSHIP COMMUNITY.”**
   - Touch-friendly horizontal carousel with gold accents.
   - Displays a professional empty state when zero reviews are published—no fake names or simulated testimonials.

5. **Private Administrator Dashboard (`admin.html`):**
   - Secured by Supabase authentication.
   - Add, edit, publish, unpublish, and delete daily performance records.
   - Add, approve, edit, and delete student reviews.
   - Database connection and currency settings manager.

---

## 3. Step-by-Step Supabase Setup

### Step A: Create your Supabase Project
1. Go to [https://supabase.com](https://supabase.com) and create a free account.
2. Click **New Project**, choose a project name (e.g. `spacfx`), enter a secure database password, and select a region close to you.

### Step B: Create the Database Tables & Security Policies
1. In your Supabase Dashboard, click on **SQL Editor** in the left navigation.
2. Open the file [supabase_schema.sql](file:///c:/Users/User/Searches/supabase_schema.sql) from this project.
3. Copy all the SQL code, paste it into the Supabase SQL Editor, and click **Run**.
4. This creates:
   - `daily_performance` table (with unique date constraint).
   - `student_reviews` table.
   - Row Level Security (RLS) policies allowing public visitors to **read published records only**, while restricting insert/update/delete to authenticated admins.

### Step C: Create your Admin User
1. In your Supabase Dashboard, navigate to **Authentication > Users**.
2. Click **Add User** > **Create User**.
3. Enter your administrator email and a strong password. (Make sure to toggle "Auto Confirm User" so you can log in immediately).

### Step D: Connect the Website to Supabase
1. In your Supabase Dashboard, go to **Project Settings** (gear icon) > **API**.
2. Copy:
   - **Project URL** (e.g., `https://your-project.supabase.co`)
   - **Project API Keys -> `anon` (public)**
   *(⚠️ Never use or expose your `service_role` secret key!)*
3. You can connect it in either of two ways:
   - **Option 1 (Easiest):** Open [admin.html](file:///c:/Users/User/Searches/admin.html) in your browser, click **Database Setup** in the top right, and paste your URL and `anon` key.
   - **Option 2:** Open [supabase-config.js](file:///c:/Users/User/Searches/supabase-config.js) in a text editor and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

---

## 4. How to Preview and Run the Website Locally

You can preview the site immediately without installing any web servers:

1. Open File Explorer to `C:\Users\User\Searches`.
2. **Public Website:** Double-click [index.html](file:///c:/Users/User/Searches/index.html) to open it in your browser.
3. **Administrator Dashboard:** Double-click [admin.html](file:///c:/Users/User/Searches/admin.html) to manage your daily records and reviews.
