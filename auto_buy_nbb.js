const playwright = require('playwright');
const fs = require('fs');
const speakeasy = require("speakeasy");

async function autoBuy(config) {
  const browser = await playwright['firefox'].launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  console.log("Finished Setup!");

  await page.goto(config.general.product_url + '/action/add_product');

  console.log("Step 1: Adding Item to Cart");

  if (config.general.debug) {
    await page.screenshot({ path: 'debug_buy.png' });
  }

  console.log("Step 2.1: Going to Checkout");
  await page.goto('https://www.notebooksbilliger.de/kasse/anmelden/cartlayer/1')

  if (config.general.debug) {
    await page.screenshot({ path: 'debug_buy_checkout.png' });
  }

  console.log("Step 2.2: Clicking away cookies banner");
  await page.click('#uc-btn-accept-banner')

  console.log("Step 3.1: Starting Amazon Pay")
  await page.click('#loginWithAmazon');

  const amazonPayPage = await context.waitForEvent('page');

  //Amazon Pay start
  console.log("Step 3.2: Filling in Amazon Pay Credentials")
  await amazonPayPage.fill('#ap_email', config.amazon.email)
  await amazonPayPage.fill('#ap_password', config.amazon.password)
  await amazonPayPage.click('#signInSubmit');

  console.log("Step 3.3: Generating 2FA Code")
  var token = speakeasy.totp({
    secret: config.amazon.totp_secret,
    encoding: 'base32'
  });

  if (config.general.debug) {
    await amazonPayPage.screenshot({ path: 'debug_buy_amazon_pay_pw.png' });
  }

  await amazonPayPage.fill('#auth-mfa-otpcode', token);

  console.log("Step 3.4: Finalizing Amazon Pay Login")
  await amazonPayPage.click('#auth-signin-button');

  //Wait for Checkout Page to load
  console.log("Step 4.1: Starting Checkout Process")
  await page.waitForNavigation();

  if (config.general.debug) {
    await page.screenshot({ path: 'debug_checkout_1.png' });
  }

  await page.click('#amazon-pay-to-checkout');

  //Filling in phone and confirming shipping
  console.log("Step 4.2: Filling in Phone Number and confirming shipping")
  await page.fill('[name="newbilling[telephone]"]', config.nbb.phone_number)
  await page.click('[for="conditions"]', {
    position: {
      x: 10, y: 10
    }
  });

  if (config.general.debug) {
    await page.screenshot({ path: 'debug_checkout_2.png' });
  }

  await page.click('#button_bottom');

  //Final Checkout
  console.log("Step 4.3: Finalizing Checkout")
  if (config.nbb.checkout) {
    await page.click('checkout_submit');
  }

  if (config.general.debug) {
    await page.screenshot({ path: 'debug_checkout_3.png' });
  }

  await browser.close();
}
module.exports = autoBuy;