const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const autoBuy = require('./auto_buy_nbb.js');
var id_mappings = {}

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
    });
    
    app.get('/run/:job_id', async (req, res) => {
        const job_id = req.params.job_id;
        if (id_mappings[job_id]) {
            const config_file = id_mappings[job_id];
            const message = "Starting Job " + job_id;
            console.log(message);

            const config = require('./configs/' + config_file);
            await autoBuy(config);

            res.send(JSON.stringify({
                message: message,
                success: true
            }))
        } else {
            res.send(JSON.stringify({
                success: false
            }))
        }
    });

    var port = 3000;
    app.listen(port, () => {
        console.log(`NBB.com AutoBuy Bot listening at http://localhost:${port}`)
    })
  });