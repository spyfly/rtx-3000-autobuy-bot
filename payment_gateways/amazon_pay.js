const speakeasy = require("speakeasy");

module.exports = async function (amazonPayPopup, config) {
    //Amazon Pay start
    console.log("Step 3.2: Filling in Amazon Pay Credentials")
    await amazonPayPopup.fill('#ap_email', config.email)
    await amazonPayPopup.fill('#ap_password', config.password)
    await amazonPayPopup.click('#signInSubmit');

    console.log("Step 3.3: Generating 2FA Code")
    var token = speakeasy.totp({
        secret: config.totp_secret,
        encoding: 'base32'
    });

    await amazonPayPopup.screenshot({ path: 'debug_buy_amazon_pay_pw.png' });

    await amazonPayPopup.fill('#auth-mfa-otpcode', token);

    console.log("Step 3.4: Finalizing Amazon Pay Login")
    await amazonPayPopup.click('#auth-signin-button');
    await amazonPayPopup.screenshot({ path: 'debug_buy_amazon_pay_totp.png' });

    console.log("Step 3.5: Clicking proceed in Amazon Pay")
    await amazonPayPopup.click(".a-button-input")
}