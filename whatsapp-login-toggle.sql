-- WhatsApp login verification is opt-in. General WhatsApp verification can
-- remain configured separately, but login must not be blocked by a missing
-- WhatsApp/Twilio delivery setup.
INSERT INTO public.app_settings (key, value)
VALUES ('whatsapp_login_verification_enabled', 'false')
ON CONFLICT (key) DO NOTHING;