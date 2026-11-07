Daten der Online-Bestenliste und der Codes von Season Chaos.

leaderboard.json  schreibt der Server automatisch. Nicht von Hand aendern.

codes.json        Geschenk-Codes. Hier darfst du selbst Codes anlegen, aendern und loeschen
                  (auf GitHub die Datei oeffnen, Stift-Symbol, aendern, "Commit changes").
                  Der Server liest die Datei spaetestens nach 1 Minute neu.

Aufbau eines Codes (alles ausser dem Namen ist freiwillig, beliebig kombinierbar):

  "MEINCODE": {
    "candy": 5000,                     Suessigkeiten in die Bank (hoechstens 1.000.000)
    "skill": "luck", "levels": 1,      Skill-Stufen: jump, lives, time, magnet oder luck (1 bis 5 Stufen)
    "items": ["hat:top", "face:shades"],   Kleidung, Liste der IDs (siehe unten)
    "lives": 3,                        Extra-Leben fuer den Spielstand (hoechstens 20)
    "until": "2026-12-31"              letzter Tag, an dem der Code geht (ohne = fuer immer)
  }

Code-Namen: nur Buchstaben und Zahlen, hoechstens 24 Zeichen. Gross/klein ist egal.
Zwischen zwei Codes muss ein Komma stehen, nach dem letzten nicht.
Jedes Geraet kann jeden Code nur einmal einloesen.

Kleidungs-IDs:
  hat:   cap bunny top horns witch pumpkin halo crown santa antlers flower pirate
  face:  rednose goggles glasses stache stars shades mask
  back:  basket shell scarf pack cape wings
  neck:  gold
  color: crimson violet forest pumpkin gold frost mint ocean
