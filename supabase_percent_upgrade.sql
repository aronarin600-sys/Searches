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

-- 11c. USD is never public any more (percentages replace it). Switch the old option off.
UPDATE public.site_settings SET show_public_usd = false WHERE id = 1;

-- 11d. Public read path: % and pips for everyone, USD and balance for admins only
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
        SELECT public.is_admin() AS yes
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
           CASE WHEN adm.yes THEN c.daily_net_pnl END,
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
           adm.yes
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

-- ==============================================================================
-- 11f. SELF-TEST (changes nothing: the test data is rolled back automatically)
-- Starting capital 100,000: +5,000 -> +5.00%, +2,100 -> +2.00%, -1,071 -> -1.00%.
-- Runs as a logged-out visitor would see it, so USD must come back hidden.
-- ==============================================================================
CREATE TEMP TABLE IF NOT EXISTS spacfx_self_test (step INT, test TEXT, expected TEXT, actual TEXT, result TEXT);
TRUNCATE spacfx_self_test;

DO $$
DECLARE
    pcts NUMERIC[];
    usd_hidden BOOLEAN;
    bal_hidden BOOLEAN;
    n INT;
BEGIN
    BEGIN
        UPDATE public.trading_account SET starting_capital = 100000 WHERE id = 1;
        INSERT INTO public.daily_performance (trading_date, daily_net_pnl, trading_status, publication_status) VALUES
            (DATE '1990-01-02',  5000, 'Profit', 'Published'),
            (DATE '1990-01-03',  2100, 'Profit', 'Published'),
            (DATE '1990-01-04', -1071, 'Loss',   'Published');
        SELECT array_agg(g.daily_pct ORDER BY g.trading_date),
               bool_and(g.daily_net_pnl IS NULL),
               bool_and(g.start_balance IS NULL),
               count(*)
          INTO pcts, usd_hidden, bal_hidden, n
          FROM public.get_published_performance() g
         WHERE g.trading_date < DATE '1990-02-01';
        RAISE SQLSTATE 'SPX01';   -- undo the test data
    EXCEPTION WHEN SQLSTATE 'SPX01' THEN
        NULL;
    END;

    INSERT INTO spacfx_self_test VALUES
        (1, 'Day 1: +5,000 on 100,000', '+5.00%', to_char(pcts[1], 'FMSG990.00') || '%',
            CASE WHEN round(pcts[1], 2) = 5.00 THEN 'PASS' ELSE 'FAIL' END),
        (2, 'Day 2: +2,100 on 105,000', '+2.00%', to_char(pcts[2], 'FMSG990.00') || '%',
            CASE WHEN round(pcts[2], 2) = 2.00 THEN 'PASS' ELSE 'FAIL' END),
        (3, 'Day 3: -1,071 on 107,100', '-1.00%', to_char(pcts[3], 'FMSG990.00') || '%',
            CASE WHEN round(pcts[3], 2) = -1.00 THEN 'PASS' ELSE 'FAIL' END),
        (4, 'Logged-out visitor gets no USD P&L', 'hidden',
            CASE WHEN usd_hidden THEN 'hidden' ELSE 'VISIBLE' END,
            CASE WHEN usd_hidden AND n = 3 THEN 'PASS' ELSE 'FAIL' END),
        (5, 'Logged-out visitor gets no balance', 'hidden',
            CASE WHEN bal_hidden THEN 'hidden' ELSE 'VISIBLE' END,
            CASE WHEN bal_hidden AND n = 3 THEN 'PASS' ELSE 'FAIL' END);
END $$;

SELECT step, test, expected, actual, result FROM spacfx_self_test ORDER BY step;
