#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "PHP-koll behöver programmet Node.js för att fungera."
  echo "Webbsidan där du kan ladda ner det öppnas nu. Välj \"LTS\", installera,"
  echo "och dubbelklicka sedan på den här filen igen."
  echo
  open https://nodejs.org/
  read -n 1 -s -r -p "Tryck på valfri tangent för att stänga."
  exit 1
fi
(sleep 1 && open http://localhost:3000) &
node server.js
