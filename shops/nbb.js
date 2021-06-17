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

async function performLogin(page) {
  return await page.evaluate(async (email, password) => await (await fetch("https://m.notebooksbilliger.de/auth/login", {
    "credentials": "include",
    "headers": {
      "Content-Type": "application/json;charset=utf-8"
    },
    "body": "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}",
    "method": "POST",
    "mode": "cors"
  })).text(), "seb.heiden@gmail.com", "P3OFhLc0QA95VA9AGVygxLvp8EpDWoSa");
}

async function addProductToCart(page, productId) {
  return await page.evaluate(async (multipartId, productId) => {
    return await (await fetch("https://m.notebooksbilliger.de/cart/add/", {
      "credentials": "include",
      "headers": {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "multipart/form-data; boundary=---------------------------" + multipartId,
        "Pragma": "no-cache",
        "Cache-Control": "no-cache",
        "X-NewRelic-ID": "VQQHU19aCBACUlhUDwgHUFA="
      },
      "body": "-----------------------------" + multipartId + "\nContent-Disposition: form-data; name=\"id\"\n\n" + productId + "\n-----------------------------" + multipartId + "--\n",
      "method": "POST",
      "mode": "cors"
    })).json();
  }, "WebKitFormBoundary" + crypto.randomBytes(16).toString('hex'), productId);
}

async function removeProductFromCart(page, productId) {
  return await page.evaluate(async (productId) => {
    return await (await fetch("https://m.notebooksbilliger.de/cart/remove", {
      "credentials": "include",
      "headers": {
        "Content-Type": "application/json;charset=utf-8"
      },
      "referrer": "https://m.notebooksbilliger.de/warenkorb",
      "body": "{\"id\":" + productId + "}",
      "method": "POST",
      "mode": "cors"
    })).json();
  }, productId);
}

async function fetchCart(page) {
  return await page.evaluate(async () => {
    return await (await fetch("https://m.notebooksbilliger.de/cart", {
      "credentials": "include",
      "headers": {
        "Content-Type": "application/json;charset=utf-8"
      },
      "method": "GET",
      "mode": "cors"
    })).json();
  });
}

async function autoBuy(config, deal, warmUp = false) {
  const logger = new Logger(config.user, 'nbb');

  var success = true;
  var videoPath = null;
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

  try {
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
    videoPath = "/tmp/videos/rtx-3000-autobuy-bot/" + crypto.randomBytes(20).toString('hex') + ".mp4";
    console.log(videoPath)
    await recorder.start(videoPath);

    try {
      logger.info("Finished Setup!");

      //logger.info("Step 1.1: Generating add to cart Button");
      //await page.setContent(`<form method="post" action="` + deal.href + `/action/add_product"><button type="submit" id="add_to_cart">In den Warenkorb</button></form>`)

      //logger.info("Step 1.2: Adding Item to Cart");
      //await page.click('#add_to_cart', { noWaitAfter: true });
      await page.goto("https://m.notebooksbilliger.de/newsletter");
      await page.evaluate(() => {
        localStorage.setItem('uc_settings', 'Test');
      });

      if (warmUp) {
        console.log("Warming up!");
        await page.waitForTimeout(5000);
        const isLoggedIn = await page.evaluate(() => document.querySelectorAll('[href="/kundenkonto/login"] .logged').length == 1)
        console.log("IsLoggedIn: " + isLoggedIn)

        if (!isLoggedIn) {
          await performLogin(page);
          console.log("Performed Login!");
        }

        const cart = await fetchCart(page);
        console.log(cart.productsCount);
        if (cart.productsCount > 0) {
          console.log("Require Cart Cleanup!");
          for (const product of cart.products) {
            console.log("Removing Product: " + product.id);
            await removeProductFromCart(page, product.id);
          }
          console.log("Cart cleanup complete!");
        }
      } else {

        //await page.waitForTimeout(1000000)
        const productId = deal.href.match(/[0-9]{6}/g)[0];

        const cartResp = await addProductToCart(page, productId);
        console.log(cartResp)
        if (cartResp.isBuyable == false) {
          console.log("Failed to add product to cart! Trying again!");
          success = false
        } else {
          const isLoggedIn = await page.evaluate(() => document.querySelectorAll('[href="/kundenkonto/login"] .logged').length == 1)
          console.log("IsLoggedIn: " + isLoggedIn)

          if (!isLoggedIn)
            await performLogin(page);

          await page.goto("https://m.notebooksbilliger.de/kasse")

          //Selecting Payment Method
          console.log("Selecting Payment Method!");
          const paymentRadioBox = await page.waitForSelector('[value="creditcard"]', { visible: true });
          const paymentRadioLabel = (await paymentRadioBox.$x('..'))[0];
          await paymentRadioLabel.click();

          await page.waitForSelector('.button:not([disabled="disabled"])', { visible: true })
          await page.click('.button:not([disabled="disabled"])');

          //Selecting Shipping Method
          console.log("Selecting Shipping Method");
          const shippingRadioBox = await page.waitForSelector('[value="hermes"]', { visible: true });
          const shippingRadioLabel = (await shippingRadioBox.$x('..'))[0];
          await shippingRadioLabel.click();

          //await page.evaluate(() => document.querySelector('.button--orange').outerHTML = "");
          await page.waitForSelector('.button:not([disabled="disabled"])', { visible: true })
          await page.click('.button:not([disabled="disabled"])');

          await page.waitForSelector('.loader', { hidden: true });
          //Preparing to initiate Payment
          console.log("Initiating Payment!");
          //await page.evaluate(() => document.querySelector('.button--orange').outerHTML = "");
          await page.waitForSelector('.button:not([disabled="disabled"])', { visible: true })
          await page.click('.button:not([disabled="disabled"])');
          //await page.waitForNavigation();
          //console.log("Navigation occured!");

          await page.waitForSelector('.loader', { hidden: true });
          console.log("Arrived on CreditCard Details Page!")
          //await page.waitForTimeout(10000000);

          await page.waitForSelector('[name="cardHolder"]', { visible: true });
          const cc = config.payment_gateways.creditcard;
          await page.type('[name="cardHolder"]', cc.card_holder);
          await page.type('[name="formattedCardPan"]', cc.number);
          await page.type('[name="expirationMonth"]', cc.expiry_month);
          await page.type('[name="expirationYear"]', cc.expiry_year);
          await page.type('[name="cardcvc2"]', cc.cvc);

          await page.waitForSelector('.button:not([disabled="disabled"])', { visible: true })
          console.log("Ready to Pay!");

          if (config.shops.nbb.checkout) {
            await page.click('.button:not([disabled="disabled"])');
            await page.waitForNavigation();
            console.log("Reached 3DS Page! Giving User ton of time to checkout!");

            await page.waitForResponse((response) =>
              response.url().includes("notebooksbilliger.de"), { timeout: 1000 * 60 * 15 });
          }
        }
      }
    } catch (err) {
      logger.info(err.stack);
      success = false;
    }
    await recorder.stop();
    await context.close();
  } catch (err) {
    console.log("Failed launching second browser instance!");
  }
  return {
    success: success,
    videoPath: videoPath,
    logFilePath: logger.getLogFile()
  }
}

module.exports = autoBuy;