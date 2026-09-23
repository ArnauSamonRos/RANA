# Granotes

Granotes pixel-art generades procedimentalment que es mouen per una pantalla en blanc.
Obre `index.html` al navegador (no cal servidor).

## Controls

- **↻ Nova granota** (dalt a la dreta, o tecla `R`): reinicia amb una granota nova i diferent.
- **▦ Galeria** (tecla `G`): mostra 30 granotes aleatòries; clica'n una per adoptar-la.
- **Puntuació d'1 a 5** (😖 🙁 😐 🙂 😍 a baix al centre, o tecles `1`–`5`): un clic puntua i passa a la
  granota següent. El 3 també informa ("normal").
- **Parts** (Cos, Colors, Ulls, Boca, Panxa, Potes, Patró): cada una té 👍 i 👎 directes (opcionals).
  Marca només el que et crida l'atenció; la resta agafa la puntuació general. Amb un 3 només compten les parts.
- **⚔ Duel** (tecla `D`): dues granotes de costat; tria la que t'agrada més (`←` / `→` o clic),
  `↑` les dues, `↓` cap. És la manera més ràpida i fiable d'ensenyar-li el teu gust.
- **Galeria**: també s'hi pot votar 👍 / 👎.
- **"Què he après?"** (a dalt a l'esquerra, sota el nom): mostra quins trets t'agraden i quins no,
  i permet **exportar** / **importar** els vots en un fitxer.

## Enregistrar el gust de manera permanent

1. Vota granotes (a la pàgina o a la galeria). Els vots es guarden al navegador.
2. "Què he après?" → **⬇ Exporta els vots**: descarrega `vots-granotes-AAAA-MM-DD.json`.
3. Posa el fitxer a `dades/` (o passa-me'l) i executa `node eines/entrena.js`.
4. Això regenera `src/model.js`: el model base que carrega la pàgina. Des d'aleshores
   la generació ja surt afinada per a tothom, en qualsevol navegador, i els vots nous s'hi sumen.

Cada vot guarda els **trets** de la granota (no només el codi), així que continua sent vàlid
encara que el generador canviï.
- **Clic a la pantalla**: deixa anar una mosca.
- La llavor de la granota queda a l'URL (`#xxxxxxxx`): compartint l'enllaç es veu la mateixa granota.

## Com funciona

- `src/granota.js` — generador. Cada llavor de 32 bits produeix un genoma determinista.
  Primer tria un **arquetip** inspirat en la referència (arbre, dard, gripau, toro, pluja, banyuda,
  bassa, cintura) que fixa proporcions, paletes i preferències de peces; cada peça pot venir d'un altre
  arquetip (20%). La disposició és sempre coherent: ulls dins el cap, boca sota els ulls,
  panxa i braços per sota de la boca, braços per dins de les cuixes.
  - **Cos**: amplada, alçada, forma del cap i del ventre (superel·lipse amb eixamplament inferior).
  - **Ulls** (inspirats en la referència): sortints, als costats, sobre bonys, de gripau (parpella plana), tranquils (sòcol pàl·lid
    amb línia de parpella), amb vora de color (ranura fosca), ovalats (negres i brillants),
    endormiscats (parpella pesada), blancs amb pupil·la, contents (tancats en arc, amb o sense sòcol),
    petits encastats o de punt. Pupil·la rodona, horitzontal, vertical, plena, brillant, en anella o de punt;
    iris de diversos colors; parpella del color del cos, clara, rosada o de contrast; celles planes o
    enfadades (inclinades); banyes opcionals.
  - **Boca**: línia, somriure, trista, petita, de bigoti (diagonals cap avall), caiguda (ampla amb
    les puntes avall) o sense (mai oberta); galtes clares sota els ulls opcionals; narius i galtes opcionals.
  - **Panxa**: oval, gran, enorme (amb melic opcional), pitet (ampla a dalt i estreta a baix),
    papada, estriada o sense.
  - **Cos**: cintura estreta opcional (forma de rellotge de sorra).
  - **Potes**: braços prims, grossos, amb ventoses o amagats; cuixes grosses, normals, primes o amagades;
    peus amb dits, dits llargs, ventoses o palmats; braços llargs; mans i peus d'un
    color de contrast.
  - **Patrons** (0–2 combinats): taques, berrugues, pigues, ratlla dorsal, línies laterals, bandes,
    clapes, jaspiat, antifaç, bicolor, ornaments i pigues fosques.
  - **Colors**: 24 paletes extretes de `referencia/granotes.gif`, amb variació de to suau,
    panxes crema tenyides del color del cos i, de tant en tant, paletes noves anàlogues.
  - **Personalitat**: pes, capacitat de salt, mandra, ganes de raucar, curiositat i abast de la llengua.
- El renderitzador dibuixa cada pose a partir del genoma (repòs, respiració, parpelleig, mig adormida,
  gola inflada, ajupida, enlairament, vol, caiguda, boca oberta, empassar), amb contorn i ombrejat
  automàtics, i fa servir la mirada (pupil·les) cap a on va o cap a la mosca.
- `src/joc.js` — comportament: salts parabòlics amb ombra, sèries de salts, salts llargs, raucar,
  migdiades i caça de mosques amb la llengua. La durada, l'alçada i la llargada dels salts depenen
  del pes i les potes de cada granota.

- `src/aprenentatge.js` — el model de preferències (compartit per la pàgina i l'script): una
  **regressió logística** sobre els trets de cada granota i les **combinacions** entre els trets
  principals de parts diferents (p. ex. "ulls contents + boca somrient"). Aprèn de:
  - puntuacions 1–5 (la probabilitat que agradi ha de ser 0, 0.25, 0.5, 0.75 o 1),
  - parts marcades (cada part s'entrena només amb els seus trets),
  - duels (la guanyadora ha de puntuar més que la perdedora, model de Bradley-Terry).
- `src/gust.js` — reentrena el model amb tots els vots després de cada valoració, prova 80 llavors per
  granota nova i en tria una amb probabilitat proporcional a `exp(puntuació / 0.35)`; un 10% surten a
  l'atzar per continuar explorant. Els duels es trien perquè les dues granotes puntuïn semblant però
  siguin diferents (així cada tria ensenya més). Els vots es guarden al navegador (`localStorage`) i
  es poden exportar i consolidar a `src/model.js` amb `eines/entrena.js`.

`referencia/` conté les imatges originals que s'han fet servir com a referència.
