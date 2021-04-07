const { chromium } = require('playwright');
const Logger = require("../libs/logger.js")
const visaLbb = require("../payment_gateways/visa_lbb.js")

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

    const context = await chromium.launchPersistentContext('/tmp/rtx-3000-autobuy-bot/' + config.user + "/", browser_options);
    const page = await context.newPage();
    const videoPath = await page.video().path();
    logger.info("Finished Setup!");

    try {
        logger.info("Loading Ceconomy Page!")
        await page.goto(deal.href, { waitUntil: 'networkidle' });
        const productId = deal.href.match(/[0-9]{7}/)[0];

        //Handle Cookies
        page.waitForSelector('#privacy-layer-accept-all-button', { timeout: 0 }).then(async () => {
            console.log("Clicked away cookies!");
            page.click('#privacy-layer-accept-all-button');
        })

        const pageText = await page.textContent('#root');
        if (pageText.includes("Dieser Artikel ist aktuell nicht verfügbar.")) {
            console.log("Item currently unavailable, adding to wishlist!");
            const wishlistBtn = await page.waitForSelector('#pdp-single-wishlist-button');
            const wishlistBtnText = await wishlistBtn.textContent();
            console.log(wishlistBtnText);
            if (wishlistBtnText == "Zum Merkzettel hinzufügen") {
                await wishlistBtn.click();

                const notificationBox = await page.waitForSelector('[data-test="notification-box"]');
                const notification = await notificationBox.textContent();
                if (notification.includes("Erfolgreich auf meinen Merkzettel hinzugefügt!")) {
                    console.log("Added to Wishlist successfully!")
                } else {
                    console.log("Failed adding to wishlist");
                }
            } else {
                console.log("Already on our Wishlist!");
            }
        } else if (pageText.includes("Lieferung ")) {
            console.log("Adding to cart!")
            await page.click('#pdp-add-to-cart-button');
            await page.waitForSelector('[data-test="pdp-minibasket-headline-success"]');
            console.log("Added to cart successfully, going to cart now!");
            const cartUrl = await page.evaluate(() => "https://" + location.host + "/checkout");
            page.goto(cartUrl);
        }

        //Handle Login
        page.waitForSelector('[data-test="myaccount-login-form"]', { timeout: 0 }).then(async (loginForm) => {
            logger.info("Performing login!")
            await page.fill('[data-test="email"]', config.shops.ceconomy.email)
            await page.fill('[data-test="password"]', config.shops.ceconomy.password)
            await page.click('#mms-login-form__login-button')
            logger.info("Login completed!");
        })

        var cartReloads = 0;
        while (cartReloads < 5) {
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

        //Select credit card payment
        if (page.url().split(".de/")[1] == "checkout/payment") {
            logger.info("Reached payment page!");
            //Clicking Credit Card as Payment Method
            await page.click('[data-test="payment-selection-CRECA"]');
            logger.info("Selected credit card as payment method");
            await page.click('[data-test="basket-resume-wrapper"] [data-test="checkout-continue-desktop-enabled"]');
            logger.info("Checking out!");
        }

        await page.waitForSelector('[data-test="basket-resume-wrapper"] [data-test="checkout-continue-desktop-enabled"]', { state: 'attached' });
        if (page.url().split(".de/")[1] == "checkout/summary") {
            logger.info("Reached summary page!");
            //Clicking Checkout and Pay
            await page.click('[data-test="basket-resume-wrapper"] [data-test="checkout-continue-desktop-enabled"] button');
            await page.waitForNavigation();
            logger.info("Checking out!");
        }

        if (page.url() == "https://www.computop-paygate.com/payssl.aspx") {
            logger.info("Reached payment gateway, please store Credit Card Data first!")
            //Filling in Credit Card Details
            await page.fill('#MMSKKNr', config.payment_gateways.lbb_visa.number);
            await page.fill('#MMSExpiry', config.payment_gateways.lbb_visa.expiry_month + "/" + config.payment_gateways.lbb_visa.expiry_year)
            await page.fill('#MMSCCCVC', config.payment_gateways.lbb_visa.cvc);
            await page.fill('#MMScreditCardHolder', config.payment_gateways.lbb_visa.card_holder);
            if (config.shops.ceconomy.checkout) {
                await page.click('#submitButton');

                await page.waitForNavigation();
                console.log("Reached Visa Checkout Page");

                visaLbb.handle3DSecure(config, page, context, false);

                console.log("Checkout complete!");
                await page.waitForNavigation({ timeout: 180000 });
            }
        }

        //Allow for the page to be recorded
        await page.waitForTimeout(10000);
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