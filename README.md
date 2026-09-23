# Granotes

Granotes pixel-art generades procedimentalment que es mouen per una pantalla en blanc.
Obre `index.html` al navegador (no cal servidor).

## Controls

- **↻ Nova granota** (dalt a la dreta, o tecla `R`): reinicia amb una granota nova i diferent.
- **▦ Galeria** (tecla `G`): mostra 30 granotes aleatòries; clica'n una per adoptar-la.
- **Clic a la pantalla**: deixa anar una mosca.
- La llavor de la granota queda a l'URL (`#xxxxxxxx`): compartint l'enllaç es veu la mateixa granota.

## Com funciona

- `src/granota.js` — generador. Cada llavor de 32 bits produeix un genoma determinista.
  Primer tria un **arquetip** inspirat en la referència (arbre, dard, gripau, toro, pluja, banyuda,
  bassa) que fixa proporcions, paletes i preferències de peces; cada peça pot venir d'un altre
  arquetip (20%). La disposició és sempre coherent: ulls dins el cap, boca sota els ulls,
  panxa i braços per sota de la boca, braços per dins de les cuixes.
  - **Cos**: amplada, alçada, forma del cap i del ventre (superel·lipse amb eixamplament inferior).
  - **Ulls**: sortints, de gripau (amb parpella), blancs amb pupil·la, petits encastats o punts;
    iris de diversos colors i pupil·la rodona, horitzontal, vertical o plena; celles i banyes opcionals.
  - **Boca**: línia, somriure, trista, petita, oberta (granota toro) o sense; narius i galtes opcionals.
  - **Panxa**: oval, gran, papada, estriada o sense.
  - **Potes**: braços prims, grossos, amb ventoses o amagats; cuixes grosses, normals, primes o amagades;
    peus amb dits, ventoses o palmats.
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

`referencia/` conté les imatges originals que s'han fet servir com a referència.
