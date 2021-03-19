const { chromium } = require('playwright');
const fs = require('fs');

async function autoBuy(config, deal) {
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
    console.log("Finished Setup!");

    try {
        console.log("Loading Ceconomy Page!")
        await page.goto(deal.href);

        //Allow for the page to be recorded
        await page.waitForTimeout(1000);
    } catch (err) {
        console.log(err);
        sucess = false;
    }

    await context.close();
    return {
        success: sucess,
        videoPath: videoPath
    }
}
module.exports = autoBuy;