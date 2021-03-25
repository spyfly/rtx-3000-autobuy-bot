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
        var goToCart = false;
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
                        logger.info("Reached max quantity, going to cart!")
                        goToCart = true;
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
                    //Go to cart
                    goToCart = true;
                    reload = false;
                }
            } else if (status == 429) {
                //Reduce checking interval and sleep some extra time
                logger.info("Rate limited, increasing check interval to " + ++checkInterval + " seconds");
                await page.waitForTimeout(10000 * checkInterval);
            }
            await page.waitForTimeout(1000 * checkInterval);
        }

        if (goToCart) {
            logger.info("Going to cart!")
            const cartUrl = await page.evaluate(() => "https://" + location.host + "/checkout");
            await page.goto(cartUrl, { waitUntil: 'domcontentloaded' })

            var cartReloads = 0;
            while (cartReloads < 250) {
                logger.info("Reached cart")

                //Wait for Cart to load
                const request = await page.waitForRequest(request => request.url().includes("/api/v1/graphql?operationName=GetBasket"));
                const response = await request.response();
                const json = await response.json();
                const products = json.data.basket.content.checkout.mms.lineItems;
                if (products.length == 0) {
                    console.log("Cart is empty!!!");
                }
                for (const product of products) {
                    if (product.productId != productId) {
                        logger.info("Removing unwanted product in basket: " + product.fallbackTitle)
                        const [status, json] = await page.evaluate(async (cartId) => {
                            const res = await fetch("https://www.mediamarkt.de/api/v1/graphql", {
                                "credentials": "include",
                                "headers": {
                                    "content-type": "application/json",
                                    "apollographql-client-name": "pwa-client",
                                    "apollographql-client-version": "7.1.2",
                                },
                                "body": "{\"operationName\":\"CancelLineItem\",\"variables\":{\"itemId\":\"" + cartId + "\",\"productType\":\"MMS\"},\"extensions\":{\"pwa\":{\"salesLine\":\"" + (location.host === 'www.saturn.de' ? 'Saturn' : 'Media') + "\",\"country\":\"DE\",\"language\":\"de\"},\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"a988adea36d1fde4549a482351f3b24b58b0ab42471677f485750c46fd8ddc40\"}}}",
                                "method": "POST",
                                "mode": "cors"
                            });
                            return [res.status, await res.json()];
                        }, product.id);
                    }
                }

                await page.waitForSelector("[data-test=checkout-total]")
                logger.info("Cart finished loading")
                const disabledCheckout = await page.$("[data-test=checkout-continue-desktop-disabled]");
                if (!disabledCheckout) {
                    logger.info("Found no disabled checkout button, checking out!")
                    await page.click("[data-test=checkout-continue-desktop-enabled]");
                    await page.waitForNavigation();
                    cartReloads = 1000;
                } else {
                    logger.info("Reload cart again, can't check out yet!")
                    cartReloads++;
                    await page.waitForTimeout(1000 * checkInterval);
                    await page.reload({ waitUntil: 'domcontentloaded' });
                }
            }
        }

        logger.info(page.url())
        //Perform login procedure
        if (page.url().split(".de/")[1] == "checkout/login") {
            logger.info("Performing login!")
            await page.fill('[data-test="email"]', config.shops.ceconomy.email)
            await page.fill('[data-test="password"]', config.shops.ceconomy.password)
            await page.click('#mms-login-form__login-button')
            await page.waitForNavigation();
            logger.info("Login completed!");
        }

        //Select credit card payment
        if (page.url().split(".de/")[1] == "checkout/payment") {
            logger.info("Reached payment page!");
            //Clicking Credit Card as Payment Method
            await page.click('[data-test="payment-selection-CRECA"]');
            logger.info("Selected credit card as payment method");
            await page.click('[data-test="checkout-continue-desktop-enabled"]');
            logger.info("Checking out!");
        }

        //Select credit card payment
        if (page.url().split(".de/")[1] == "checkout/summary") {
            logger.info("Reached summary page!");
            //Delete invisible checkout btn
            await page.waitForSelector('[data-test="checkout-continue-desktop-enabled"]', { state: 'attached' });
            await page.evaluate(() => document.querySelector('[data-test="checkout-continue-desktop-enabled"]').outerHTML = "");
            //Clicking Checkout and Pay
            await page.click('[data-test="checkout-continue-desktop-enabled"] button');
            await page.waitForNavigation();
            logger.info("Checking out!");
        }

        if (page.url() == "https://www.computop-paygate.com/payssl.aspx") {
            logger.info("Reached payment gateway, please store Credit Card Data first!")
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