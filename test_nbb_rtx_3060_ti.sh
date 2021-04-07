#!/bin/sh
curl --header "Content-Type: application/json"   --request POST   --data '{"shop":"nbb","deal":{"title":"GigaByte GeForce RTX 3060 Ti Gaming OC","href":"https://www.notebooksbilliger.de/pc+hardware/grafikkarten/nvidia/msi+geforce+rtx+3070+gaming+x+trio+8g+grafikkarte+685183","price":649}}'   http://localhost:3000/trigger
