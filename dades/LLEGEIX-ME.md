# Vots enregistrats

Aquí es guarden els fitxers de vots exportats des de la pàgina
("Què he après?" → "⬇ Exporta els vots"). Són l'historial permanent del teu gust.

Per consolidar-los al generador:

    node eines/entrena.js

Això regenera `src/model.js`, que la pàgina carrega sempre: la generació surt
afinada per a tothom i en qualsevol navegador. Els vots nous s'hi sumen a sobre.
