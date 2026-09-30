@echo off
rem Laptopdan erisim icin bir kez calistirilir (Sag tik > Yonetici olarak calistir).

net session >nul 2>&1
if errorlevel 1 (
  echo [HATA] Bu dosyayi YONETICI olarak calistirmalisin.
  echo Sag tik ^> "Yonetici olarak calistir".
  pause
  exit /b 1
)

netsh advfirewall firewall add rule name="Obsidian Vault Web (8124)" dir=in action=allow protocol=TCP localport=8124 profile=private,domain

echo.
echo Tamam. Firewall kurali eklendi.
echo Sunucu penceresinde yazan "Laptop (LAN)" adresini laptopdaki tarayiciya yaz.
echo.
pause
