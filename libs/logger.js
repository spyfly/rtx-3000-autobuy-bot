const { createLogger, format, transports } = require('winston');
const fs = require('fs/promises');

module.exports = {
    init: function (user, shop) {
        this.logFileName = 'logs/' + shop + '_' + user + '_' + new Date().toJSON().split(".")[0];
        this.logger = createLogger({
            format: format.combine(
                format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss',
                }),
                format.label({ label: user }),
                format.printf(({ label, message, timestamp }) => {
                    return `[${label}] ${timestamp}: ${message}`;
                })
            ),
            transports: [
                new transports.Console(),
                new transports.File({
                    filename: this.logFileName, format: format.combine(
                        format.timestamp({
                            format: 'YYYY-MM-DD HH:mm:ss',
                        }),
                        format.printf(({ message, timestamp }) => {
                            return `[${timestamp}] ${message}`;
                        })
                    )
                })]
        });
    },
    info: function (message) {
        return this.logger.info(message);
    },
    getLogFile: function () {
        return this.logFileName;
    }
}