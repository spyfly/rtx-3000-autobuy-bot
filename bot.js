const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser')
const app = express();
const shops = {
    nbb: require('./shops/nbb.js')
}
var users = {}

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
        const data = JSON.parse(raw);
        users[user] = data;
    }

    app.use(bodyParser.json())

    app.get('/run/:job_id', async (req, res) => {
        res.send(JSON.stringify({
            message: message,
            success: success
        }))
    });

    app.post('/trigger', function (req, res) {
        const json = req.body;
        executeJobs(json, res);
        res.send("");
    })

    async function executeJobs(json) {
        for (const [user, config] of Object.entries(users)) {
            const shop = json.shop;
            const deal = json.deal;
            if (config.shops[shop]) {
                var match = false;
                for (const [card, price_limit] of Object.entries(config.price_limits)) {
                    if (deal.title.toLowerCase().includes(card)) {
                        match = true;
                        console.log('"' + deal.title + '" matched card: ' + card)
                        if (deal.price <= price_limit) {
                            console.log(deal.price + " matched price_limit of " + price_limit)
                            console.log("Executing AutoBuy for " + shop + " for " + user);
                            shops[shop](config, deal);
                        } else {
                            console.log(deal.price + " didn't meet price_limit of " + price_limit)
                        }
                        break;
                    }
                }
                if (!match)
                    console.log('"' + deal.title + '" didn\'t match any listed card!')
            } else {
                console.log("Store not found");
            }
        }
    }

    var port = 3000;
    app.listen(port, () => {
        console.log(`RTX 3000 AutoBuy Bot listening at http://localhost:${port}`)
    })
});