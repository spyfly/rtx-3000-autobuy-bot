#!/bin/sh
curl --header "Content-Type: application/json"   --request POST   --data '{"shop":"ceconomy","deal": {"title": "RTX 3070", "href": "https://www.saturn.de/de/product/_apple-ipad-pro-11-2020-2648259.html", "price": "56.9"}}'   http://localhost:3000/trigger