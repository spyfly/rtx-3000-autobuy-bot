#!/bin/sh
curl --header "Content-Type: application/json"   --request POST   --data '{"shop":"nbb","deal":{"title":"RTX 3070 Ti Founders","href":"","price":619}}'   http://localhost:3000/trigger
