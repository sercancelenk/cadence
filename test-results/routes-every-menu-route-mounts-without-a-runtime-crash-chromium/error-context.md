# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: routes.spec.ts >> every menu / route mounts without a runtime crash
- Location: e2e/routes.spec.ts:38:5

# Error details

```
Error: browserType.launch: Executable doesn't exist at /var/folders/m9/0bm7zp7d4bdfs87fnv3mzllr0000gn/T/cursor-sandbox-cache/344947bd6b098f3e25a2d47779f29299/playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell
╔════════════════════════════════════════════════════════════╗
║ Looks like Playwright was just installed or updated.       ║
║ Please run the following command to download new browsers: ║
║                                                            ║
║     npx playwright install                                 ║
║                                                            ║
║ <3 Playwright Team                                         ║
╚════════════════════════════════════════════════════════════╝
```