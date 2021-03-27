const { chromium } = require('playwright');
const fs = require('fs');
const amazonPay = require("../payment_gateways/amazon_pay.js")
const imposter = require('../libs/imposter.js');
const Logger = require("../libs/logger.js")

async function autoBuy(config, deal) {
  const logger = new Logger(config.user, 'nbb');

  var success = true;
  var browser_options = {
    recordVideo: {
      dir: '/tmp/videos/rtx-3000-autobuy-bot'
    },
    headless: !config.general.debug
  };

  const browserDetails = await imposter.getBrowserDetails(config.user);
  browser_options.userAgent = browserDetails.userAgent;
  browser_options.viewport = browserDetails.viewport;

  if (config.general.proxy) {
    browser_options.proxy = { server: config.general.proxy };
  }

  const context = await chromium.launchPersistentContext('/tmp/rtx-3000-autobuy-bot/' + config.user + "/", browser_options);
  const page = await context.newPage();
  const videoPath = await page.video().path();
  try {
    logger.info("Finished Setup!");

    logger.info("Step 1.1: Generating add to cart Button");
    await page.setContent(`<form method="post" action="` + deal.href + `/action/add_product"><button type="submit" id="add_to_cart">In den Warenkorb</button></form>`)

    logger.info("Step 1.2: Adding Item to Cart");
    await page.click('#add_to_cart', { noWaitAfter: true });

    const response = await page.waitForResponse(deal.href + '/action/add_product');
    if (response.status() == 302) {
      logger.info("Step 1.3: Product has been added to cart!");
      if (response.headers()['location'].includes('action/productpopup')) {
        logger.info("Step 2.1: Going to Checkout");
        await page.goto('https://www.notebooksbilliger.de/warenkorb')

        const basket = await page.content();
        if (basket.includes('Zur Zeit befinden sich keine Produkte im Warenkorb.')) {
          logger.info("Couldn't add product to basket!");
          success = false;
        } else {
          logger.info("Step 2.2: Clicking away cookies banner");
          try {
            await page.click('#uc-btn-accept-banner', { timeout: 500 })
          } catch {
            logger.info("Step 2.2: Failed clicking away cookies!");
          }

          logger.info("Step 3.1: Starting Amazon Pay")
          await page.click('.amazonpay-button-enabled');

          context.on('page', async (amazonPayPopup) => {
            await amazonPay(amazonPayPopup, config.payment_gateways.amazon, logger)
          });

          //Wait for Checkout Page to load
          await page.waitForNavigation({ timeout: 60000 });

          logger.info("Step 4.1: Starting Checkout Process")
          await page.click('#amazon-pay-to-checkout');

          if (page.url() != "https://www.notebooksbilliger.de/warenkorb") {
            //Filling in phone and confirming shipping
            logger.info("Step 4.2: Filling in Phone Number and confirming shipping")
            await page.fill('[name="newbilling[telephone]"]', config.shops.nbb.phone_number)
            await page.click('[for="conditions"]', {
              position: {
                x: 10, y: 10
              }
            });
            await page.click('#button_bottom');

            //Final Checkout
            logger.info("Step 4.3: Finalizing Checkout")
            if (config.shops.nbb.checkout) {
              logger.log("Step 4.4: Clicking Checkout Button");
              await page.click('checkout_submit');
              logger.info("Purchase completed!");
            }
          } else {
            logger.info("Error: Failed transmitting Amazon Pay Session Data!");
            success = false;
          }

          //Allow for the page to be recorded
          await page.waitForTimeout(1000);
        }
      } else {
        logger.info("Error: Redirected to unknown URL: " + response.headers()['location']);
        success = false;
      }
    } else {
      logger.info("Error: Unknown Response Status: " + response.status());
      success = false;
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