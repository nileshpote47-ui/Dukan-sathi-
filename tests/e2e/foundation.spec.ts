import { expect, test } from '@playwright/test'
import { apiClientFor, hasTestUsers, login, trackPageErrors, users } from './helpers'

/*
 * Phase 1 journey: LOGIN → SESSION → ONBOARDING → BUSINESS CREATION → DASHBOARD
 * → BUSINESS EDIT → LOGOUT, plus user A / user B isolation.
 * Runs in order; each test builds on the previous one. Test users must start
 * without a business (see tests/e2e/README.md for reset SQL).
 */
test.describe.configure({ mode: 'serial' })

test('signed-out visitors are sent to login and back after signing in', async ({ page }) => {
  await page.goto('/dashboard/business')
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard%2Fbusiness/)
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
})

test('login shows friendly errors and validation', async ({ page }) => {
  await page.goto('/login')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('This field is required.').first()).toBeVisible()

  await page.getByLabel('Email').fill('nobody@dukaansathi-e2e.test')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Email or password is incorrect.' })).toBeVisible()
  // What was typed is kept after a failed attempt.
  await expect(page.getByLabel('Email')).toHaveValue('nobody@dukaansathi-e2e.test')
})

test('sign-up form validates before contacting the server', async ({ page }) => {
  await page.goto('/signup')
  await page.getByLabel('Your name').fill('R')
  await page.getByLabel('Email').fill('not-an-email')
  await page.getByLabel('Password').fill('short')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('Must be at least 2 characters.')).toBeVisible()
  await expect(page.getByText('Enter a valid email address.')).toBeVisible()
  await expect(page.getByText('Must be at least 8 characters.')).toBeVisible()
})

