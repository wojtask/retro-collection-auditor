A tool to scan your EmulationStation SD card structure, analyze ROMs and media, and generate a comprehensive spreadsheet report.

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Mount your EmulationStation SD card with your video game collection.
3. Run the app:
   `node scan.js <path-to-roms> [path-to-es-de] > [report-csv]`
   
   **Combined Mode** (if gamelist.xml files are located togeter with ROMs):
   ```sh
   node scan.js "/Volumes/Odin3/ROMs" > my_collection.csv
   ```
   
   **Split Mode** (if gamelist.xml files are separated from ROMs):
   ```sh
   node scan.js "/Volumes/Odin3/ROMs" "/Volumes/Odin3/ES-DE" > my_collection.csv
   ```
5. Import the CSV file in the spreadsheet app (MS Excel, Google Sheets).
