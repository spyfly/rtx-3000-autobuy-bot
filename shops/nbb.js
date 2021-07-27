const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { PuppeteerScreenRecorder } = require('puppeteer-screen-recorder');
puppeteer.use(StealthPlugin());
const fs = require('fs');
const visaLbb = require("../payment_gateways/visa_lbb.js")
const imposter = require('../libs/imposter.js');
const wr_circumvention = require('../libs/nbb_wr_circumvention.js');
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

async function updateProductQuantity(page, productId, quantity) {
  return await page.evaluate(async (productId, quantity) => {
    return await (await fetch("https://www.notebooksbilliger.de/warenkorb/action/shopping_cart_refresh/refcampaign_id/f69dffa4a1fb2f35f9efae6cf4504e0a", {
      "credentials": "include",
      "headers": {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      "referrer": "https://www.notebooksbilliger.de/warenkorb/action/shopping_cart_refresh/refcampaign_id/f69dffa4a1fb2f35f9efae6cf4504e0a",
      "body": "quantity%5B" + productId + "%5D=" + quantity + "&press_enter=0",
      "method": "POST",
      "mode": "cors"
    })).text();
  }, productId, quantity);
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
        await page.goto('https://www.notebooksbilliger.de/pc+hardware/grafikkarten/nvidia');
        await wr_circumvention(page);
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
            page.click('.js-add-to-cart'),
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
        await page.goto(deal.href);
        await wr_circumvention(page);

        //Figure out CategoryID
        const categoryId = await page.evaluate(() => {
          var categoryId = 0;

          const categoryIdElements = document.querySelectorAll('[name="categories_id"]');
          if (categoryIdElements.length > 0) {
            for (const categoryIdElement of categoryIdElements) {
              if (categoryIdElement.value) {
                categoryId = categoryIdElement.value;
              }
            }
          }
          return categoryId;
        });

        // Vanilla ATC Attempt
        await page.setContent(`<form method="post" 
          action="${deal.href}/action/add_product">
          <button type="submit" id="add_to_cart">In den Warenkorb</button>
          <input type="hidden" name="products_id" value="${productId}">
          <input type="hidden" name="categories_id" value="${categoryId}">
        </form>`)

        await page.click('#add_to_cart', { noWaitAfter: true });
        var atcReq = await page.waitForResponse(response => response.url().includes("/action/add_product"));
        // ATC Response Received!

        if (atcReq.status() == 403) {
          console.log("ATC blocked by Bot Protection, trying alternative ATC!");
          await page.waitForNavigation();
          await page.goto(deal.href);

          page.setContent(`<form method="post" 
          action="https://www.notebooksbilliger.de/Produkte/Grafikkarten/action/add_product">
          <button type="submit" id="add_to_cart">In den Warenkorb</button>
          <input type="hidden" name="products_id" value="${productId}">
          <input type="hidden" name="categories_id" value="${categoryId}">
          </form>`)
          await page.click('#add_to_cart', { noWaitAfter: true });
          atcReq = await page.waitForResponse(response => response.url().includes("/action/add_product"));
        }

        if (atcReq.status() == 302) {
          console.log("ATC went through!");
          const atcTarget = atcReq.headers().location;
          if (atcTarget.includes(productId)) {
            console.log("Includes ProductID, let's proceed");
            [_, loginReq, navigation] = [
              page.goto("https://www.notebooksbilliger.de/kasse/anmelden/cartlayer/1"),
              page.waitForResponse("https://www.notebooksbilliger.de/kasse/anmelden/cartlayer/1"),
              page.waitForNavigation()
            ];

            // Checkout Start
            const loginRes = await loginReq;
            const isLoggedIn = (await loginRes.status() == 302);
            console.log("IsLoggedIn: " + isLoggedIn)
            await navigation;

            // Circumvent WR
            await wr_circumvention(page);

            if (!isLoggedIn) {
              console.log("Performing login!");
              await performLogin(page, config.shops.nbb.email, config.shops.nbb.password);
            }

            const pageUrl = await page.url();

            if (pageUrl == "https://www.notebooksbilliger.de/kasse") {
              //Checking Cart Contents
              var cleanCart = false;
              for (var i = 0; i < 10 && !cleanCart; i++) {
                console.log("Checking cart contents!");
                var contentsModified = false
                const cartContent = await page.evaluate(() => cBasket.aProducts);
                for (const cartItem of cartContent) {
                  if (cartItem.id != productId) {
                    console.log("Incorrect Item in Cart: " + cartItem.productName);
                    await removeProductFromCart(page, cartItem.id);
                    contentsModified = true;
                  } else if (cartItem.quantity != 1) {
                    console.log("Quantity larger than 1 detected!");
                    await updateProductQuantity(page, productId, 1);
                    contentsModified = true;
                  }
                }

                if (contentsModified) {
                  //Contents modified, require reload!
                  await page.reload();
                } else {
                  //No reload needed, we are
                  cleanCart = true;
                }
              }
              // Cart Content Validation complete

              if (cleanCart) {
                console.log("Selecting Credit Card Payment!");
                await page.click('[id="paycreditcard"]');

                console.log("Accepting TOS!");
                await page.evaluate(() => document.querySelector('[for="conditions"]').click());

                console.log("Proceeding!");
                await Promise.all([
                  page.click('[type="submit"]'),
                  page.waitForNavigation({ waitUntil: 'domcontentloaded' })
                ]);

                // Handle Checkout
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

                // Checkout Logic End
              } else {
                console.log("Failed cleaning cart!")
                success = false;
              }
            } else if (pageUrl == "https://www.notebooksbilliger.de/warenkorb") {
              console.log("Couldn't checkout!");
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
              success = false;
            } else {
              console.log("Failed to add product to cart! Trying again!");
              success = false;
            }
          } else {
            console.log("Does not include productID!")
            success = false;
          }
        } else {
          await page.waitForTimeout(100000);
          console.log("Failed to add product to cart!");
          success = false;
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