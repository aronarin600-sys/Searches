-- ==============================================================================
-- SPACFX DATABASE SCHEMA & ROW LEVEL SECURITY SETUP
-- Compatible with Supabase (PostgreSQL)
-- ==============================================================================

-- 1. DAILY PERFORMANCE TABLE
-- Tracks daily net realized P/L and trading metrics.
-- Exactly one record represents the overall result for one reporting date.
CREATE TABLE IF NOT EXISTS public.daily_performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trading_date DATE NOT NULL,
    daily_net_pnl NUMERIC(12, 2) NOT NULL,
    trading_status TEXT NOT NULL CHECK (trading_status IN ('Profit', 'Loss', 'Break-even', 'No Trading')),
    num_trades INTEGER NULL CHECK (num_trades IS NULL OR num_trades >= 0),
    market_notes TEXT NULL,
    publication_status TEXT NOT NULL DEFAULT 'Draft' CHECK (publication_status IN ('Draft', 'Published')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Prevent more than one record for the same reporting date
    CONSTRAINT unique_trading_date UNIQUE (trading_date)
);

-- Index for speedy date ordering and calendar queries
CREATE INDEX IF NOT EXISTS idx_daily_performance_date ON public.daily_performance (trading_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_performance_pub ON public.daily_performance (publication_status);

-- 2. STUDENT REVIEWS TABLE
-- Stores mentorship reviews. Only approved/published reviews appear publicly.
CREATE TABLE IF NOT EXISTS public.student_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_name TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 5 CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT NOT NULL,
    location_or_batch TEXT NULL,
    publication_status TEXT NOT NULL DEFAULT 'Draft' CHECK (publication_status IN ('Draft', 'Published')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_student_reviews_pub ON public.student_reviews (publication_status);

-- 3. ENABLE ROW LEVEL SECURITY (RLS)
-- Crucial: Backend-level security ensures visitors cannot insert, modify or delete data.
ALTER TABLE public.daily_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_reviews ENABLE ROW LEVEL SECURITY;

-- 4. ROW LEVEL SECURITY POLICIES FOR DAILY PERFORMANCE

-- Public Visitors: Can ONLY read published records
DROP POLICY IF EXISTS "Public can view published performance" ON public.daily_performance;
CREATE POLICY "Public can view published performance"
ON public.daily_performance
FOR SELECT
TO anon, authenticated
USING (publication_status = 'Published');

-- Administrators: Authenticated users have full management rights (Create, Read, Update, Delete)
DROP POLICY IF EXISTS "Admins have full access to performance" ON public.daily_performance;
CREATE POLICY "Admins have full access to performance"
ON public.daily_performance
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 5. ROW LEVEL SECURITY POLICIES FOR STUDENT REVIEWS

-- Public Visitors: Can ONLY view published reviews
DROP POLICY IF EXISTS "Public can view published reviews" ON public.student_reviews;
CREATE POLICY "Public can view published reviews"
ON public.student_reviews
FOR SELECT
TO anon, authenticated
USING (publication_status = 'Published');

-- Administrators: Full control to add, edit, approve, and delete reviews
DROP POLICY IF EXISTS "Admins have full access to reviews" ON public.student_reviews;
CREATE POLICY "Admins have full access to reviews"
ON public.student_reviews
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 6. AUTOMATIC UPDATED_AT TIMESTAMP TRIGGER
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
