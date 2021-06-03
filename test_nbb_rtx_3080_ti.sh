#!/bin/sh
curl --header "Content-Type: application/json"   --request POST   --data '{"shop":"nbb","deal":{"title":"GigaByte GeForce RTX 3060 Ti Gaming OC","href":"https://www.notebooksbilliger.de/nvidia+geforce+rtx+3080+ti+founders+edition+719852","price":649}}'   http://localhost:3000/trigger
