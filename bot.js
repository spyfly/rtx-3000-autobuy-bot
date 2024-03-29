const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const TelegramBot = require('node-telegram-bot-api');
const app = express();
const shops = {
    nbb: require('./shops/nbb.js'),
    asus: require('./shops/asus.js'),
    ceconomy: require('./shops/ceconomy.js'),
    alternate: require('./shops/alternate.js')
}
const messagesWeb = require('./modules/messages_web.js');
const e = require('express');
var users = {}
var telegram = null;

fs.readdir('configs/', function (err, files) {
    if (err) {
        console.error("Could not list the directory.", err);
        process.exit(1);
    }

    for (const file of files) {
        // Make one pass and make the file complete
        const raw = fs.readFileSync("configs/" + file, 'utf8');
        const user = file.replace(".json", "");
        if (user == "example")
            continue;
        var data = JSON.parse(raw);
        if (data.general.enabled == false)
            continue;

        data.user = user;
        users[user] = data;
        if (telegram == null)
            telegram = new TelegramBot(data.telegram.token, { polling: true });
        handleTelegramMessages(telegram, data);
    }

    app.use(bodyParser.json())

    app.post('/trigger', function (req, res) {
        const json = req.body;
        executeJobs(json, res);
        res.send("");
    })

    async function executeJobs(json) {
        console.log(JSON.stringify(json));

        for (const [user, config] of Object.entries(users)) {
            const shop = json.shop;
            const deal = json.deal;
            if (config.shops[shop]) {
                var match = false;
                for (const [card, price_limit] of Object.entries(config.price_limits).reverse()) {
                    if (deal.title.toLowerCase().includes(card) || deal.title.toLowerCase().includes(card.replace(' ', ''))) {
                        match = true;
                        console.log('"' + deal.title + '" matched card: ' + card)
                        if (deal.price <= price_limit) {
                            console.log(deal.price + " matched price_limit of " + price_limit)
                            console.log("Executing AutoBuy for " + shop + " for " + user);
                            executeAutoBuy(shop, config, deal, telegram);
                        } else {
                            console.log(deal.price + " didn't meet price_limit of " + price_limit)
                        }
                        break;
                    }
                }
                if (!match)
                    console.log('"' + deal.title + '" didn\'t match any listed card!')
            } else {
                console.log("Store not found in config");
            }
        }
    }

    var port = 3000;
    app.listen(port, () => {
        console.log(`RTX 3000 AutoBuy Bot listening at http://localhost:${port}`)
    })
});

async function handleTelegramMessages(telegramBot, data) {
    telegramBot.on('message', (msg) => {
        const chatId = msg.chat.id;
        console.log(data.telegram.chat_id);
        if (chatId == data.telegram.chat_id) {
            // send a message to the chat acknowledging receipt of their message
            if (msg.text == "/smssetup") {
                try {
                    messagesWeb.authenticate(data, telegramBot);
                } catch (err) {

                }
            } else if (msg.text == "/nbbwarmup") {
                try {
                    shops.nbb(data, null, true).then((result) => {
                        console.log(result);
                        if (!result.success) {
                            telegram.sendVideo(data.telegram.chat_id, result.videoPath, {
                                caption: "WarmUp failed for " + data.user + "!"
                            })
                        }
                    });
                } catch (err) {
                    console.log(err)
                }
            }
        } else {
            console.log("Received Message from unknown chat_id: " + chatId)
        }
    });
}

async function executeAutoBuy(shop, config, deal, telegram, retry = 0) {
    //var shop, config, deal, retry;
    if (retry < 10) {
        if (retry != 0)
            console.log("Retry " + retry + " for " + deal.title);
        shops[shop](config, deal).then((result) => {
            if (result.success) {
                console.log("Successful Purchase!")
                if (result.videoPath != null)
                    telegram.sendVideo(config.telegram.chat_id, result.videoPath, {
                        caption: "Successfully purchased " + deal.title + " for " + deal.price + "€ at " + deal.href + ((retry != 0) ? ' after ' + retry + ' retries.' : '')
                    })
                telegram.sendDocument(config.telegram.chat_id, result.logFilePath, {
                    caption: deal.title + ((retry != 0) ? ' | Try: ' + retry : '')
                });
                console.log(result)
            } else {
                console.log(result);
                console.log("Purchase Failure for " + deal.title)
                telegram.sendVideo(config.telegram.chat_id, result.videoPath, {
                    caption: "Purchase Failure " + deal.title + " for " + deal.price + "€" + ((retry != 0) ? ' after ' + retry + ' retries.' : '')
                })
                telegram.sendDocument(config.telegram.chat_id, result.logFilePath, {
                    caption: deal.title + ((retry != 0) ? ' | Try: ' + retry : '')
                });
                executeAutoBuy(shop, config, deal, telegram, ++retry)
            }
        });
    } else {
        console.log("Maximum Retries reached!");
    }
}