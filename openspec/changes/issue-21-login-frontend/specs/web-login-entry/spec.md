# Web Login Entry Specification

## Purpose

Define the public web root login experience for Faena360 without adding post-login navigation or protected web destinations in this change.

## Requirements

### Requirement: Root login entry presents an accessible Spanish form

The system MUST expose the web root (`/`) as a public login entry with labeled email and password controls, a submit action, and Spanish metadata and document language aligned with the visible UI.

#### Scenario: User opens the public start page
- GIVEN an unauthenticated user visits `/`
- WHEN the page renders
- THEN the user can identify a login form with labeled email and password inputs and a submit button

#### Scenario: Spanish page metadata stays aligned
- GIVEN the login entry uses Spanish UI copy
- WHEN the document metadata and root language are evaluated
- THEN the page title, description, and document language are Spanish-aligned

### Requirement: Login entry includes the approved animated visual panel

The system MUST present the login surface as a split login card with the form on one side and a blue visual section using the shadcn React Bits `Ferrofluid` component installed via `pnpm dlx shadcn@latest add @react-bits/Ferrofluid-JS-CSS`. The Ferrofluid section MUST use the approved blue/cyan/ice palette, mouse interaction where supported, and a reduced-motion fallback that avoids continuous liquid motion for users who prefer reduced motion.

#### Scenario: User opens the split login card
- GIVEN an unauthenticated user visits `/`
- WHEN the page renders on a viewport that supports the split layout
- THEN the user sees the login form paired with a blue visual section containing the Ferrofluid liquid-glass motion

#### Scenario: Reduced motion preference is respected
- GIVEN the user has `prefers-reduced-motion: reduce` enabled
- WHEN the login page renders
- THEN the visual section does not require continuous ferrofluid motion to understand or use the login form

### Requirement: Login form validates and submits credentials to the existing auth API

The system MUST submit the login form to the existing `POST /api/auth/login` endpoint using the email trimmed for leading and trailing whitespace and the password exactly as entered. The system MUST prevent submission when either field is empty and MUST show user-facing feedback inline.

#### Scenario: Credentials are normalized before submission
- GIVEN a user enters an email with surrounding spaces and a password
- WHEN the form is submitted
- THEN the request sent to `POST /api/auth/login` contains the trimmed email and the original password

#### Scenario: Empty credentials are blocked in the client
- GIVEN the email or password field is empty
- WHEN the user submits the form
- THEN the client does not send the auth request and shows inline feedback explaining both fields are required

### Requirement: Known auth failures show Spanish inline feedback

The system MUST translate the known backend auth failure codes `invalid_credentials`, `missing_tenant`, `inactive_tenant`, `inactive_user`, and `web_access_denied` into user-facing Spanish messages displayed inline on the login page.

#### Scenario: Backend returns a known auth failure
- GIVEN the login request completes with a known failure code from `/api/auth/login`
- WHEN the page handles the response
- THEN the page renders the mapped Spanish message inline without leaving `/`

#### Scenario: Failure feedback replaces prior success state
- GIVEN the page previously showed a success confirmation
- WHEN a later login attempt fails
- THEN the success confirmation is cleared and only the current inline failure feedback remains visible

### Requirement: Successful login confirms in place without navigation

The system MUST show a visible inline success confirmation when `/api/auth/login` succeeds and MUST NOT redirect, push navigation, or introduce a protected dashboard or other authenticated destination as part of this change.

#### Scenario: Login succeeds on the root page
- GIVEN valid credentials for a web-enabled user
- WHEN `/api/auth/login` returns success
- THEN the page shows inline confirmation that the session started successfully

#### Scenario: Navigation remains out of scope
- GIVEN the login flow completes successfully
- WHEN the frontend finishes handling the response
- THEN the user remains on the same page and no new protected route or dashboard is introduced by this capability

### Requirement: Inline feedback space remains reserved

The system MUST reserve vertical space for inline validation, error, and success feedback so messages do not shift the form layout when they appear or are replaced.

#### Scenario: Feedback appears without layout shift
- GIVEN the login form has no current feedback message
- WHEN validation, backend error, or success feedback appears inline
- THEN the reserved feedback region contains the message without moving the surrounding form controls or submit action
