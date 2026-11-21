/**
 * ==============================================================================
 * SPACFX — shared site behaviour (all pages)
 * Mobile navigation, light/dark theme, header state, scroll progress,
 * active navigation link and scroll-reveal animations.
 * ==============================================================================
 */

// Mobile Nav Toggle
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const navLinks = document.getElementById("navLinks");
mobileMenuBtn.addEventListener("click", () => {
    const open = navLinks.classList.toggle("active");
    mobileMenuBtn.setAttribute("aria-expanded", String(open));
    mobileMenuBtn.textContent = open ? "✕" : "☰";
});
function closeMobileNav() {
    navLinks.classList.remove("active");
    mobileMenuBtn.setAttribute("aria-expanded", "false");
    mobileMenuBtn.textContent = "☰";
}
document.addEventListener("click", (e) => {
    if (navLinks.classList.contains("active") && !navLinks.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
        closeMobileNav();
    }
});

// Reads a CSS color token so canvas charts follow the active theme
function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ==========================================
// THEME TOGGLE, HEADER STATE, SCROLL PROGRESS, ACTIVE NAV
// ==========================================
function initSiteChrome() {
    const root = document.documentElement;
    const toggle = document.getElementById("themeToggle");
    const setTheme = (t, persist) => {
        root.setAttribute("data-theme", t);
        if (persist) { try { localStorage.setItem("SPACFX_THEME", t); } catch (e) {} }
        document.dispatchEvent(new CustomEvent("spacfx:themechange", { detail: t }));
    };
    toggle.addEventListener("click", () => {
        setTheme(root.getAttribute("data-theme") === "light" ? "dark" : "light", true);
    });
    // Follow the system setting until the visitor picks a theme
    if (window.matchMedia) {
        const mq = window.matchMedia("(prefers-color-scheme: light)");
        const onSystemChange = (e) => {
            let saved = null;
            try { saved = localStorage.getItem("SPACFX_THEME"); } catch (err) {}
            if (!saved) setTheme(e.matches ? "light" : "dark", false);
        };
        if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
    }

    // Header shadow + scroll progress (rAF-throttled)
    const header = document.getElementById("siteHeader");
    const bar = document.getElementById("scrollProgress");
    let ticking = false;
    const onScroll = () => {
        const y = window.scrollY;
        header.classList.toggle("scrolled", y > 8);
        const max = document.documentElement.scrollHeight - window.innerHeight;
        bar.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
        ticking = false;
    };
    window.addEventListener("scroll", () => {
        if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
    }, { passive: true });
    onScroll();

    // Highlight the current page's nav link. On the home page, follow the section in view.
    const page = document.body.getAttribute("data-page");
    const links = Array.from(document.querySelectorAll(".nav-links a[data-nav]"));
    const mark = (key) => links.forEach(a => {
        const on = a.getAttribute("data-nav") === key;
        a.classList.toggle("active", on);
        if (on && page !== "home") a.setAttribute("aria-current", "page");
    });
    if (page !== "home") {
        mark(page);
    } else if ("IntersectionObserver" in window) {
        const sectionToNav = { home: "home", about: "about", performance: "performance", mentorship: "mentorship", reviews: "reviews", contact: "contact", connect: "contact" };
        const spy = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) mark(sectionToNav[entry.target.id] || "");
            });
        }, { rootMargin: "-45% 0px -50% 0px" });
        document.querySelectorAll("main section[id]").forEach(s => spy.observe(s));
    }

    // Soft spotlight that follows the pointer on About cards (desktop pointers only)
    if (window.matchMedia && window.matchMedia("(hover: hover)").matches) {
        document.querySelectorAll(".card").forEach(card => {
            card.addEventListener("pointermove", (e) => {
                const r = card.getBoundingClientRect();
                card.style.setProperty("--mx", `${e.clientX - r.left}px`);
                card.style.setProperty("--my", `${e.clientY - r.top}px`);
            });
        });
    }
}

// ==========================================
// SUBTLE SCROLL ANIMATIONS (INTERSECTION OBSERVER)
// ==========================================
function initScrollAnimations() {
    const elements = document.querySelectorAll(".fade-up:not(.is-visible)");
    if (!elements.length) return;

    // Accessibility: if user requested reduced motion or observer not supported
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        elements.forEach(el => el.classList.add("is-visible"));
        return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                el.classList.add("is-visible");
                obs.unobserve(el);
                // Drop stagger delays once revealed so hover effects respond instantly
                setTimeout(() => {
                    el.classList.remove("stagger-1", "stagger-2", "stagger-3", "stagger-4");
                }, 1200);
            }
        });
    }, {
        root: null,
        threshold: 0.08,
        rootMargin: "0px 0px -20px 0px"
    });

    elements.forEach(el => observer.observe(el));
}

