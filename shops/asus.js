const { chromium } = require('playwright');
const fs = require('fs');
const amazonPay = require("../payment_gateways/amazon_pay.js")

async function autoBuy(config, deal) {
    const context = await chromium.launchPersistentContext('/tmp/rtx-3000-autobuy-bot/', { headless: true, recordVideo: { dir: './videos/' } });
    const page = await context.newPage();
    const videoPath = await page.video().path();
    console.log("Finished Setup!");

    await page.goto(deal.hrefs);

    console.log("Step 1.1: Clicking away cookies banner");
    try {
        await page.click('#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowallSelection', { timeout: 500 })
    } catch { }

    console.log("Step 1.2: Adding Item to Cart");
    await page.click(".buybox--button");

    var amznPayBtnAppeared = false;
    console.log("Step 2: Waiting for Amazon Pay Button to appear")
    while (!amznPayBtnAppeared) {
        try {
            await page.waitForSelector(".amazonpay-button-inner-image", { timeout: 3000 });
            console.log("Step 3.1: Clicking Amazon Pay Button")
            await page.evaluate(() => document.querySelector(".amazonpay-button-inner-image").click());
            amznPayBtnAppeared = true;
        } catch {
            console.log("Step 2.1: Amazon Pay Button did not appear, trying again!")
            await page.goto("https://webshop.asus.com/de/checkout");
        }
    }

    //Handle Amazon Pay Checkout
    context.on('page', async (amazonPayPopup) => {
        await amazonPay(amazonPayPopup, config.payment_gateways.amazon)
    });
    //Amazon Pay Finish

    //Wait for Checkout Page to load
    await page.waitForNavigation();
    console.log("Step 4.1: Starting Checkout Process")

    //Confirming address
    console.log("Step 4.2: Confirming Address")
    await page.click('.bestit-amazon-pay--widget-single--button-next:not(.is--disabled)');

    //Confirming payment method, but wait for button to become active first
    console.log("Step 4.3: Confirming Payment Method")
    await page.click('.bestit-amazon-pay--widget-single--button-next:not(.is--disabled)');

    //Accept the damn AGBs
    console.log("Step 4.4: Accepting AGBs")
    await page.click('#sAGB');

    //Final Checkout
    console.log("Step 4.5: Finalizing Checkout")
    if (config.shops.asus.checkout) {
        await page.click('.is--icon-right');
    }

    await context.close();
}
module.exports = autoBuy;