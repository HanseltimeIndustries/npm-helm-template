#!/bin/bash -e

find ./dist/cjs/ -type f -name "*.js" -exec sh -c 'mv "$0" "${0%.js}.cjs"' {} \;