// ==========================================
// 3D MOTION: background, card tilt, button pop
// ==========================================
const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// Fixed canvas of slowly rotating wireframe shapes (cubes, diamonds, pyramids)
// floating at different depths. Near shapes move faster when you scroll (parallax),
// scrolling also spins them a little, and they lean toward the pointer.
function initBackground3D() {
    if (REDUCED_MOTION) return;
    const canvas = document.createElement("canvas");
    canvas.className = "bg3d";
    canvas.setAttribute("aria-hidden", "true");
    document.body.prepend(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const MODELS = {
        cube: {
            v: [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],
            e: [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]]
        },
        diamond: {
            v: [[0,-1.4,0],[1,0,0],[0,0,1],[-1,0,0],[0,0,-1],[0,1.4,0]],
            e: [[0,1],[0,2],[0,3],[0,4],[5,1],[5,2],[5,3],[5,4],[1,2],[2,3],[3,4],[4,1]]
        },
        pyramid: {
            v: [[0,-1.3,0],[-1,0.8,-1],[1,0.8,-1],[1,0.8,1],[-1,0.8,1]],
            e: [[0,1],[0,2],[0,3],[0,4],[1,2],[2,3],[3,4],[4,1]]
        }
    };
    const kinds = Object.keys(MODELS);

    let W = 0, H = 0, dpr = 1, shapes = [], dots = [];
    const rand = (a, b) => a + Math.random() * (b - a);

    const build = () => {
        const small = W < 700;
        const n = small ? 9 : 16;
        shapes = Array.from({ length: n }, (_, i) => ({
            kind: kinds[i % kinds.length],
            x: rand(0.03, 0.97),            // horizontal position (fraction of width)
            y: rand(0, 1.6),                // vertical position in a 1.6-screen tall band
            z: rand(1, 3.2),                // depth: 1 = near, 3.2 = far
            size: rand(small ? 16 : 22, small ? 30 : 46),
            ax: rand(0, 6.28), ay: rand(0, 6.28),
            sx: rand(-0.004, 0.004), sy: rand(0.002, 0.007),
            accent: Math.random() < 0.25
        }));
        dots = Array.from({ length: small ? 28 : 60 }, () => ({
            x: rand(0, 1), y: rand(0, 1.6), z: rand(1, 4), r: rand(0.6, 1.6)
        }));
    };

    const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        W = window.innerWidth; H = window.innerHeight;
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        build();
    };

    let colors = {};
    const readColors = () => {
        const light = document.documentElement.getAttribute("data-theme") === "light";
        colors = {
            gold: cssVar("--gold-primary") || "#d4af37",
            accent: cssVar("--accent") || "#8b5cf6",
            alpha: light ? 0.32 : 0.42
        };
    };

    let pointerX = 0, pointerY = 0, targetPX = 0, targetPY = 0;
    let lastScroll = window.scrollY, spin = 0, running = true, raf = 0;

    window.addEventListener("pointermove", (e) => {
        targetPX = e.clientX / W - 0.5;
        targetPY = e.clientY / H - 0.5;
    }, { passive: true });

    const frame = () => {
        raf = 0;
        if (!running) return;
        const scroll = window.scrollY;
        const delta = scroll - lastScroll;
        lastScroll = scroll;
        spin = spin * 0.92 + Math.min(Math.abs(delta), 80) * 0.0009;   // scroll makes shapes spin faster
        pointerX += (targetPX - pointerX) * 0.05;
        pointerY += (targetPY - pointerY) * 0.05;

        ctx.clearRect(0, 0, W, H);
        const band = H * 1.6;
        const wrap = (v) => ((v % band) + band) % band - H * 0.3;

        // Star-like dust
        ctx.fillStyle = colors.gold;
        dots.forEach(d => {
            const px = d.x * W - pointerX * 30 / d.z;
            const py = wrap(d.y * H - scroll * 0.35 / d.z) - pointerY * 30 / d.z;
            ctx.globalAlpha = colors.alpha * 0.9 / d.z;
            ctx.beginPath(); ctx.arc(px, py, d.r, 0, 6.283); ctx.fill();
        });

        // Wireframe solids
        ctx.lineWidth = 1.2;
        ctx.lineJoin = "round";
        shapes.forEach(s => {
            s.ax += s.sx + spin * 0.6;
            s.ay += s.sy + spin;
            const m = MODELS[s.kind];
            const cx = s.x * W - pointerX * 60 / s.z;
            const cy = wrap(s.y * H - scroll * 0.55 / s.z) - pointerY * 60 / s.z;
            const size = s.size / (s.z * 0.55);
            const cX = Math.cos(s.ax), sX = Math.sin(s.ax), cY = Math.cos(s.ay), sY = Math.sin(s.ay);
            const pts = m.v.map(([x, y, z]) => {
                // rotate around Y, then X, then perspective-project
                const x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
                const y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
                const p = 4 / (4 + z2);
                return [cx + x1 * size * p, cy + y1 * size * p];
            });
            ctx.strokeStyle = s.accent ? colors.accent : colors.gold;
            ctx.globalAlpha = colors.alpha / s.z;
            ctx.beginPath();
            m.e.forEach(([a, b]) => { ctx.moveTo(pts[a][0], pts[a][1]); ctx.lineTo(pts[b][0], pts[b][1]); });
            ctx.stroke();
        });
        ctx.globalAlpha = 1;
        raf = requestAnimationFrame(frame);
    };

    const start = () => { if (!raf && running) raf = requestAnimationFrame(frame); };
    document.addEventListener("visibilitychange", () => {
        running = !document.hidden;
        if (running) { lastScroll = window.scrollY; start(); }
    });
    document.addEventListener("spacfx:themechange", readColors);
    let resizeTimer;
    window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); });

    readColors();
    resize();
    start();
    requestAnimationFrame(() => canvas.classList.add("is-ready"));
}

