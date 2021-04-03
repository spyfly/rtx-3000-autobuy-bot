const { chromium } = require('playwright');
const amazonPay = require("../payment_gateways/amazon_pay.js")
const Logger = require("../libs/logger.js")

async function autoBuy(config, deal) {
    const logger = new Logger(config.user, 'asus');

    var sucess = true;
    var browser_options = {
        recordVideo: {
            dir: '/tmp/videos/rtx-3000-autobuy-bot'
        },
        headless: !config.general.debug
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
        await page.goto(deal.href, { timeout: 120000 });

        logger.info("Step 1.1: Clicking away cookies banner");
        page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection', { timeout: 0 }).then(
            () => {
                logger.info("Clicked away cookies!");
            }, () => {
                logger.info("Failed clicking away cookies!");
            }
        )

        logger.info("Step 1.2: Adding Item to Cart");
        await page.click(".buybox--button", { timeout: 120000 });

        var amznPayBtnAppeared = 0;
        logger.info("Step 2: Waiting for Amazon Pay Button to appear")
        while (amznPayBtnAppeared < 10 && amznPayBtnAppeared != -1) {
            try {
                //Add Monster if we are already at checkout page
                //await page.click('#add-voucher--trigger', { timeout: 5000 });
                //await page.fill('.add-voucher--field', 'MONSTER', { timeout: 5000 });
                //await page.click('.add-voucher--button', { timeout: 5000 });
                //Add Monster end
                await page.waitForSelector(".amazonpay-button-inner-image", { timeout: 5000 });
                logger.info("Step 3.1: Clicking Amazon Pay Button")
                await page.evaluate(() => document.querySelector(".amazonpay-button-inner-image").click());
                amznPayBtnAppeared = -1;
            } catch {
                logger.info("Step 2.1: Amazon Pay Button did not appear, trying again! | Try: " + ++amznPayBtnAppeared)
                await page.goto("https://webshop.asus.com/de/checkout");
            }
        }

        //Handle Amazon Pay Checkout
        context.on('page', async (amazonPayPopup) => {
            await amazonPay(amazonPayPopup, config.payment_gateways.amazon, logger)
        });
        //Amazon Pay Finish

        //Wait for Checkout Page to load
        await page.waitForNavigation({ timeout: 120000 });
        logger.info("Step 4.1: Starting Checkout Process")

        //Confirming address
        logger.info("Step 4.2: Confirming Address")
        await page.click('.bestit-amazon-pay--widget-single--button-next:not(.is--disabled)', { timeout: 120000 });

        //Confirming payment method, but wait for button to become active first
        logger.info("Step 4.3: Confirming Payment Method")
        await page.click('.bestit-amazon-pay--widget-single--button-next:not(.is--disabled)', { timeout: 120000 });

        //Accept the damn AGBs
        logger.info("Step 4.4: Accepting AGBs")
        await page.click('#sAGB', { timeout: 120000 });

        //Final Checkout
        logger.info("Step 4.5: Finalizing Checkout")
        if (config.shops.asus.checkout) {
            logger.info("Step 4.6: Clicking Checkout Button");
            await page.click('.is--icon-right', { timeout: 120000 });
            await page.waitForNavigation({ timeout: 120000 });
            logger.info("Purchase completed!");
            await page.waitForTimeout(10000);
        }

        //Allow for the page to be recorded
        await page.waitForTimeout(1000);
    } catch (err) {
        logger.info(err.stack);
        sucess = false;
    }

    await context.close();
    return {
        success: sucess,
        videoPath: videoPath,
        logFilePath: logger.getLogFile()
    }
}
module.exports = autoBuy;