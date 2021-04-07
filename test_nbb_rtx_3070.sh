#!/bin/sh
curl --header "Content-Type: application/json"   --request POST   --data '{"shop":"nbb","deal":{"title":"GigaByte GeForce RTX 3070 Gaming OC","href":"https://www.notebooksbilliger.de/pc+hardware/grafikkarten/gigabyte+geforce+rtx+3070+gaming+oc+8gb+gddr6+grafikkarte+682726","price":649}}'   http://localhost:3000/trigger
