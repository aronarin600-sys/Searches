-- ==============================================================================
-- SPACFX DATABASE SCHEMA & ROW LEVEL SECURITY SETUP
-- Compatible with Supabase (PostgreSQL)
-- ==============================================================================

-- 1. DAILY PERFORMANCE TABLE
-- Tracks daily net realized P/L and manual journal metrics.
-- Exactly one record represents the overall result for one reporting date.
CREATE TABLE IF NOT EXISTS public.daily_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trading_date DATE NOT NULL,
    daily_net_pnl NUMERIC(12, 2) NOT NULL, -- Net realized P&L after costs
    trading_status TEXT NOT NULL CHECK (trading_status IN ('Profit', 'Loss', 'Break-even', 'No Trading')),
    num_trades INTEGER NULL CHECK (num_trades IS NULL OR num_trades >= 0), -- Total trades
    winning_trades INTEGER NULL CHECK (winning_trades IS NULL OR winning_trades >= 0),
    losing_trades INTEGER NULL CHECK (losing_trades IS NULL OR losing_trades >= 0),
    be_trades INTEGER NULL CHECK (be_trades IS NULL OR be_trades >= 0), -- Break-even trades
    win_rate NUMERIC(5, 2) NULL, -- Manually entered win rate %
    risk_reward TEXT NULL, -- Manually entered average R:R ratio (e.g. 1:2.5)
    market_notes TEXT NULL,
    publication_status TEXT NOT NULL DEFAULT 'Draft' CHECK (publication_status IN ('Draft', 'Published')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Prevent more than one record for the same reporting date
    CONSTRAINT unique_trading_date UNIQUE (trading_date)
);

-- Safely add new columns to existing daily_performance table if already created
ALTER TABLE public.daily_performance ADD COLUMN IF NOT EXISTS winning_trades INTEGER NULL;
ALTER TABLE public.daily_performance ADD COLUMN IF NOT EXISTS losing_trades INTEGER NULL;
ALTER TABLE public.daily_performance ADD COLUMN IF NOT EXISTS be_trades INTEGER NULL;
ALTER TABLE public.daily_performance ADD COLUMN IF NOT EXISTS win_rate NUMERIC(5, 2) NULL;
ALTER TABLE public.daily_performance ADD COLUMN IF NOT EXISTS risk_reward TEXT NULL;
ALTER TABLE public.daily_performance ADD COLUMN IF NOT EXISTS net_pips NUMERIC(10, 1) NULL; -- net pips for the day (e.g. 85 or -40)
ALTER TABLE public.daily_performance ADD COLUMN IF NOT EXISTS net_r NUMERIC(8, 2) NULL;     -- net R for the day (e.g. 1.5 or -1)

