#!/bin/sh
curl --header "Content-Type: application/json"   --request POST   --data '{"shop":"nbb","deal": {"title": "RTX 3090", "href": "https://www.notebooksbilliger.de/sonderposten+vorfuehrware+gebrauchtware/gebrauchtware/nvidia+geforce+rtx+3090+founders+edition+b+ware+707398", "price": "1470"}}'   http://localhost:3000/trigger
