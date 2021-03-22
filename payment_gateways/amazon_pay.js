const speakeasy = require("speakeasy");
const fs = require('fs/promises');

module.exports = async function (amazonPayPopup, config, logger) {
    //Amazon Pay start
    await amazonPayPopup.on('load', async () => {
        const url = await amazonPayPopup.url().split('?')[0];
        //logger.info(url)
        switch (url) {
            case "https://www.amazon.de/ap/signin":
                logger.info("Step 3.2: Filling in Amazon Pay Credentials")
                await amazonPayPopup.fill('#ap_email', config.email)
                await amazonPayPopup.fill('#ap_password', config.password)
                await amazonPayPopup.click('[name=rememberMe]');
                await amazonPayPopup.click('#signInSubmit');
                break;

            case "https://www.amazon.de/ap/mfa":
                logger.info("Step 3.3: Generating 2FA Code")
                var token = speakeasy.totp({
                    secret: config.totp_secret,
                    encoding: 'base32'
                });
                await amazonPayPopup.fill('#auth-mfa-otpcode', token);
                await amazonPayPopup.click('#auth-mfa-remember-device');

                logger.info("Step 3.4: Finalizing Amazon Pay Login")
                await amazonPayPopup.click('#auth-signin-button');
                break;

            case "https://payments.amazon.de/checkout/auth":
                logger.info("Step 3.5: Clicking proceed in Amazon Pay")
                try {
                    await amazonPayPopup.click(".a-button-input");
                } catch (err) {
                    if (!err.message.includes("closed"))
                        logger.info(err);
                }
                break;

            case "https://www.amazon.de/ap/mfa/new-otp":
                logger.info("Step 3.x: Confirming new OTP Device")
                await amazonPayPopup.click(".a-button-input");
                break;
            default:
                logger.info("DEBUG: Unknown Amazon Pay URL: " + url)
                await fs.writeFile('amazon_pay_debug.html', await amazonPayPopup.content());
                break;
        }
    });
    /*
        if (mfaUrl.startsWith("https://www.amazon.de/ap/mfa")) {
            logger.info("Step 3.5: Clicking proceed in Amazon Pay")
            await amazonPayPopup.click(".a-button-input")
        } else {
            logger.info("Step 3.x Using Cookies for Amazon Pay MFA Auth");
            await amazonPayPopup.screenshot({ path: 'debug_buy_amazon_pay_mfa_3x.png' });
        }
        */
}