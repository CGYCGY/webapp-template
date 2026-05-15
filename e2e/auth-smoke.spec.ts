import { expect, test } from '@playwright/test';

const envEmail = process.env.E2E_USER_EMAIL;
const envPassword = process.env.E2E_USER_PASSWORD;

test.skip(
  !envEmail || !envPassword,
  'E2E_USER_EMAIL / E2E_USER_PASSWORD not set — copy .env.test.example to .env.test',
);

test('sign in via WorkOS, reach authenticated home, sign out', async ({
  page,
  context,
}) => {
  if (!envEmail || !envPassword) {
    throw new Error('unreachable: skip guard above');
  }
  const email = envEmail;
  const password = envPassword;

  await page.goto('/');

  await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  await page.getByRole('link', { name: /sign in/i }).click();

  // WorkOS hosted auth UI. Selectors target stable input types rather than
  // visible labels because the WorkOS layout has shifted between minor releases.
  const emailInput = page
    .locator('input[type="email"], input[name="email"]')
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  await emailInput.fill(email);

  // Two-step layout: click continue if the password field isn't visible yet.
  const passwordInput = page.locator('input[type="password"]').first();
  if (!(await passwordInput.isVisible().catch(() => false))) {
    await page
      .getByRole('button', { name: /continue|next|sign in/i })
      .first()
      .click();
    await passwordInput.waitFor({ state: 'visible', timeout: 15_000 });
  }
  await passwordInput.fill(password);

  await page
    .getByRole('button', { name: /sign in|continue|log in/i })
    .first()
    .click();

  // Wait for the redirect back to the app, then force-navigate to '/' so the
  // assertion is deterministic regardless of onboarding-gate destination.
  await page.waitForURL(/localhost:3000|127\.0\.0\.1:3000/, {
    timeout: 30_000,
  });
  await page.goto('/');

  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: /sign out/i }).click();

  // The sign-out POST triggers a 303 that clears the AuthKit cookie, then
  // bounces through WorkOS's logout endpoint. We don't drive the original page
  // through that chain — instead, open a fresh page in the same context (so it
  // inherits the now-cleared cookies) and assert the session is gone.
  await page
    .waitForURL(/workos\.com|localhost:3000/, { timeout: 15_000 })
    .catch(() => undefined);
  const verify = await context.newPage();
  await verify.goto('/');

  await expect(verify.getByRole('link', { name: /sign in/i })).toBeVisible({
    timeout: 15_000,
  });
});
