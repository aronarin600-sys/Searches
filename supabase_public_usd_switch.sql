-- SPACFX: Public USD Returns switch (safe to run more than once)
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
NOTIFY pgrst, 'reload schema';
SELECT 'Public USD switch ready' AS result;
