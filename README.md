# nbb-autobuy-bot
This Bot adds a product of your choice to your basket and checks out automatically via Amazon Pay.

## Installation
1. Install NodeJS
2. `git clone https://github.com/spyfly/nbb-autobuy-bot.git`
3. `npm i`

## Usage
1. Create a configuration file for each account, check [example.json](configs/example.json) for more details.
2. `node bot.js`
3. Call `localhost:3000/run/{id}` to run the checkout_job when required.
