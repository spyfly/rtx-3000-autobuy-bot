const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const visaLbb = require("../payment_gateways/visa_lbb.js")
const imposter = require('../libs/imposter.js');
const Logger = require("../libs/logger.js")
const messagesWeb = require('../modules/messages_web.js')
const crypto = require("crypto");
const amazonPay = require("../payment_gateways/amazon_pay_pptr.js")

async function clickAwayCookies(page, logger, retry = 0) {
  if (retry < 3) {
    logger.info("Step 2.2: Clicking away cookies banner | Try: " + ++retry);
    page.click('#uc-btn-accept-banner', { timeout: 0 }).then(() => {
      logger.info("Step 2.2: Clicked away cookies!");
    }, () => {
      clickAwayCookies(page, logger, retry);
    });
  } else {
    logger.info("Step 2.2: Failed clicking away cookies!");
  }
}

async function autoBuy(config, deal) {
  const logger = new Logger(config.user, 'nbb');

  var success = true;
  var browser_options = {
    recordVideo: {
      dir: '/tmp/videos/rtx-3000-autobuy-bot'
    },
    headless: !config.general.debug,
  };

  const browserDetails = await imposter.getBrowserDetails(config.user);
  browser_options.userAgent = browserDetails.userAgent;
  browser_options.viewport = browserDetails.viewport;

  if (config.general.proxy) {
    browser_options.proxy = { server: config.general.proxy };
  }

  const context = await puppeteer.launch({
    userDataDir: '/tmp/rtx-3000-autobuy-bot/' + config.user + "/",
    headless: false,
    args: [
      '--no-sandbox',
      '--proxy-server=' + config.general.proxy,
      '--lang=de-DE'
    ],
  });
  const page = await context.newPage();
  const recorder = new PuppeteerScreenRecorder(page);
  const videoPath = "/tmp/videos/rtx-3000-autobuy-bot/" + crypto.randomBytes(20).toString('hex') + ".mp4";
  console.log(videoPath)
  await recorder.start(videoPath);

  try {
    logger.info("Finished Setup!");

    //logger.info("Step 1.1: Generating add to cart Button");
    //await page.setContent(`<form method="post" action="` + deal.href + `/action/add_product"><button type="submit" id="add_to_cart">In den Warenkorb</button></form>`)

    //logger.info("Step 1.2: Adding Item to Cart");
    //await page.click('#add_to_cart', { noWaitAfter: true });
    await page.goto("https://m.notebooksbilliger.de/kaufberater");
    await page.evaluate(() => {
      localStorage.setItem('uc_settings', 'Test');
    });

    //await page.waitForTimeout(1000000)
    const productId = deal.href.match(/[0-9]{6}/g)[0];
    const multipartId = crypto.randomBytes(20).toString('hex');
    const resp = await page.evaluate(async (self) => {
      return await (await fetch("https://m.notebooksbilliger.de/cart/add/", {
        "credentials": "include",
        "headers": {
          "Accept": "application/json, text/plain, */*",
          "Content-Type": "multipart/form-data; boundary=---------------------------" + self.multipartId,
          "Pragma": "no-cache",
          "Cache-Control": "no-cache"
        },
        "body": "-----------------------------" + self.multipartId + "\nContent-Disposition: form-data; name=\"id\"\n\n" + self.productId + "\n-----------------------------" + self.multipartId + "--\n",
        "method": "POST",
        "mode": "cors"
      })).text();
    }, { multipartId, productId });
    console.log(resp)
    await page.goto("https://m.notebooksbilliger.de/warenkorb");
    await page.click('#loginWithAmazon__summary');

    console.log("Starting Amazon Pay!");
    await amazonPay(page, config.payment_gateways.amazon, logger)

    await page.waitForResponse(async (response) => {
      return (await response.url()).includes("https://m.notebooksbilliger.de/checkout/amazonpay");
    });
    console.log("Amazon Pay Complete!");
    await page.waitForSelector('#amazonPayToCheckout', { visible: true });
    await page.click('#amazonPayToCheckout');
    console.log("Continuing Amazon Pay!")
    await page.waitForNavigation();
    console.log("Arrived on Checkout Page!");
    const radioBox = await page.waitForSelector('[value="hermes"]', { visible: true });
    const radioLabel = (await radioBox.$x('..'))[0];
    await radioLabel.click();

    await page.evaluate(() => document.querySelector('.button--orange').outerHTML = "");
    await page.waitForSelector('.button--orange', { visible: true })
    await page.click('.button--orange');
    console.log("Selected Shipment Method!");

    await page.evaluate(() => document.querySelector('.button--orange').outerHTML = "");
    await page.waitForSelector('.button--orange:not([disabled="disabled"])', { visible: true })
    console.log("Ready to Pay!");
    await page.click('.button--orange');
    console.log("Waiting for Navigation!");
    await page.waitForNavigation();

    await page.waitForTimeout(10000);
    /*
    const response = await page.waitForResponse(deal.href + '/action/add_product');
    if (response.status() == 302) {
      logger.info("Step 1.3: Product has been added to cart!");
      const productpopupLocation = response.headers()['location'];
      if (productpopupLocation.includes('action/productpopup')) {
        logger.info("Step 2.1: Going to Checkout");
        page.click('#cartlayer_link_checkout', { noWaitAfter: true })
        const response = await page.waitForResponse('https://www.notebooksbilliger.de/kasse/anmelden/cartlayer/1');
        const status = response.status();
        const location = response.headers()['location'];
        logger.info("Status: " + status + " | Location: " + location)

        if (status == 302 && location == 'https://www.notebooksbilliger.de/warenkorb') {
          logger.info("Error: Couldn't add product to basket!");
          await basket;
          success = false;
        } else {
          clickAwayCookies(page, logger);

          await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
          if (page.url().includes('https://www.notebooksbilliger.de/kasse/anmelden')) {
            logger.info("Step 2.3: Performing NBB Login")
            await page.fill('#f_email_address', config.shops.nbb.email)
            await page.fill('#f_password', config.shops.nbb.password)
            await page.click('[for="set_rememberme"]');
            await page.click('[name="login"]', { noWaitAfter: true });
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
            logger.info("Step 2.4: Login complete!");
          }

          await handleCheckout();

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
    */
  } catch (err) {
    logger.info(err.stack);
    success = false;
  }

  await recorder.stop();
  await context.close();
  return {
    success: success,
    videoPath: videoPath,
    logFilePath: logger.getLogFile()
  }

  async function handleCheckout(retry = 0) {
    if (retry == 3) {
      console.log("Done retrying!");
      return
    }
    logger.info("Step 3.1: Checking out via Credit Card")
    await page.click('#idpaycreditcard');
    await page.click('[for="conditions"]', {
      position: {
        x: 10, y: 10
      }
    });
    await page.click('#button_bottom');

    //Final Checkout
    if (page.url() == 'https://www.notebooksbilliger.de/kasse/zusammenfassung') {
      logger.info("Step 4.3: Finalizing Checkout")
      if (config.shops.nbb.checkout) {
        logger.info("Step 4.4: Clicking Checkout Button");
        await page.click('#checkout_submit', { timeout: 60000 });
        logger.info(page.url())
        if (page.url().includes('https://www.notebooksbilliger.de/checkout.php?ccerror=')) {
          logger.info("Failed to complete Credit Card Payment, trying again!")
          //Go Back to Step 3.1
          await handleCheckout(++retry);
        } else {
          logger.info("Purchase completed!");
        }
        await page.waitForNavigation()
        logger.info("Reached Credit Card Checkout Page!");
        visaLbb.handle3DSecure(config, page, context);

        await page.waitForNavigation({ url: /notebooksbilliger\.de/g, timeout: 180000 });
        logger.info("Reached NBB Success Page!");
        await page.waitForTimeout(5000);
      }
      success = true;
    } else {
      await handleCheckout(++retry);
    }
  }
}

module.exports = autoBuy;