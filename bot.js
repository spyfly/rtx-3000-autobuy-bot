const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const autoBuy = require('./auto_buy_nbb.js');
var id_mappings = {}
var running_jobs = {};

fs.readdir('configs/', function (err, files) {
    if (err) {
        console.error("Could not list the directory.", err);
        process.exit(1);
    }

    files.forEach(function (file) {
        // Make one pass and make the file complete
        const raw = fs.readFileSync("configs/" + file, 'utf8');
        const data = JSON.parse(raw);
        const id = data.general.id;
        id_mappings[id] = file;
        running_jobs[id] = false;
    });

    app.get('/run/:job_id', async (req, res) => {
        const job_id = req.params.job_id;
        var success = false;
        var message;

        if (id_mappings[job_id]) {
            if (running_jobs[job_id]) {
                message = "job already running"
            } else {
                //Mark Job as running
                running_jobs[job_id] = true;

                const config_file = id_mappings[job_id];
                const log_message = "Starting Job " + job_id;
                console.log(log_message);

                const config = require('./configs/' + config_file);
                try {
                    await autoBuy(config);
                    success = true;
                    message = "Checkout successful"
                } catch {
                    success = false;
                    message = "Checkout failed"
                }

                //Mark job as completed
                running_jobs[job_id] = false;
            }
        } else {
            message = "job_id not found"
        }

        console.log(message);
        res.send(JSON.stringify({
            message: message,
            success: success
        }))
    });

    var port = 3000;
    app.listen(port, () => {
        console.log(`NBB.com AutoBuy Bot listening at http://localhost:${port}`)
    })
});