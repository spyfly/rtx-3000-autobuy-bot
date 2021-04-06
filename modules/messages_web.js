const { chromium } = require('playwright');
const Logger = require("../libs/logger.js")

module.exports = {
    authenticate: async function (config, telegramBot) {
        success = true;
        const qrCodePath = config.user + "_messages_web_qrcode.png";
        const logger = new Logger(config.user, 'messages_web_setup');

        var browser_options = {
            headless: !config.general.debug
        };

        if (config.general.userAgent) {
            browser_options.userAgent = config.general.userAgent;
        }

        if (config.general.proxy) {
            browser_options.proxy = { server: config.general.proxy };
        }

        const context = await chromium.launchPersistentContext('/tmp/rtx-3000-autobuy-bot/' + config.user + "/", browser_options);

        const page = await context.newPage();
        await page.goto("https://messages.google.com/web/");
        await page.waitForTimeout(1000);
        if (page.url() == "https://messages.google.com/web/authentication") {
            await page.click('#mat-slide-toggle-1');
            const image = await page.waitForSelector('img');
            await image.screenshot({ path: qrCodePath })
            await telegramBot.sendPhoto(config.telegram.chat_id, qrCodePath, { caption: 'Scan this QR Code with the Messages Web App!' });
            await page.waitForNavigation({ timeout: 120000 });
            await telegramBot.sendMessage(config.telegram.chat_id, 'Setup successful!');
        } else {
            await telegramBot.sendMessage(config.telegram.chat_id, "Already authenticated!");
        }

        await context.close();
    },
    waitForTan: async function (config) {
        success = true;
        var tan = null;
        const logger = new Logger(config.user, 'messages_web_setup');

        var browser_options = {
            headless: !config.general.debug
        };

        if (config.general.userAgent) {
            browser_options.userAgent = config.general.userAgent;
        }

        if (config.general.proxy) {
            browser_options.proxy = { server: config.general.proxy };
        }

        const context = await chromium.launchPersistentContext('/tmp/rtx-3000-autobuy-bot/' + config.user + "/", browser_options);

        const page = await context.newPage();
        await page.goto("https://messages.google.com/web/");
        await page.waitForTimeout(1000);
        if (page.url().includes("https://messages.google.com/web/conversations")) {
            const messageObj = await page.waitForSelector('[data-e2e-is-unread="true"]', { timeout: 120000 });
            const snippet = await messageObj.waitForSelector('mws-conversation-snippet');
            const message = await (await snippet.waitForSelector('span')).textContent();
            logger.info("Received Message: " + message);
            tan = message.match(/[0-9]{6}/g);
            logger.info("TAN: " + tan);

            //Archiving Message
            await page.hover('[data-e2e-is-unread="true"]');
            await page.click('[data-e2e-is-unread="true"] .menu-button');
            await page.click('[data-e2e-conversation-menu-archive=""]');
            //Archiving complete
        } else {
            success = false;
            logger.info("Messages Web is not authenticated!");
            //await telegramBot.sendMessage(config.telegram.chat_id, "Messages Web requires setup using /smssetup");
        }

        await context.close();
        return {
            success: success,
            tan: tan
        }
    }
}