#!/bin/sh
curl --header "Content-Type: application/json"   --request POST   --data '{"shop":"nbb","deal":{"title":"GigaByte GeForce RTX 3060 Ti Gaming OC","href":"https://www.notebooksbilliger.de/msi+geforce+gt+710+2gd3h+lp","price":649}}'   http://localhost:3000/trigger
