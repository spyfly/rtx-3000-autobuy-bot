#!/bin/sh
curl --header "Content-Type: application/json"   --request POST   --data '{"shop":"nbb","deal":{"title":"RTX 3070 Founders","href":"https://www.notebooksbilliger.de/nvidia+geforce+rtx+3070+founders+edition+721621","price":519}}'   http://localhost:3000/trigger
