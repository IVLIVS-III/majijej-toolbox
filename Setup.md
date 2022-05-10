# Setup instructions

This setup should hopefully only take 5-10 minutes.

## Overview

1. Deploy a server instance to Heroku

2. Register a webhook on Patreon

3. Create a StreamElements alert

4. Integrate the StreamElements alert with streaming software (OBS / Streamlabs / …)

## Deploy a server instance to Heroku

- [ ] [sign-up to Heroku](https://signup.heroku.com/) to create a free account
  
  Heroku will host your server instance and is not affiliated with me.

- [ ] click [Deploy to Heroku](https://heroku.com/deploy?template=https://github.com/IVLIVS-III/majijej-toolbox/tree/main) to create your own server instance in less than 3 minutes
  
  - [ ] leave "app-name" empty
  
  - [ ] choose your region (I suggest Europe) 
  
  - [ ] fill in `SE_ACCOUNT_ID` with your StreamElements account id
    
    The account id will be used to determine the channel on which the alert should be played. You can find your account id [here](https://streamelements.com/dashboard/account/channels).
  
  - [ ] fill in `SE_AUTH_TOKEN` with your StreamElements JWT Token
    
    Navigate to the StreamElements [dashboard](https://streamelements.com/dashboard/account/channels) where it can be revealed by toggeling the "Show secrets" switch.
    
    This token is required to send alerts to StreamElements.
  
  - [ ] click "Deploy app"

## Register a webhook on Patreon

- [ ] get the app-name of the Heroku server-instance
  
  This will be displayed on your [Heroku dashboard](https://heroku.com) and looks something like "enigmatic-basin-23134"

- [ ] get the shared secret created by Heroku
  
  1. click on your newly created app on the [Heroku dashboard](https://heroku.com)
  2. navigate to "Settings"
  3. click "Reveal Config Vars"
  4. copy the value associated with `PATREON_WEBHOOK_SECRET`

- [ ] navigate to the [webhooks page](https://www.patreon.com/portal/registration/register-webhooks) on Patreon

- [ ] create a new webhook for the `pledge:create` event pointing to:
  
  `https://<heroku-app-name>.herokuapp.com/patreonWebhook` but replace `<heroku-app-name>` with the app-name of your Heroku app
  
  This URL will receive notifications from Patreon.

- [ ] register the secret (i.e. the `PATREON_WEBHOOK_SECRET`) with the newly created webhook

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
  
  Use `<FIRSTNAME>` anywhere in the message to be replaced by the first name of the new Patreon supporter.
  
  You can enable "debug mode" (the bottom most field) to always display the alert image/message and test-trigger the alert-sound by every event via the "Emulate"-button. You can then use any event (e.g. "Follower event") to trigger the patreon alert as a test.

- [ ] save the overlay

## Integrate the StreamElements alert with streaming software

As per usual, via creating a link and importing as a browser source.
