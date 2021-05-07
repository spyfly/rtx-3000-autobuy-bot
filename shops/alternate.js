const { chromium } = require('playwright');
const Logger = require("../libs/logger.js")

async function autoBuy(config, deal) {
    const logger = new Logger(config.user, 'alternate');

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

    const context = await chromium.launchPersistentContext('/tmp/rtx-3000-autobuy-bot/' + config.user + "/", browser_options);
    const page = await context.newPage();
    const videoPath = await page.video().path();
    logger.info("Finished Setup!");

    try {
        await page.goto(deal.href, { timeout: 120000 });
        await page.evaluate(() => TLECookieAcceptance.consent(false));

        await page.click('form a[title="In den Warenkorb"]', { timeout: 5000 });

        await page.waitForNavigation({ url: /addToCart\.xhtml/g });
        console.log("Step 1: Added to cart!");
        await page.waitForSelector('[title="Anmelden"]', {
            state: 'attached',
            timeout: 5000
        }).then(async () => {
            console.log("Step 2.1: Performing Login")
            await page.evaluate(() => document.querySelector('[title="Anmelden"]').click());
            await page.waitForNavigation({ url: 'https://www.alternate.de/login.xhtml' });
            console.log("Step 2.2: Reached Login Page");
            await page.fill('[id*="email"]', config.shops.alternate.email);
            await page.fill('[id*="pwd"]', config.shops.alternate.password);
            await page.click('#loginbutton');
            console.log("Step 2.3: Clicking Login Button");
            await page.waitForNavigation('https://www.alternate.de/cart.xhtml');
            console.log("Step 2.4: Login complete!");
        }, () => {
            console.log("Step 2: Already logged in!");
        })

        //Make SessionID Persistent
        const cookies = await context.cookies('https://www.alternate.de');
        for (var cookie of cookies) {
            if (cookie.name == 'JSESSIONID') {
                cookie.expires = 2147483647
            }
            await context.addCookies([
                cookie
            ]);
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