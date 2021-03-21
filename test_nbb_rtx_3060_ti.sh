#!/bin/sh
curl --header "Content-Type: application/json"   --request POST   --data '{"shop":"nbb","deal":{"title":"GigaByte GeForce RTX 3060 Ti Gaming OC","href":"https://www.notebooksbilliger.de/pc+hardware/grafikkarten/nvidia/geforce+rtx+3000+serie+nvidia/gigabyte+geforce+rtx+3060+gaming+oc+12gb+gddr6+grafikkarte+700421","price":649}}'   http://localhost:3000/trigger
