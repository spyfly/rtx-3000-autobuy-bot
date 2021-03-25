const { chromium } = require('playwright');
const Logger = require("../libs/logger.js")

async function autoBuy(config, deal) {
    const logger = new Logger(config.user, 'ceconomy');

    var success = true;
    var browser_options = {
        recordVideo: {
            dir: '/tmp/videos/rtx-3000-autobuy-bot'
        },
        headless: !config.general.debug,
        extraHTTPHeaders: {
            DNT: "1"
        }
    };

    if (config.general.userAgent) {
        browser_options.userAgent = config.general.userAgent;
    }

    if (config.general.proxy) {
        browser_options.proxy = { server: config.general.proxy };
    }

    const context = await chromium.launchPersistentContext('/tmp/rtx-3000-autobuy-bot/' + config.user + "/", browser_options); const page = await context.newPage();
    const videoPath = await page.video().path();
    logger.info("Finished Setup!");

    try {
        logger.info("Loading Ceconomy Page!")
        await page.goto(deal.href);
        const productId = deal.href.match(/[0-9]{7}/)[0];
        var checkInterval = 2;
        var reload = true;
        while (reload) {
            const [status, json] = await page.evaluate(async (pId) => {
                const res = await fetch("https://" + location.host + "/api/v1/graphql", { "headers": { "apollographql-client-name": "pwa-client", "apollographql-client-version": "7.0.1", "content-type": "application/json", }, "body": "{\"operationName\":\"AddProduct\",\"variables\":{\"items\":[{\"productId\":\"" + pId + "\",\"outletId\":null,\"quantity\":1,\"serviceId\":null,\"warrantyId\":null}]},\"extensions\":{\"pwa\":{\"salesLine\":\"" + (location.host === 'www.saturn.de' ? 'Saturn' : 'Media') + "\",\"country\":\"" + "DE" + "\",\"language\":\"de\"},\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"404e7401c3363865cc3d92d5c5454ef7d382128c014c75f5fc39ed7ce549e2b9\"}}}", "method": "POST", "mode": "cors", "credentials": "include" });
                return [res.status, await res.json()];
            }, productId);

            if (status == 200) {
                if (json.errors) {
                    logger.info("Failed to add item to cart, trying again:")
                    logger.info(json.errors);
                    if (json.errors[0].extensions.title == "BASKET_ITEM_MAX_QUANTITY") {
                        //Redirect to checkout
                        logger.info("Going to cart!")
                        await page.evaluate(() => window.location = "https://" + location.host + "/checkout");
                        reload = false;
                    } else if (json.errors[0].message.includes("'Not all items have onlineStatus: ")) {
                        //Mark as sold out
                        logger.info("Sold out!")
                        reload = false;
                    } else if (json.errors[0].message.includes("'Not all items are available: ")) {
                        //Tell the user the script is doing its job
                        logger.info("Just checked!")
                    } else {
                        logger.info("Unknown Error: " + json.errors[0].message);
                    }
                } else {
                    logger.info("Going to cart!")
                    await page.evaluate(() => window.location = "https://" + location.host + "/checkout");
                    reload = false;
                }
            } else if (status == 429) {
                //Reduce checking interval and sleep some extra time
                logger.info("Rate limited, increasing check interval to " + ++checkInterval + " seconds");
                await page.waitForTimeout(10000 * checkInterval);
            }
            await page.waitForTimeout(1000 * checkInterval);
        }

        logger.info(page.url())
        if (page.url().split(".de/")[1] == "checkout") {
            var cartReloads = 0;
            while (cartReloads < 250) {
                logger.info("Reached cart")
                await page.waitForSelector("[data-test=checkout-total]")
                logger.info("Cart finished loading")
                const disabledCheckout = await page.$("[data-test=checkout-continue-desktop-disabled]");
                if (!disabledCheckout) {
                    logger.info("Found no disabled checkout button, checking out!")
                    await page.click("[data-test=checkout-continue-desktop-enabled]");
                    cartReloads = 1000;
                } else {
                    logger.info("Reload cart again, can't check out yet!")
                    cartReloads++;
                    await page.waitForTimeout(1000 * checkInterval);
                    await page.reload();
                }
            }
        }

        //Allow for the page to be recorded
        await page.waitForTimeout(1000);
    } catch (err) {
        logger.info(err.stack);
        success = false;
    }

    await context.close();
    return {
        success: success,
        videoPath: videoPath,
        logFilePath: logger.getLogFile()
    }
}
module.exports = autoBuy;