// Cards lean toward the pointer in 3D (mouse/trackpad only, not touch)
function initCardTilt(root) {
    if (REDUCED_MOTION || !(window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches)) return;
    const sel = ".card, .metric-card, .review-card, .mentorship-card-feature, .contact-info-card";
    (root || document).querySelectorAll(sel).forEach(el => {
        if (el.dataset.tilt) return;
        el.dataset.tilt = "1";
        el.classList.add("tilt-3d");
        el.addEventListener("pointermove", (e) => {
            if (el.classList.contains("fade-up") && !el.classList.contains("is-visible")) return;
            const r = el.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5;
            const py = (e.clientY - r.top) / r.height - 0.5;
            const max = r.width > 600 ? 3 : 8;   // big panels tilt less
            el.style.setProperty("--ry", `${(px * max * 2).toFixed(2)}deg`);
            el.style.setProperty("--rx", `${(-py * max * 2).toFixed(2)}deg`);
            el.classList.add("is-tilting");
        });
        el.addEventListener("pointerleave", () => {
            el.classList.remove("is-tilting");
            el.style.removeProperty("--rx");
            el.style.removeProperty("--ry");
        });
    });
}

// Buttons press in, pop back out, and send a ripple from the touch point
function initButtonPop() {
    if (REDUCED_MOTION) return;
    document.addEventListener("pointerdown", (e) => {
        const btn = e.target.closest && e.target.closest(".btn");
        if (!btn || btn.disabled) return;
        const r = btn.getBoundingClientRect();
        const ripple = document.createElement("span");
        ripple.className = "btn-ripple";
        ripple.style.left = `${e.clientX - r.left}px`;
        ripple.style.top = `${e.clientY - r.top}px`;
        btn.appendChild(ripple);
        ripple.addEventListener("animationend", () => ripple.remove());
    });
    document.addEventListener("pointerup", (e) => {
        const btn = e.target.closest && e.target.closest(".btn");
        if (!btn || btn.disabled) return;
        btn.classList.remove("btn-pop");
        void btn.offsetWidth;            // restart the animation
        btn.classList.add("btn-pop");
        btn.addEventListener("animationend", () => btn.classList.remove("btn-pop"), { once: true });
    });
}

window.addEventListener("DOMContentLoaded", () => {
    initSiteChrome();
    initScrollAnimations();
    initBackground3D();
    initCardTilt();
    initButtonPop();
    // Reviews and other cards added later also get the tilt
    if ("MutationObserver" in window) {
        let t;
        new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => initCardTilt(), 200); })
            .observe(document.querySelector("main") || document.body, { childList: true, subtree: true });
    }
});
