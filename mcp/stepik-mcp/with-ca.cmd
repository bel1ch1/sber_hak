@echo off
setlocal
cd /d "%~dp0"
if exist "certs\corp-ca.pem" set "NODE_EXTRA_CA_CERTS=%CD%\certs\corp-ca.pem"
node %*
