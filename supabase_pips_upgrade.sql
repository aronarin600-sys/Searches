-- SPACFX upgrade: pips + R fields, remove sample dashboard data. Safe to run more than once.
ALTER TABLE public.daily_performance ADD COLUMN IF NOT EXISTS net_pips NUMERIC(10, 1) NULL; -- net pips for the day (e.g. 85 or -40)
ALTER TABLE public.daily_performance ADD COLUMN IF NOT EXISTS net_r NUMERIC(8, 2) NULL;     -- net R for the day (e.g. 1.5 or -1)
DROP TABLE IF EXISTS public.dashboard_usd;
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
SELECT 'Upgrade done' AS result;
