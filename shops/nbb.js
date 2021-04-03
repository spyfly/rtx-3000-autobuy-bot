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
        const basket = page.goto('https://www.notebooksbilliger.de/kasse', { timeout: 0 });
        const response = await page.waitForResponse('https://www.notebooksbilliger.de/kasse');
        const status = response.status();
        const location = response.headers()['location'];
        logger.info("Status: " + status + " | Location: " + location)

        if (status == 302 && location == 'https://www.notebooksbilliger.de/warenkorb') {
          logger.info("Error: Couldn't add product to basket!");
          await basket;
          success = false;
        } else {
          logger.info("Step 2.2: Clicking away cookies banner");
          page.click('#uc-btn-accept-banner', { timeout: 0 }).then(() => {
            logger.info("Step 2.2: Clicked away cookies!");
          }, () => {
            logger.info("Step 2.2: Failed clicking away cookies!");
          });

          page.click('#idpayamazonpay');
          await page.fill('[name="newbilling[telephone]"]', config.shops.nbb.phone_number)
          await page.click('[for="conditions"]', {
            position: {
              x: 10, y: 10
            }
          });

          //page.waitForTimeout(100000);

          logger.info("Step 3.1: Starting Amazon Pay")
          //await page.click('.amazonpay-button-enabled');
          await page.click('#button_bottom', { noWaitAfter: true });

          context.on('page', async (amazonPayPopup) => {
            await amazonPay(amazonPayPopup, config.payment_gateways.amazon, logger)
          });

          //Wait for Checkout Page to load
          await page.waitForNavigation({ timeout: 60000 });

          logger.info("Step 4.1: Starting Checkout Process")
          //Amazon Pay Confirm Page
          if (page.url().includes('https://www.notebooksbilliger.de/kasse/amazonpay')) {
            await page.click('#amazon-pay-to-checkout');
          }

          if (page.url() == "https://www.notebooksbilliger.de/warenkorb") {
            logger.info("Error: Failed transmitting Amazon Pay Session Data!");
            success = false;
          }

          //Filling in phone and confirming shipping
          if (page.url() == 'https://www.notebooksbilliger.de/kasse') {
            logger.info("Step 4.2: Filling in Phone Number and confirming shipping")
            await page.fill('[name="newbilling[telephone]"]', config.shops.nbb.phone_number)
            await page.click('[for="conditions"]', {
              position: {
                x: 10, y: 10
              }
            });
            await page.click('#button_bottom');
          }

          //Final Checkout
          if (page.url() == 'https://www.notebooksbilliger.de/kasse/zusammenfassung') {
            logger.info("Step 4.3: Finalizing Checkout")
            if (config.shops.nbb.checkout) {
              logger.info("Step 4.4: Clicking Checkout Button");
              await page.click('#checkout_submit');
              logger.info("Purchase completed!");
              await page.waitForNavigation()
              logger.info("Reached Amazon Pay Page!");
              await page.waitForNavigation({ url: /notebooksbilliger\.de/g, timeout: 60000 });
              logger.info("Reached NBB Success Page!");
              await page.waitForTimeout(5000);
            }
            success = true;
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