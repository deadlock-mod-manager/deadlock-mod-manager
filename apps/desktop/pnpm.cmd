@echo off
:: Shim to forward pnpm calls to corepack pnpm in environments where pnpm isn't globally installed
corepack pnpm %*
