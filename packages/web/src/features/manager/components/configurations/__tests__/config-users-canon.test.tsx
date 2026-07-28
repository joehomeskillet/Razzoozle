// Regression tests pinning the ConfigUsers card canon, test-ids and
// self-guards that the WP 191 structural extraction (commit c00052715)
// silently regressed and that commits 350e1c23c/c69962925/ac722d4c4/
// 7905d5b90 restored (issue 499). Locks:
// 1. UserManagementList wraps rows in `space-y-3 p-0.5`, never a `divide-y`
//    list (ListRow already brings its own card chrome — a second list
//    border produced a border-in-a-border).
// 2. `user-select-<id>` test-id per row (e2e/stagehand/admin-self-delete-
//    guard.spec.ts:180 hangs off it).
// 3. The two distinct EmptyState copies (no-matches vs. truly-empty) stay
//    distinguishable.
// 4. Self-guard: copy/deactivate/delete are disabled for the logged-in
//    user's own row, and NOT disabled for anyone else's.
// 5. busy=true disables the mutating row actions.
// 6. Actions render as inline icon-buttons (ListRow's action cluster), not
//    exclusively inside the (closed-by-default) overflow menu.
//
// NOTE: vitest env is 'node' (no jsdom) — same renderToStaticMarkup + real
// i18next pattern as checkbox-in-listrow.test.tsx. `users-search` /
// `users-select-all` (ConfigUsers-level) are intentionally NOT covered here:
// rendering ConfigUsers needs the zustand manager store + router + toast
// mocks for state that this regression never touched (the c00052715 bug was
// scoped to the list/row canon and self-guards, not the filter bar), so the
// mocking cost isn't worth it for this test file.

import { createInstance } from "i18next"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { describe, expect, it } from "vitest"

import managerDe from "@razzoozle/web/locales/de/manager.json"
import commonDe from "@razzoozle/web/locales/de/common.json"

import UserManagementList from "../users/UserManagementList"
import UserManagementRow from "../users/UserManagementRow"
import type { ManagedUser } from "../users/userManagementApi"

const renderWithI18n = async (component: React.ReactNode) => {
  const i18n = createInstance()
  await i18n.init({
    lng: "de",
    fallbackLng: false,
    ns: ["manager", "common"],
    resources: {
      de: {
        manager: managerDe,
        common: commonDe,
      },
    },
  })

  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{component}</I18nextProvider>,
  )
}

const makeUser = (overrides: Partial<ManagedUser> = {}): ManagedUser => ({
  id: 1,
  username: "alice",
  role: "user",
  active: true,
  created_at: "2024-01-01",
  ...overrides,
})

const noop = () => {}
const noopSelection = { isSelected: () => false, toggle: noop }

// react-dom/server only emits `disabled=""` when the prop is truthy (verified
// against the project's own react-dom/server output) — the Tailwind class
// `disabled:opacity-60` is present on every button regardless of state, so a
// plain `.includes("disabled")` would false-positive on every row.
const buttonTags = (markup: string) => markup.match(/<button[^>]*>/g) ?? []
const findButtonByAriaLabel = (markup: string, label: string) =>
  buttonTags(markup).find((tag) => tag.includes(`aria-label="${label}"`))
const isDisabled = (tag: string | undefined) => Boolean(tag?.includes('disabled=""'))

describe("UserManagementList — card container canon (issue 499)", () => {
  it("wraps rows in space-y-3 p-0.5, never a divide-y list", async () => {
    const users = [makeUser({ id: 1, username: "alice" }), makeUser({ id: 2, username: "bob" })]
    const markup = await renderWithI18n(
      <UserManagementList
        loading={false}
        hasAnyUsers
        filteredUsers={users}
        selection={noopSelection}
        pendingId={null}
        busy={false}
        currentUsername={null}
        onToggleActive={noop}
        onCopyUser={noop}
        onOpenResetPassword={noop}
        onOpenDelete={noop}
      />,
    )

    expect(/<div[^>]*class="[^"]*\bspace-y-3\b[^"]*\bp-0\.5\b[^"]*"/.test(markup)).toBe(true)
    expect(markup).not.toContain("divide-y")
  })

  it("renders a user-select-<id> test-id per row", async () => {
    const users = [makeUser({ id: 7, username: "carol" }), makeUser({ id: 8, username: "dave" })]
    const markup = await renderWithI18n(
      <UserManagementList
        loading={false}
        hasAnyUsers
        filteredUsers={users}
        selection={noopSelection}
        pendingId={null}
        busy={false}
        currentUsername={null}
        onToggleActive={noop}
        onCopyUser={noop}
        onOpenResetPassword={noop}
        onOpenDelete={noop}
      />,
    )

    expect(markup).toContain('data-testid="user-select-7"')
    expect(markup).toContain('data-testid="user-select-8"')
  })
})

describe("UserManagementList — two-state EmptyState (issue 499)", () => {
  it("shows the no-matches copy when users exist but the filter yields none", async () => {
    const markup = await renderWithI18n(
      <UserManagementList
        loading={false}
        hasAnyUsers
        filteredUsers={[]}
        selection={noopSelection}
        pendingId={null}
        busy={false}
        currentUsername={null}
        onToggleActive={noop}
        onCopyUser={noop}
        onOpenResetPassword={noop}
        onOpenDelete={noop}
      />,
    )

    expect(markup).toContain(managerDe.users.noMatchesHeadline)
    expect(markup).toContain(managerDe.users.noMatches)
    expect(markup).not.toContain(managerDe.users.emptyHeadline)
  })

  it("shows the truly-empty copy when there are no users at all", async () => {
    const markup = await renderWithI18n(
      <UserManagementList
        loading={false}
        hasAnyUsers={false}
        filteredUsers={[]}
        selection={noopSelection}
        pendingId={null}
        busy={false}
        currentUsername={null}
        onToggleActive={noop}
        onCopyUser={noop}
        onOpenResetPassword={noop}
        onOpenDelete={noop}
      />,
    )

    expect(markup).toContain(managerDe.users.emptyHeadline)
    expect(markup).toContain(managerDe.users.empty)
    expect(markup).not.toContain(managerDe.users.noMatchesHeadline)
  })
})

