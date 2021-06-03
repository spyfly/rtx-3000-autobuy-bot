#!/bin/sh
curl --header "Content-Type: application/json"   --request POST   --data '{"shop":"nbb","deal":{"title":"GigaByte GeForce RTX 3060 Ti Gaming OC","href":"https://m.notebooksbilliger.de/pny+quadro+p4000+8gb+gddr5+grafikkarte+4x+displayport+323155","price":649}}'   http://localhost:3000/trigger
