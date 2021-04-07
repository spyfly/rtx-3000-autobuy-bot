const messagesWeb = require('../modules/messages_web.js')

module.exports = {
    handle3DSecure: async function (config, page, context, iframe = true) {
        if (iframe) {
            page.waitForSelector('#iframeContainerFull').then(
                async (ccIframe) => {
                    const frame = await ccIframe.contentFrame();
                    console.log("Retrieved 3DS Frame!");
                    logic(frame);
                }
            );
        } else {
            logic(page);
        }

        async function logic(frame) {
            // Handle SMS-TAN
            frame.waitForSelector('#formOtp').then(async () => {
                console.log("VISA wants SMS-TAN, retrieving!");
                const response = await messagesWeb.waitForTan(config, context);
                if (response.success) {
                    await frame.fill('input[type="text"]', response.tan);
                    await frame.click('.btn-primary:visible');
                    console.log("Filled in SMS-TAN!");

                    // Handle VISA Online PIN
                    frame.waitForSelector('#formOtp').then(async () => {
                        console.log("VISA wants Online PIN!");
                        await frame.fill('input[type="password"]', config.payment_gateways.lbb_visa.online_pin);
                        await frame.click('.btn-primary:visible');
                        console.log("Filled in Online-PIN!");
                    });
                    //Online PIN Handling End
                } else {
                    console.log("Failed retrieving SMS-TAN!");
                }
            });
        }
    }
}