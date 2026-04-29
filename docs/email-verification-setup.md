# Email Verification Setup

## Overview

The app now requires email verification for new user registrations. Users must verify their email address before they can fully use the app.

## Supabase Configuration

To enable email verification, you need to configure it in your Supabase Dashboard:

### 1. Enable Email Verification

1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Navigate to **Authentication** → **Providers** → **Email**
4. Enable **"Confirm email"** option
5. Save the changes

### 2. Configure Email Templates (Optional)

1. Go to **Authentication** → **Email Templates**
2. Customize the **"Confirm signup"** template if needed
3. The default template includes a verification link

### 3. Email Redirect URL (Optional)

For mobile apps, you can configure a custom redirect URL:
- Go to **Authentication** → **URL Configuration**
- Set **Site URL** to your app's deep link scheme (e.g., `memq://`)
- Or leave it as default for web-based verification

## How It Works

### Registration Flow

1. User signs up with email and password
2. Supabase sends a verification email automatically
3. User receives email with verification link
4. User clicks the link to verify their email
5. User can then sign in normally

### Login Flow

1. If user tries to sign in with unverified email:
   - They will see a message prompting them to verify
   - Option to resend verification email
2. If email is verified:
   - Normal login proceeds

## Code Changes

### Sign Up (`app/signup.tsx`)

- Modified to check if email verification is required
- Shows appropriate message based on verification status
- Handles both verified and unverified signups

### Sign In (`app/login.tsx`)

- Checks if email is verified before allowing login
- Provides option to resend verification email if needed
- Shows helpful error messages

## Testing

### Test Email Verification

1. Sign up with a new email address
2. Check your email inbox for verification email
3. Click the verification link
4. Try to sign in - should work normally

### Test Unverified Login

1. Sign up but don't verify email
2. Try to sign in
3. Should see message prompting verification
4. Use "Resend Verification Email" option

## Notes

- OAuth providers (Google, Apple) automatically verify emails
- Email verification is only required for email/password signups
- Users can resend verification emails from the login screen