test.describe('with test users', () => {
  test.skip(!hasTestUsers, 'Set E2E_USER_A_* and E2E_USER_B_* (see tests/e2e/README.md)')

  test('user A: login → onboarding → dashboard', async ({ page }) => {
    const errors = trackPageErrors(page)
    await login(page, users.a)
    // No business yet → onboarding.
    await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.getByText('Step 1 of 7')).toBeVisible()

    // Step 1: name (validation first)
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('This field is required.')).toBeVisible()
    await page.getByLabel('Business name').fill('Shree Ganesh Kirana')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 2: category → creates the business
    await expect(page.getByText('Step 2 of 7')).toBeVisible()
    await page.getByLabel('Business category').selectOption('grocery')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 3: contact
    await expect(page.getByText('Step 3 of 7')).toBeVisible()
    await expect(page.getByLabel('Owner name')).toHaveValue('E2E Owner A') // from sign-up
    await page.getByLabel('Phone number').fill('12345')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Enter a valid mobile number')).toBeVisible()
    await page.getByLabel('Phone number').fill('98765 43210')
    await page.getByLabel('WhatsApp number').fill('+91 98765 43210')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 4: location
    await expect(page.getByText('Step 4 of 7')).toBeVisible()
    await page.getByLabel('Village / town').fill('Shirur')
    await page.getByLabel('District').fill('Pune')
    await page.getByLabel('State').fill('Maharashtra')
    await page.getByLabel('Pincode').fill('412210')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 5: language
    await expect(page.getByText('Step 5 of 7')).toBeVisible()
    await page.getByLabel(/English/).check()
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 6: brand (optional) — fill one field
    await expect(page.getByText('Step 6 of 7')).toBeVisible()
    await page.getByLabel('Tagline').fill('Fresh groceries at fair prices')
    await page.getByRole('button', { name: 'Next' }).click()

    // Step 7: review, edit a section, then finish
    await expect(page.getByText('Step 7 of 7')).toBeVisible()
    await expect(page.getByText('Shree Ganesh Kirana')).toBeVisible()
    await page.getByRole('button', { name: 'Edit: Business name' }).click()
    await expect(page.getByText('Step 1 of 7')).toBeVisible()
    await expect(page.getByLabel('Business name')).toHaveValue('Shree Ganesh Kirana')
    for (let step = 1; step <= 6; step++) await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Step 7 of 7')).toBeVisible()
    await page.getByRole('button', { name: 'Finish and go to dashboard' }).click()

    // Dashboard
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Shree Ganesh Kirana')
    await expect(page.getByText('Grocery')).toBeVisible()
    await expect(page.getByText('Shirur, Pune, Maharashtra 412210')).toBeVisible()
    await expect(page.getByText('Profile completion')).toBeVisible()
    // No fake metrics.
    await expect(page.getByText(/No data yet/)).toBeVisible()

    // Onboarding is done: going back there returns to the dashboard.
    await page.goto('/onboarding')
    await expect(page).toHaveURL(/\/dashboard$/)
    expect(errors).toEqual([])
  })

  test('user A: session persists, business can be viewed and edited, then logout', async ({ page, context }) => {
    const errors = trackPageErrors(page)
    await login(page, users.a, '/dashboard/business')
    await expect(page).toHaveURL(/\/dashboard\/business$/)

    // Session survives a reload and a new tab.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'My Business' })).toBeVisible()
    const tab = await context.newPage()
    await tab.goto('/dashboard')
    await expect(tab.getByRole('heading', { level: 1 })).toContainText('Shree Ganesh Kirana')
    await tab.close()

    // Signed-in users are sent away from login.
    await page.goto('/login')
    await expect(page).toHaveURL(/\/dashboard$/)

    // Edit with an invalid value first.
    await page.goto('/dashboard/business/edit')
    await page.getByLabel('Pincode').fill('012345')
    await page.getByLabel('Instagram page').fill('instagram.com/shop')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Enter a valid 6-digit pincode.')).toBeVisible()
    await expect(page.getByText('Enter a full web address starting with https://')).toBeVisible()

    await page.getByLabel('Pincode').fill('412211')
    await page.getByLabel('Instagram page').fill('https://instagram.com/shreeganeshkirana')
    await page.getByLabel('Business name').fill('Shree Ganesh Kirana Stores')
    await page.getByLabel('Opening hours').fill('Mon–Sat, 8 am – 9 pm')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page).toHaveURL(/\/dashboard\/business$/)
    await expect(page.getByRole('status').filter({ hasText: 'Business details saved.' })).toBeVisible()
    const main = page.getByRole('main')
    await expect(main.getByText('Shree Ganesh Kirana Stores')).toBeVisible()
    await expect(main.getByText('412211')).toBeVisible()
    await expect(main.getByRole('link', { name: /instagram\.com\/shreeganeshkirana/ })).toBeVisible()
    // The header shows the new name too.
    await expect(page.getByRole('banner').getByText('Shree Ganesh Kirana Stores')).toBeVisible()

    // Coming-soon sections exist but do nothing.
    await page.getByRole('link', { name: 'Create' }).click()
    await expect(page.getByRole('heading', { name: 'Coming soon' })).toBeVisible()

    // Logout from the mobile "More" menu.
    await page.getByRole('button', { name: 'More' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login$/)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/)
    expect(errors).toEqual([])
  })

  test('user B: unfinished onboarding resumes where it stopped', async ({ page }) => {
    // B creates only the basics through the API (as if they left after step 2).
    const { client } = await apiClientFor(users.b)
    const { error } = await client.from('businesses').insert({ business_name: 'B Mobiles', business_category: 'mobile_shop' })
    expect(error).toBeNull()

    await login(page, users.b)
    await expect(page).toHaveURL(/\/onboarding/)
    await expect(page.getByText('Welcome back! We saved your progress.')).toBeVisible()
    await expect(page.getByText('Step 3 of 7')).toBeVisible()
    // Dashboard is not reachable until onboarding is finished.
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/onboarding/)
  })

  test("user A cannot read, change or delete user B's business (real API, RLS)", async () => {
    const a = await apiClientFor(users.a)
    const b = await apiClientFor(users.b)

    const { data: bBusiness } = await b.client.from('businesses').select('id, business_name').single()
    expect(bBusiness?.business_name).toBe('B Mobiles')
    const bId = bBusiness!.id

    // A sees only their own business.
    const { data: visible } = await a.client.from('businesses').select('id, owner_id')
    expect(visible).toHaveLength(1)
    expect(visible![0].owner_id).toBe(a.userId)

    // Reading B's business by id returns nothing.
    const { data: read } = await a.client.from('businesses').select('*').eq('id', bId)
    expect(read).toEqual([])

    // Updating or deleting it affects no rows.
    const { data: updated } = await a.client.from('businesses').update({ business_name: 'Hacked' }).eq('id', bId).select()
    expect(updated).toEqual([])
    const { data: deleted } = await a.client.from('businesses').delete().eq('id', bId).select()
    expect(deleted).toEqual([])

    // A cannot give their business to B, or create one in B's name.
    const { error: transfer } = await a.client.from('businesses').update({ owner_id: b.userId }).eq('owner_id', a.userId)
    expect(transfer?.code).toBe('42501')
    const { error: planted } = await a.client
      .from('businesses')
      .insert({ owner_id: b.userId, business_name: 'Planted', business_category: 'other' })
    expect(planted?.code).toBe('42501')

    // A cannot see B's profile.
    const { data: profiles } = await a.client.from('profiles').select('user_id')
    expect(profiles?.map((p) => p.user_id)).toEqual([a.userId])

    // B's business is untouched.
    const { data: after } = await b.client.from('businesses').select('business_name, owner_id').single()
    expect(after).toEqual({ business_name: 'B Mobiles', owner_id: b.userId })
  })

  test('anonymous API access is refused', async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
    const { error: readError } = await anon.from('businesses').select('*')
    expect(readError?.code).toBe('42501')
    const { error: writeError } = await anon.from('businesses').insert({ business_name: 'Anon', business_category: 'other' })
    expect(writeError?.code).toBe('42501')
  })
})
