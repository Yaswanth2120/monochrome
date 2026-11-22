# Security policy

## Supported versions

Only the latest release on `main` receives security fixes.

## Reporting a vulnerability

**Please don't open a public issue for security problems.** Report them privately through GitHub instead:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**.

You'll get an acknowledgement within a few days, and a fix or a plan once the issue has been confirmed. Please give us reasonable time to release a fix before disclosing anything publicly.

## Scope and known limitations

- MonoChrome currently runs entirely in the browser. Habit data is stored in the browser's `localStorage` on the user's own device and is never sent to a server.
- The lock-screen passcode is a convenience lock, not a security boundary. It lives in client-side code, so anyone with access to the device and developer tools can get past it. Don't rely on it to protect sensitive information.
