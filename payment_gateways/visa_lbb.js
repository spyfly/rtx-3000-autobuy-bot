const messagesWeb = require('../modules/messages_web.js')

module.exports = {
    handle3DSecure: async function (config, page, context) {
        page.waitForSelector('#iframeContainerFull').then(
            async (ccIframe) => {
                const frame = await ccIframe.contentFrame();
                console.log("Retrieved 3DS Frame!");
                // Handle SMS-TAN
                frame.waitForSelector('#formOtp').then(async () => {
                    console.log("VISA wants SMS-TAN, retrieving!");
                    const response = await messagesWeb.waitForTan(config, context);
                    if (response.success) {
                        await frame.fill('#challengeDataEntry', response.tan);
                        await frame.click("#confirm");
                        console.log("Filled in SMS-TAN!");

                        // Handle VISA Online PIN
                        frame.waitForSelector('#formOtp').then(async () => {
                            console.log("VISA wants Online PIN!");
                            await frame.fill('#challengeDataEntry', config.payment_gateways.lbb_visa.online_pin);
                            await frame.click("#confirm");
                            console.log("Filled in Online-PIN!");
                        });
                        //Online PIN Handling End
                    } else {
                        console.log("Failed retrieving SMS-TAN!");
                    }
                });
            }
        );
    }
}