# Generated from public/.htaccess.tpl by the nitro:init hook in nuxt.config.ts.
# The base-URL placeholder is filled with the app base at generate time so paths
# resolve for both production (/) and preview (/pr-<n>/) builds; the robots
# placeholder becomes an X-Robots-Tag noindex header on preview builds only.

# HTTP security headers. Apache mod_headers must be enabled on the host.
<IfModule mod_headers.c>
    Header always set X-Frame-Options "DENY"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    __ROBOTS_HEADER__
</IfModule>

# SPA fallback. This is a client-rendered Nuxt app (ssr: false), so the host
# only has real files for static assets — every in-app route (e.g. /app/insights)
# must be served the app shell so Vue Router can resolve it client-side.
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase __BASE__

    # Let real files and directories (assets, icons, the SW, etc.) serve directly.
    RewriteCond %{REQUEST_FILENAME} -f [OR]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]

    # Everything else falls back to the app shell.
    RewriteRule ^ __BASE__index.html [L]
</IfModule>
