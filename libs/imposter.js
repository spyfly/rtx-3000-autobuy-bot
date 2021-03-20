const UserAgent = require('user-agents');

const level = require('level-party')
var db = level('./db', { valueEncoding: 'json' })

module.exports = {
    getBrowserDetails: async function (user) {
        var rawDetails;
        try {
            rawDetails = await db.get(user);
            //console.log("Found old details, parsing")
            return JSON.parse(rawDetails);
        } catch {
            return await this.generateNewDetails(user);
        }
    },

    generateNewDetails: async function (user) {
        console.log("Generating new Browser Details for " + user)
        const userAgent = new UserAgent({ deviceCategory: 'desktop' });
        details = {
            userAgent: userAgent.userAgent,
            viewport: {
                height: userAgent.viewportHeight,
                width: userAgent.viewportWidth
            }
        }
        db.put(user, JSON.stringify(details))
        return details;
    }
};