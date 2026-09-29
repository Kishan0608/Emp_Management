-- Disable email test mode now that real email verification is in place.
-- All OTP verification codes will be delivered directly to the user's email address via SMTP.
update public.app_settings set email_test_mode = false where id = 1;
