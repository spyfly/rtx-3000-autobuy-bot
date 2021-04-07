const { chromium } = require('playwright');
const { exitOnError } = require('winston');
const Logger = require("../libs/logger.js")
const visaLbb = require("../payment_gateways/visa_lbb.js")

async function clickAwayCookies(page, logger, retry = 0) {
    if (retry < 3) {
        logger.info("Clicking away cookies banner | Try: " + ++retry);
        page.click('#privacy-layer-accept-all-button', { timeout: 0 }).then(() => {
            logger.info("Clicked away cookies!");
        }, () => {
            clickAwayCookies(page, logger, retry);
        });
    } else {
        logger.info("Failed clicking away cookies!");
    }
}

async function waitForProductToBecomeAvailable(page, productId) {
    await page.click('[data-test="myaccount-dropdown-desktop"]:visible');
    await page.click('[href="/de/myaccount/wishlist"]:visible');
    const response = await page.evaluate(async (productId) => (async function () {
        var timeExpired = false;
        // Only check for an hour!
        setTimeout(function () {
            timeExpired = true;
        }, 60 * 60 * 1000)

        const graphQlVersion = document.querySelector('[name="version"]').getAttribute("content");
        const storeName = (location.host === 'www.saturn.de' ? 'Saturn' : 'Media');
        var reload = true;
        var checkInterval = 2;

        reload = true;
        while (reload) {
            if (timeExpired) {
                return "timeExpired";
            }

            const wishlistItems = (await (await getWishlist()).json()).data.wishlistItems.items;
            const infoBox = document.querySelector('[data-test="mms-breadcrumb-v2-ul"]');
            if (infoBox) {
                const currTime = new Date().toLocaleString().split(", ")[1];
                infoBox.innerHTML = "<b style='color: green; font-size: 24px;'>Zuletzt überprüft: " + currTime + "</b>";
            }
            console.log(wishlistItems);
            for (const wishlistItem of wishlistItems) {
                const product = wishlistItem.product;
                console.log(product.title + ": " + product.onlineStatus);
                if (product.id === productId) {
                    if (product.onlineStatus) {
                        await handleAddingItemToCart(product.id);
                        return "https://" + location.host + "/checkout";
                    }
                }
            }
            await sleep(1000 * checkInterval);
        }

        async function handleAddingItemToCart(productId) {
            var i = 0;
            while (i < 5) {
                const response = await addToCart(productId);
                if (response.status == 200) {
                    const json = await response.json();
                    if (json.errors) {
                        console.log("Failed to add item to cart, trying again:")
                        console.log(json.errors);
                        if (json.errors[0].extensions.title == "BASKET_ITEM_MAX_QUANTITY") {
                            //Redirect to checkout
                            return "https://" + location.host + "/checkout";
                        } else if (json.errors[0].message.includes("'Not all items are available: ") || json.errors[0].message.includes("'Not all items have onlineStatus: ")) {
                            console.log("Item not available yet!");
                        } else {
                            alert("Unknown Error occured adding item to cart!");
                        }
                    } else {
                        return "https://" + location.host + "/checkout";
                    }
                } else if (response.status == 429) {
                    //Reduce checking interval and sleep some extra time
                    alert("Failed adding item to cart, got rate limited!");
                    await sleep(1000 * checkInterval);
                }
                i++;
            }
        }

        async function getWishlist() {
            return fetch("https://" + location.host + "/api/v1/graphql?operationName=WishlistItems&variables=%7B%22hasMarketplace%22%3Atrue%2C%22shouldFetchBasket%22%3Atrue%2C%22outletId%22%3A%22480%22%2C%22limit%22%3A12%7D&extensions=%7B%22pwa%22%3A%7B%22salesLine%22%3A%22" + storeName + "%22%2C%22country%22%3A%22DE%22%2C%22language%22%3A%22de%22%7D%2C%22persistedQuery%22%3A%7B%22version%22%3A1%2C%22sha256Hash%22%3A%224eb66e4fb5737b639df85ed89a2ce894d598071cbfbb4d4b20fcf99f6d1c3f40%22%7D%7D", {
                "credentials": "include",
                "headers": {
                    "content-type": "application/json",
                    "apollographql-client-name": "pwa-client",
                    "apollographql-client-version": graphQlVersion,
                    "x-operation": "WishlistItems",
                    "x-cacheable": "false",
                    "X-MMS-Language": "de",
                    "X-MMS-Country": "DE",
                    "X-MMS-Salesline": storeName
                },
                "referrer": "https://" + location.host + "/de/myaccount/wishlist",
                "method": "GET",
                "mode": "cors"
            });
        }

        async function addToCart(productId) {
            return fetch("https://" + location.host + "/api/v1/graphql", { "headers": { "apollographql-client-name": "pwa-client", "apollographql-client-version": graphQlVersion, "content-type": "application/json", }, "body": "{\"operationName\":\"AddProduct\",\"variables\":{\"items\":[{\"productId\":\"" + productId + "\",\"outletId\":null,\"quantity\":1,\"serviceId\":null,\"warrantyId\":null}]},\"extensions\":{\"pwa\":{\"salesLine\":\"" + (location.host === 'www.saturn.de' ? 'Saturn' : 'Media') + "\",\"country\":\"" + "DE" + "\",\"language\":\"de\"},\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"404e7401c3363865cc3d92d5c5454ef7d382128c014c75f5fc39ed7ce549e2b9\"}}}", "method": "POST", "mode": "cors", "credentials": "include" });
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
    })(), productId);
    if (response != "timeExpired") {
        page.goto(cartUrl);
        return true;
    }
    return false;
}

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
        clickAwayCookies(page, logger);

        //Handle Login
        page.waitForSelector('[data-test="myaccount-login-form"]', { timeout: 0 }).then(async () => {
            logger.info("Performing login!")
            await page.fill('[data-test="email"]', config.shops.ceconomy.email)
            await page.fill('[data-test="password"]', config.shops.ceconomy.password)
            await page.click('#mms-login-form__login-button')
            logger.info("Login completed!");
        }, () => { })

        const pageText = await page.textContent('#root');
        if (pageText.includes("Dieser Artikel ist aktuell nicht verfügbar.")) {
            logger.info("Item currently unavailable, adding to wishlist!");
            const wishlistBtn = await page.waitForSelector('#pdp-single-wishlist-button');
            const wishlistBtnText = await wishlistBtn.textContent();
            logger.info(wishlistBtnText);
            if (wishlistBtnText == "Zum Merkzettel hinzufügen") {
                await wishlistBtn.click();

                const notificationBox = await page.waitForSelector('[data-test="notification-box"]');
                const notification = await notificationBox.textContent();
                if (notification.includes("Erfolgreich auf meinen Merkzettel hinzugefügt!")) {
                    logger.info("Added to Wishlist successfully!")
                    success = await waitForProductToBecomeAvailable(page, productId);
                } else {
                    logger.info("Failed adding to wishlist");
                    success = false;
                }
            } else {
                logger.info("Already on our Wishlist!");
                success = await waitForProductToBecomeAvailable(page, productId);
            }
        } else if (pageText.includes("Lieferung ")) {
            logger.info("Adding to cart!")
            await page.click('#pdp-add-to-cart-button');
            await page.waitForSelector('[data-test="pdp-minibasket-headline-success"]');
            logger.info("Added to cart successfully, going to cart now!");
            const cartUrl = await page.evaluate(() => "https://" + location.host + "/checkout");
            page.goto(cartUrl);
        }

        if (success) {
            var cartReloads = 0;
            while (cartReloads < 5) {
                logger.info("Reached cart")

                //Wait for Cart to load
                const request = await page.waitForRequest(request => request.url().includes("/api/v1/graphql?operationName=GetBasket"));
                const response = await request.response();
                const json = await response.json();
                const products = json.data.basket.content.checkout.mms.lineItems;
                if (products.length == 0) {
                    logger.info("Cart is empty!!!");
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
                logger.info("Reached payment gateway, entering Credit Card Details!")
                //Filling in Credit Card Details
                await page.fill('#MMSKKNr', config.payment_gateways.lbb_visa.number);
                await page.fill('#MMSExpiry', config.payment_gateways.lbb_visa.expiry_month + "/" + config.payment_gateways.lbb_visa.expiry_year)
                await page.fill('#MMSCCCVC', config.payment_gateways.lbb_visa.cvc);
                await page.fill('#MMScreditCardHolder', config.payment_gateways.lbb_visa.card_holder);
                if (config.shops.ceconomy.checkout) {
                    await page.click('#submitButton');

                    await page.waitForNavigation();
                    logger.info("Reached Visa Checkout Page");

                    visaLbb.handle3DSecure(config, page, context, false);

                    logger.info("Checkout complete!");
                    await page.waitForNavigation({ timeout: 180000 });
                }
            }

            //Allow for the page to be recorded
            await page.waitForTimeout(10000);
        }
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