CREATE INDEX IF NOT EXISTS idx_daily_performance_date ON public.daily_performance (trading_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_performance_pub ON public.daily_performance (publication_status);

-- 2. STUDENT REVIEWS TABLE
CREATE TABLE IF NOT EXISTS public.student_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_name TEXT NOT NULL,
    allow_name BOOLEAN NOT NULL DEFAULT true, -- Show name only when student agreed to be identified
    is_verified BOOLEAN NOT NULL DEFAULT true, -- Confirmed verified mentorship student
    review_date DATE NULL DEFAULT CURRENT_DATE, -- Date of review
    rating INTEGER NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT NOT NULL,
    location_or_batch TEXT NULL,
    publication_status TEXT NOT NULL DEFAULT 'Draft' CHECK (publication_status IN ('Draft', 'Published')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- In case table was previously created, add new columns safely:
ALTER TABLE public.student_reviews ADD COLUMN IF NOT EXISTS allow_name BOOLEAN DEFAULT true;
ALTER TABLE public.student_reviews ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT true;
ALTER TABLE public.student_reviews ADD COLUMN IF NOT EXISTS review_date DATE DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_student_reviews_pub ON public.student_reviews (publication_status);

-- 3. CONTACT INQUIRIES TABLE
-- Stores messages submitted through the website's Contact Us form.
CREATE TABLE IF NOT EXISTS public.contact_inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Contacted', 'Archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_created ON public.contact_inquiries (created_at DESC);

-- 4. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.daily_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;

-- 5. ROW LEVEL SECURITY POLICIES FOR DAILY PERFORMANCE
DROP POLICY IF EXISTS "Public can view published performance" ON public.daily_performance;
CREATE POLICY "Public can view published performance"
ON public.daily_performance
FOR SELECT
TO anon, authenticated
USING (publication_status = 'Published');

DROP POLICY IF EXISTS "Admins have full access to performance" ON public.daily_performance;
CREATE POLICY "Admins have full access to performance"
ON public.daily_performance
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 6. ROW LEVEL SECURITY POLICIES FOR STUDENT REVIEWS
DROP POLICY IF EXISTS "Public can view published reviews" ON public.student_reviews;
CREATE POLICY "Public can view published reviews"
ON public.student_reviews
FOR SELECT
TO anon, authenticated
USING (publication_status = 'Published');

DROP POLICY IF EXISTS "Admins have full access to reviews" ON public.student_reviews;
CREATE POLICY "Admins have full access to reviews"
ON public.student_reviews
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 7. ROW LEVEL SECURITY POLICIES FOR CONTACT INQUIRIES
-- Visitors can submit (INSERT) their message, but CANNOT read other visitors' messages!
DROP POLICY IF EXISTS "Anyone can submit contact inquiry" ON public.contact_inquiries;
CREATE POLICY "Anyone can submit contact inquiry"
ON public.contact_inquiries
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Only authenticated administrators can view, update or delete inquiries
DROP POLICY IF EXISTS "Admins can view and manage inquiries" ON public.contact_inquiries;
CREATE POLICY "Admins can view and manage inquiries"
ON public.contact_inquiries
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 8. AUTOMATIC UPDATED_AT TIMESTAMP TRIGGERS
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_daily_performance_timestamp ON public.daily_performance;
CREATE TRIGGER set_daily_performance_timestamp
    BEFORE UPDATE ON public.daily_performance
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_student_reviews_timestamp ON public.student_reviews;
CREATE TRIGGER set_student_reviews_timestamp
    BEFORE UPDATE ON public.student_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 9. ADMIN ALLOWLIST + ADMIN-ONLY USD FOR THE PERFORMANCE DASHBOARD
-- ==============================================================================
-- The public dashboard on performance.html shows pips, R and trades entered in
-- admin.html. USD amounts are only returned to admins by get_published_performance()
-- (or to everyone when the admin turns on show_public_usd).
-- Being signed in is not enough: a member/other authenticated user gets 0 rows.

-- 9a. Who counts as an admin
CREATE TABLE IF NOT EXISTS public.admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: nobody can read or edit this list through the API.
REVOKE ALL ON TABLE public.admin_users FROM anon, authenticated;

-- 9b. is_admin(): true only for the signed-in user if they are on the allowlist
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid());
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- 9c. The old sample-only "dashboard_usd" table is no longer used. The dashboard
-- now reads USD from daily_performance (admins only, via get_published_performance).
DROP TABLE IF EXISTS public.dashboard_usd;

-- 9e. MAKE YOURSELF AN ADMIN — replace the email below with your admin login, then run:
-- INSERT INTO public.admin_users (user_id)
-- SELECT id FROM auth.users WHERE email = 'your-admin-email@example.com'
-- ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 10. ADMIN-CONTROLLED PUBLIC USD P&L ON THE DAILY PERFORMANCE PAGE
-- ==============================================================================
-- Requires section 9 (admin_users + is_admin()).
-- !! BEFORE RUNNING: add your admin login to public.admin_users (step 9e).
-- !! From this section on, only allowlisted admins can read or edit
-- !! daily_performance directly, including in admin.html.
--
-- How it works:
--   * site_settings.show_public_usd is the switch the admin flips in admin.html.
--   * The public page never reads daily_performance directly. It calls
--     get_published_performance(), which returns daily_net_pnl = NULL unless the
--     switch is on (or the caller is an admin). Day status is always returned,
--     so the calendar keeps its profit / loss / break-even colours.

-- 10a. Single-row settings table
CREATE TABLE IF NOT EXISTS public.site_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    show_public_usd BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
INSERT INTO public.site_settings (id, show_public_usd) VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, DELETE, TRUNCATE ON TABLE public.site_settings FROM anon, authenticated;

DROP POLICY IF EXISTS "Anyone can read site settings" ON public.site_settings;
CREATE POLICY "Anyone can read site settings"
ON public.site_settings
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Only admins can change site settings" ON public.site_settings;
CREATE POLICY "Only admins can change site settings"
ON public.site_settings
FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS set_site_settings_timestamp ON public.site_settings;
CREATE TRIGGER set_site_settings_timestamp
    BEFORE UPDATE ON public.site_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 10b. No direct public reads of daily_performance (amounts live in this table)
DROP POLICY IF EXISTS "Public can view published performance" ON public.daily_performance;
DROP POLICY IF EXISTS "Admins have full access to performance" ON public.daily_performance;
DROP POLICY IF EXISTS "Only admins can manage performance" ON public.daily_performance;
CREATE POLICY "Only admins can manage performance"
ON public.daily_performance
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 10c. Public read path: amounts only when the admin allows it
-- (DROP first: the returned columns changed when net_pips / net_r were added)
DROP FUNCTION IF EXISTS public.get_published_performance();
CREATE FUNCTION public.get_published_performance()
RETURNS TABLE (
    id UUID,
    trading_date DATE,
    daily_net_pnl NUMERIC,
    trading_status TEXT,
    num_trades INTEGER,
    winning_trades INTEGER,
    losing_trades INTEGER,
    be_trades INTEGER,
    win_rate NUMERIC,
    risk_reward TEXT,
    net_pips NUMERIC,
    net_r NUMERIC,
    market_notes TEXT,
    amounts_visible BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH v AS (
        SELECT COALESCE((SELECT s.show_public_usd FROM public.site_settings s WHERE s.id = 1), false)
               OR public.is_admin() AS visible
    )
    SELECT p.id,
           p.trading_date,
           CASE WHEN v.visible THEN p.daily_net_pnl ELSE NULL END,
           p.trading_status,
           p.num_trades,
           p.winning_trades,
           p.losing_trades,
           p.be_trades,
           p.win_rate,
           p.risk_reward,
           p.net_pips,
           p.net_r,
           p.market_notes,
           v.visible
    FROM public.daily_performance p
    CROSS JOIN v
    WHERE p.publication_status = 'Published'
    ORDER BY p.trading_date ASC;
$$;
REVOKE ALL ON FUNCTION public.get_published_performance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_performance() TO anon, authenticated;

-- ==============================================================================
-- 11. PERCENTAGE TRACKING + PUBLIC REVIEWS WITH ADMIN APPROVAL
-- ==============================================================================
-- Safe to run more than once. Requires sections 1-10 (admin_users / is_admin()).
--
-- What this adds:
--   * trading_account  : your Starting Capital (admin-only, never public)
--   * capital_flows    : deposits (+) and withdrawals (-) (admin-only, never public)
--   * get_published_performance() now also returns daily_pct, calculated HERE in
--     the database, so visitors receive percentages and pips only. USD P&L and
--     balances are returned only to allowlisted admins.
--   * Visitors can submit a star review; it stays hidden ("Draft") until an
--     admin publishes it in the Admin Portal.
--
-- How the daily % is calculated (compounding):
--   start balance of a day = starting capital
--                          + all PUBLISHED P&L before that day
--                          + all deposits/withdrawals dated on or before that day
--   daily %                = that day's P&L / start balance x 100
--   A deposit or withdrawal changes the balance but is never counted as profit or loss.
--   Draft days are not counted until they are published.
-- ==============================================================================

-- 11a. Starting capital (single row, admin-only)
CREATE TABLE IF NOT EXISTS public.trading_account (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    starting_capital NUMERIC(14, 2) NULL CHECK (starting_capital IS NULL OR starting_capital > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
INSERT INTO public.trading_account (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.trading_account ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trading_account FROM anon;
DROP POLICY IF EXISTS "Only admins can read or change the trading account" ON public.trading_account;
CREATE POLICY "Only admins can read or change the trading account"
ON public.trading_account
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS set_trading_account_timestamp ON public.trading_account;
CREATE TRIGGER set_trading_account_timestamp
    BEFORE UPDATE ON public.trading_account
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 11b. Deposits / withdrawals (admin-only). Deposit = positive, withdrawal = negative.
CREATE TABLE IF NOT EXISTS public.capital_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flow_date DATE NOT NULL,
    amount NUMERIC(14, 2) NOT NULL CHECK (amount <> 0),
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_capital_flows_date ON public.capital_flows (flow_date);

ALTER TABLE public.capital_flows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.capital_flows FROM anon;
DROP POLICY IF EXISTS "Only admins can manage capital flows" ON public.capital_flows;
CREATE POLICY "Only admins can manage capital flows"
ON public.capital_flows
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 11c. Public USD returns are controlled by site_settings.show_public_usd (Admin Portal switch).

-- 11d. Public read path: % and pips for everyone; USD P&L for admins, or for everyone when the
--      admin switches "Public USD Returns" on. Capital and balances are admins only.
DROP FUNCTION IF EXISTS public.get_published_performance();
CREATE FUNCTION public.get_published_performance()
RETURNS TABLE (
    id UUID,
    trading_date DATE,
    daily_net_pnl NUMERIC,
    trading_status TEXT,
    num_trades INTEGER,
    winning_trades INTEGER,
    losing_trades INTEGER,
    be_trades INTEGER,
    win_rate NUMERIC,
    risk_reward TEXT,
    net_pips NUMERIC,
    net_r NUMERIC,
    market_notes TEXT,
    daily_pct NUMERIC,
    start_balance NUMERIC,
    amounts_visible BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH adm AS (
        SELECT public.is_admin() AS yes,
               public.is_admin()
               OR COALESCE((SELECT s.show_public_usd FROM public.site_settings s WHERE s.id = 1), false) AS usd
    ),
    cap AS (
        SELECT (SELECT a.starting_capital FROM public.trading_account a WHERE a.id = 1) AS amount
    ),
    pub AS (
        SELECT p.*,
               COALESCE(SUM(p.daily_net_pnl) OVER (
                   ORDER BY p.trading_date
                   ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prior_pnl
        FROM public.daily_performance p
        WHERE p.publication_status = 'Published'
    ),
    calc AS (
        SELECT pub.*,
               cap.amount
               + pub.prior_pnl
               + COALESCE((SELECT SUM(f.amount) FROM public.capital_flows f
                           WHERE f.flow_date <= pub.trading_date), 0) AS sb
        FROM pub
        CROSS JOIN cap
    )
    SELECT c.id,
           c.trading_date,
           CASE WHEN adm.usd THEN c.daily_net_pnl END,
           c.trading_status,
           c.num_trades,
           c.winning_trades,
           c.losing_trades,
           c.be_trades,
           c.win_rate,
           c.risk_reward,
           c.net_pips,
           c.net_r,
           c.market_notes,
           CASE WHEN c.sb > 0 THEN ROUND(c.daily_net_pnl / c.sb * 100, 6) END,
           CASE WHEN adm.yes THEN c.sb END,
           adm.usd
    FROM calc c
    CROSS JOIN adm
    ORDER BY c.trading_date ASC;
$$;
REVOKE ALL ON FUNCTION public.get_published_performance() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_published_performance() TO anon, authenticated;

-- 11e. Reviews: visitors may SUBMIT a review; it is hidden until an admin publishes it
ALTER TABLE public.student_reviews ADD COLUMN IF NOT EXISTS submitted_by_visitor BOOLEAN NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "Admins have full access to reviews" ON public.student_reviews;
CREATE POLICY "Admins have full access to reviews"
ON public.student_reviews
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Visitors can submit a review for approval" ON public.student_reviews;
CREATE POLICY "Visitors can submit a review for approval"
ON public.student_reviews
FOR INSERT
TO anon, authenticated
WITH CHECK (
    publication_status = 'Draft'
    AND submitted_by_visitor = true
    AND is_verified = false
    AND char_length(student_name) BETWEEN 2 AND 60
    AND char_length(review_text) BETWEEN 10 AND 1200
    AND (location_or_batch IS NULL OR char_length(location_or_batch) <= 80)
);

-- Contact messages: only allowlisted admins can read them (visitors can still send)
DROP POLICY IF EXISTS "Admins can view and manage inquiries" ON public.contact_inquiries;
CREATE POLICY "Admins can view and manage inquiries"
ON public.contact_inquiries
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

