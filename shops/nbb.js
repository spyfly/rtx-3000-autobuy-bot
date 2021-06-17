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
const amazonPay = require("../payment_gateways/amazon_pay_pptr.js");

async function performLogin(page, email, password) {
  await page.type('#f_email_address', email)
  await page.type('#f_password', password);
  //await page.click('#set_rememberme');
  await Promise.all([
    page.click('[type="submit"]', { noWaitAfter: true }),
    page.waitForNavigation({ waitUntil: 'domcontentloaded' })
  ]);
}

async function removeProductFromCart(page, productId) {
  return await page.evaluate(async (productId) => {
    return await (await fetch("https://www.notebooksbilliger.de/warenkorb/delete/" + productId, {
      "credentials": "include",
      "headers": {
        "Upgrade-Insecure-Requests": "1"
      },
      "referrer": "https://www.notebooksbilliger.de/warenkorb",
      "method": "GET",
      "mode": "cors"
    })).text();
  }, productId);
}

async function fetchCart(page) {
  await page.goto("https://www.notebooksbilliger.de/warenkorb", { waitUntil: 'domcontentloaded' });
  const shoppingCartRefreshUrl = await page.evaluate(() => document.querySelector('form[name="shopping_cart_refresh"]').getAttribute("action"));
  console.log(shoppingCartRefreshUrl);

  return await page.evaluate(() => {
    var cartItems = [];
    for (const item of document.querySelectorAll('button.js-remove-from-cart')) {
      cartItems.push(item.getAttribute('data-pid'));
    }
    return cartItems;
  });
}

