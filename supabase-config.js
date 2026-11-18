/**
 * ==============================================================================
 * SPACFX Supabase & Application Configuration
 * ==============================================================================
 * 
 * For beginners:
 * 1. Create a free account at https://supabase.com
 * 2. Create a new project.
 * 3. Go to Project Settings -> API.
 * 4. Copy your "Project URL" and your public "anon" API key.
 * 5. Paste them below or enter them via the Admin Settings screen.
 * 
 * SECURITY NOTE:
 * Never put your "service_role" secret key here! Only use the "anon" public key.
 * Database Row Level Security (RLS) protects your data even though this code runs in the browser.
 */

const SPACFX_DEFAULT_CONFIG = {
    // Your Supabase Project URL (from your project yhysqcialvapzajfmpkl):
    SUPABASE_URL: "https://yhysqcialvapzajfmpkl.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_wRcRffy9ngPoMBAq3tHU0w_9XyUa1Cg",
    
    // Reporting Currency configuration
    REPORTING_CURRENCY: "USD",
    REPORTING_CURRENCY_SYMBOL: "$",
};

// Allow overrides from localStorage (useful for instant browser testing without modifying code)
const getAppConfig = () => {
    const savedUrl = localStorage.getItem("SPACFX_SUPABASE_URL");
    const savedKey = localStorage.getItem("SPACFX_SUPABASE_ANON_KEY");
    const savedCurrency = localStorage.getItem("SPACFX_REPORTING_CURRENCY");
    const savedSymbol = localStorage.getItem("SPACFX_REPORTING_CURRENCY_SYMBOL");

    return {
        SUPABASE_URL: savedUrl || SPACFX_DEFAULT_CONFIG.SUPABASE_URL || "",
        SUPABASE_ANON_KEY: savedKey || SPACFX_DEFAULT_CONFIG.SUPABASE_ANON_KEY || "",
        REPORTING_CURRENCY: savedCurrency || SPACFX_DEFAULT_CONFIG.REPORTING_CURRENCY || "USD",
        REPORTING_CURRENCY_SYMBOL: savedSymbol || SPACFX_DEFAULT_CONFIG.REPORTING_CURRENCY_SYMBOL || "$",
    };
};

let _supabaseClient = null;

const initSupabaseClient = () => {
    const config = getAppConfig();
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
        return null;
    }

    if (typeof window.supabase === "undefined" || !window.supabase.createClient) {
        console.warn("Supabase client library not loaded yet.");
        return null;
    }

    if (!_supabaseClient) {
        _supabaseClient = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
    }
    return _supabaseClient;
};

// Formatter for currency
const formatCurrency = (amount, includeSign = false) => {
    const config = getAppConfig();
    const num = Number(amount) || 0;
    const formatted = Math.abs(num).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    const symbol = config.REPORTING_CURRENCY_SYMBOL;
    if (includeSign) {
        if (num > 0) return `+${symbol}${formatted}`;
        if (num < 0) return `-${symbol}${formatted}`;
        return `${symbol}${formatted}`;
    }
    return `${symbol}${formatted}`;
};

// Expose on window object
window.SPACFX = {
    getConfig: getAppConfig,
    formatCurrency,
    getClient: initSupabaseClient,
    
    // Check if configuration is present
    isConfigured: () => {
        const config = getAppConfig();
        return Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
    },

    // Save configuration directly from UI
    saveConfig: (url, anonKey, currency, symbol) => {
        if (url) localStorage.setItem("SPACFX_SUPABASE_URL", url.trim());
        if (anonKey) localStorage.setItem("SPACFX_SUPABASE_ANON_KEY", anonKey.trim());
        if (currency) localStorage.setItem("SPACFX_REPORTING_CURRENCY", currency.trim().toUpperCase());
        if (symbol) localStorage.setItem("SPACFX_REPORTING_CURRENCY_SYMBOL", symbol.trim());
        _supabaseClient = null; // Reset client
    },

    clearConfig: () => {
        localStorage.removeItem("SPACFX_SUPABASE_URL");
        localStorage.removeItem("SPACFX_SUPABASE_ANON_KEY");
        _supabaseClient = null;
    }
};
