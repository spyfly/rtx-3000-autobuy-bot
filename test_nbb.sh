#!/bin/sh
curl --header "Content-Type: application/json"   --request POST   --data '{"shop":"nbb","deal": {"title": "RTX 3090 Ti", "href": "https://www.notebooksbilliger.de/sonderposten+vorfuehrware+gebrauchtware/gebrauchtware/gainward+nvidia+geforce+gt+730+b+ware+707092", "price": "56.9"}}'   http://localhost:3000/trigger