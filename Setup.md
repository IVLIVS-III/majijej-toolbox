# Setup instructions

## Overview

1. Register a webhook on Patreon

2. Transfer credentials to Firebase

3. Create a StreamElements alert

4. Integrate the StreamElements alert with streaming software (OBS / Streamlabs / …)

## Register a webhook on Patreon

- [ ] create a shared secret
  
  This may be any sequence of characters (upper and lower case), numbers, as well as "`-`" and "`_`". I would suggest the secret to be at least 16 characteres long. It should not be longer then 64 characters.
  
  The secret is used to validate, that patreon alerts are invoked by the official Patreon server.

- [ ] navigate to the [webhooks page](https://www.patreon.com/portal/registration/register-webhooks) on Patreon

- [ ] create a new webhook for the `pledge:create` event pointing to:
  
  `https://us-central1-majijej-toolbox.cloudfunctions.net/patreonWebhook`
  
  This URL will receive notifications from Patreon.

- [ ] register the secret with the newly created webhook

## Transfer credentials to Firebase

- [ ] transfer Patreon webhook secret via:
  
  `firebase functions:secrets:set PATREON_WEBHOOK_SECRET`

- [ ] transfer StreamElements account id via:
  
  `firebase functions:secrets:set SE_ACCOUNT_ID`
  
  The account id will be used to determine the channel on which the alert should be played. You can find your account id [here](https://streamelements.com/dashboard/account/channels).

- [ ] transfer StreamElements JWT Token via:
  
  `firebase functions:secrets:set SE_AUTH_TOKEN`
  
  **The auth token is the most sensitive secret used here.** It is called "JWT Token" on the StreamElements [dashboard](https://streamelements.com/dashboard/account/channels) and can be revealed by toggeling the "Show secrets" switch.
  
  With this token the StreamElements API can be called. This enables a lot of features comparable to an editor role + chatstats and tipping.
  
  However, this integration will only use the JWT Token to send "kv-store" updates to StreamElements. This does not change any configuration and is necessary to invoke the custom alert for a new Patreon.

## Create a StreamElements alert

- [ ] create a new (blank) overlay

- [ ] add widget > "static / custom" > "custom widget"

- [ ] "open editor"
  
  The files needed for the following steps can be found at [https://github.com/IVLIVS-III/majijej-toolbox/tree/main/se-widget/patreon](https://github.com/IVLIVS-III/majijej-toolbox/tree/main/se-widget/patreon)
  
  - [ ] replace "HTML" tab with the content of `widget.html`
  
  - [ ] replace "CSS" tab with the content of `widget.css`
  
  - [ ] replace "JS" tab with the content of `widget.js`
  
  - [ ] replace "FIELDS" tab with the content of `widget.json`
  
  - [ ] leave "DATA" tab as-is
  
  - [ ] click "done"

- [ ] customize the fields on the left
  
  Use `<FIRTSNAME>` anywhere in the message to be replaced by the first name of the new Patreon supporter.
  
  You can enable "debug mode" (the bottom most field) to always display the alert image/message and test-trigger the alert-sound by every event via the "Emulate"-button. You can then use any event (e.g. "Follower event") to trigger the patreon alert as a test.

- [ ] save the overlay

## Integrate the StreamElements alert with streaming software

As per usual, via creating a link and importing as a browser source.