describe("UserManagementRow — self-guard (issue 499)", () => {
  it("disables copy, deactivate and delete for the logged-in user's own row", async () => {
    const self = makeUser({ id: 1, username: "alice", active: true })
    const markup = await renderWithI18n(
      <UserManagementRow
        user={self}
        isSelected={false}
        onToggleSelect={noop}
        isPending={false}
        busy={false}
        currentUsername="alice"
        onToggleActive={noop}
        onCopyUser={noop}
        onOpenResetPassword={noop}
        onOpenDelete={noop}
      />,
    )

    // Self-guarded actions swap their aria-label to the disabled-reason
    // title (title ?? label) — asserting on that string also proves the
    // guard reason text made it into the DOM, not just the disabled flag.
    const copyBtn = findButtonByAriaLabel(markup, "Du kannst dein eigenes Konto nicht kopieren")
    expect(copyBtn, "copy button (self)").toBeDefined()
    expect(isDisabled(copyBtn)).toBe(true)

    const toggleBtn = findButtonByAriaLabel(markup, managerDe.users.cannot_deactivate_self)
    expect(toggleBtn, "deactivate button (self)").toBeDefined()
    expect(isDisabled(toggleBtn)).toBe(true)

    const deleteBtn = findButtonByAriaLabel(markup, managerDe.users.cannot_delete_self)
    expect(deleteBtn, "delete button (self)").toBeDefined()
    expect(isDisabled(deleteBtn)).toBe(true)

    // Resetting your own password is intentionally NOT self-guarded.
    const resetBtn = findButtonByAriaLabel(markup, managerDe.users.resetPassword)
    expect(resetBtn, "reset-password button (self)").toBeDefined()
    expect(isDisabled(resetBtn)).toBe(false)
  })

  it("does not disable copy, deactivate or delete for someone else's row", async () => {
    const other = makeUser({ id: 2, username: "bob", active: true })
    const markup = await renderWithI18n(
      <UserManagementRow
        user={other}
        isSelected={false}
        onToggleSelect={noop}
        isPending={false}
        busy={false}
        currentUsername="alice"
        onToggleActive={noop}
        onCopyUser={noop}
        onOpenResetPassword={noop}
        onOpenDelete={noop}
      />,
    )

    const copyBtn = findButtonByAriaLabel(markup, managerDe.users.copyUser)
    expect(copyBtn, "copy button (other)").toBeDefined()
    expect(isDisabled(copyBtn)).toBe(false)

    const toggleBtn = findButtonByAriaLabel(markup, managerDe.users.disable)
    expect(toggleBtn, "deactivate button (other)").toBeDefined()
    expect(isDisabled(toggleBtn)).toBe(false)

    const deleteBtn = findButtonByAriaLabel(markup, managerDe.users.delete)
    expect(deleteBtn, "delete button (other)").toBeDefined()
    expect(isDisabled(deleteBtn)).toBe(false)
  })
})

describe("UserManagementRow — busy gating (issue 499)", () => {
  it("disables all mutating row actions while busy=true", async () => {
    const user = makeUser({ id: 9, username: "frank", active: true })
    const markup = await renderWithI18n(
      <UserManagementRow
        user={user}
        isSelected={false}
        onToggleSelect={noop}
        isPending={false}
        busy
        currentUsername={null}
        onToggleActive={noop}
        onCopyUser={noop}
        onOpenResetPassword={noop}
        onOpenDelete={noop}
      />,
    )

    for (const label of [
      managerDe.users.copyUser,
      managerDe.users.resetPassword,
      managerDe.users.disable,
      managerDe.users.delete,
    ]) {
      const btn = findButtonByAriaLabel(markup, label)
      expect(btn, `button "${label}"`).toBeDefined()
      expect(isDisabled(btn)).toBe(true)
    }
  })
})

describe("UserManagementRow — inline actions (issue 499)", () => {
  it("renders actions as inline icon-buttons, not only inside the (closed) overflow menu", async () => {
    const user = makeUser({ id: 5, username: "erin", active: true })
    const markup = await renderWithI18n(
      <UserManagementRow
        user={user}
        isSelected={false}
        onToggleSelect={noop}
        isPending={false}
        busy={false}
        currentUsername={null}
        onToggleActive={noop}
        onCopyUser={noop}
        onOpenResetPassword={noop}
        onOpenDelete={noop}
      />,
    )

    // OverflowMenu is collapsed by default and renders no `role="menuitem"`
    // buttons at all until opened — so any action button found below can
    // only come from ListRow's inline action cluster.
    expect(markup).not.toContain('role="menuitem"')
    expect(findButtonByAriaLabel(markup, managerDe.users.copyUser)).toBeDefined()
    expect(findButtonByAriaLabel(markup, managerDe.users.resetPassword)).toBeDefined()
    expect(findButtonByAriaLabel(markup, managerDe.users.disable)).toBeDefined()
    expect(findButtonByAriaLabel(markup, managerDe.users.delete)).toBeDefined()
  })
})