async function autoBuy(config, deal, warmUp = false) {
  const logger = new Logger(config.user, 'nbb');
  logger.info("Starting Browser!");

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

  var videoPath = null;

  try {
    const context = await puppeteer.launch({
      userDataDir: '/tmp/rtx-3000-autobuy-bot/' + config.user + "/",
      headless: false,
      args: [
        '--disable-setuid-sandbox',
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
      await page.setRequestInterception(true)

      page.on('request', (request) => {
        if (//request.resourceType() === 'image' ||
          request.url().includes("klarna") ||
          request.url().includes("amazon.com") ||
          request.url().includes("app.usercentrics.eu") ||
          request.url().includes("events.sd-nbb.de") ||
          request.url().includes("maps.googleapis.com") ||
          request.url().includes("js-agent.newrelic.com")) request.abort()
        else {
          //if (!request.url().includes("notebooksbilliger.de")) {
          //  console.log(request.url())
          //}
          request.continue()
        }
      })
      await page.setCacheEnabled(true);
      await page.setDefaultNavigationTimeout(120 * 1000); // 120 Seconds Timeout

      logger.info("Finished Setup!");

      //logger.info("Step 1.1: Generating add to cart Button");
      //await page.setContent(`<form method="post" action="` + deal.href + `/action/add_product"><button type="submit" id="add_to_cart">In den Warenkorb</button></form>`)

      //logger.info("Step 1.2: Adding Item to Cart");
      //await page.click('#add_to_cart', { noWaitAfter: true });
      //await page.goto("https://m.notebooksbilliger.de/newsletter");

      if (warmUp) {
        console.log("Warming up!");
        await page.goto('https://www.notebooksbilliger.de/pny+quadro+rtx+4000+8gb+gddr6+grafikkarte+416237');
        //Disable Cookies Popup
        //await page.evaluate(() => {
        //  localStorage.setItem('usercentrics', 'Test');
        //});

        const isLoggedIn = await page.evaluate(() => document.querySelectorAll('[data-wt="Kundenkonto"]').length == 1)
        console.log("IsLoggedIn: " + isLoggedIn)

        const cartCount = await page.evaluate(() => {
          if (document.querySelector('#cart-count') != null) {
            return parseInt(document.querySelector('#cart-count').innerHTML);;
          }
          return 0;
        })

        console.log("Cart Count: " + cartCount);

        if (cartCount == 0) {
          console.log("Adding item to cart!");
          await Promise.all([
            page.click('.js-pdp-head-add-to-cart'),
            page.waitForNavigation({ waitUntil: 'domcontentloaded' })
          ]);
        }

        if (!isLoggedIn) {
          await page.goto('https://www.notebooksbilliger.de/kasse/anmelden', { waitUntil: 'domcontentloaded' });
          await performLogin(page, config.shops.nbb.email, config.shops.nbb.password);
          console.log("Performed Login!");
        }

        const cart = await fetchCart(page);
        console.log(cart.length);
        if (cart.length > 0) {
          console.log("Require Cart Cleanup!");
          for (const cartItem of cart) {
            console.log("Removing Product: " + cartItem);
            await removeProductFromCart(page, cartItem);
          }
          console.log("Cart cleanup complete!");
        }
      } else {
        const productId = deal.href.match(/[0-9]{6}/g)[0];

        page.setContent(`<form method="post" 
        action="https://www.notebooksbilliger.de/warenkorb/action/shopping_cart_refresh/refcampaign_id/f69dffa4a1fb2f35f9efae6cf4504e0a">
        <button type="submit" id="add_to_cart">In den Warenkorb</button>
        <input type="hidden" name="buy"	value="Zur+Kasse"/>
        <input type="hidden" name="quantity[${productId}]" value="1"/>
        <input type="hidden" name="press_enter" value="0"/>
      </form>`)
        const [_, basketReq, loginReq, navigation] = [
          page.click('#add_to_cart', { noWaitAfter: true }),
          page.waitForResponse('https://www.notebooksbilliger.de/warenkorb/action/shopping_cart_refresh/refcampaign_id/f69dffa4a1fb2f35f9efae6cf4504e0a', { timeout: 120 * 1000 }),
          page.waitForResponse("https://www.notebooksbilliger.de/kasse/anmelden", { timeout: 120 * 1000 }),
          page.waitForNavigation({ waitUntil: 'domcontentloaded' })
        ];
        const basketRes = await basketReq;
        console.log("Basket loaded!");
        //const responseText = await response.text();

        if (basketRes.status() != 302) {
          console.log("Failed to add product to cart! Trying again!");
          success = false
        } else {
          const loginRes = await loginReq;
          const isLoggedIn = (await loginRes.status() == 302);
          console.log("IsLoggedIn: " + isLoggedIn)
          await navigation;
          //const cookies = await page.cookies();
          //console.log(cookies);

          //Disable Cookies Popup
          //await page.evaluate(() => {
          //   localStorage.setItem('usercentrics', 'Test');
          //});

          if (!isLoggedIn) {
            console.log("Performing login!");
            await performLogin(page, config.shops.nbb.email, config.shops.nbb.password);
          }

          const pageUrl = await page.url();

          if (pageUrl == "https://www.notebooksbilliger.de/kasse") {
            console.log("Selecting Credit Card Payment!");
            await page.click('[id="paycreditcard"]');

            console.log("Accepting TOS!");
            await page.evaluate(() => document.querySelector('[for="conditions"]').click());

            console.log("Proceeding!");
            await Promise.all([
              page.click('[type="submit"]'),
              page.waitForNavigation({ waitUntil: 'domcontentloaded' })
            ]);

            if (config.shops.nbb.checkout) {

              console.log("Checking out!");
              await Promise.all([
                page.click('#checkout_submit'),
                page.waitForNavigation({ waitUntil: 'domcontentloaded' })
              ]);
              console.log("Reached 3DS Page! Giving User ton of time to checkout!");

              await page.waitForResponse((response) =>
                response.url().includes("notebooksbilliger.de"), { timeout: 1000 * 60 * 15 });
            }
          } else {
            console.log("Failed to add product to cart! Trying again!");
            success = false;
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