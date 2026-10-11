ASHGRAVE – MILJÖGRAFIK

I detta mappaket finns ett nytt målat miljöset och en spelkopia där golv, väggar och trappor använder PNG-grafiken.

- index.html – spelkopia med de nya golv-, vägg- och trappbilderna samt tidigare figursprites.
- environment-preview.html – förhandsvisning av miljöatlaserna och alla separata filer.
- ashgrave-environment.js – HTML Canvas-laddare/ritare för miljöplattor, specialytor och prop-sprites.
- ashgrave-tiles.svg – SVG-spritekatalog med namngivna symboler som använder PNG-bilderna bredvid sig; den tidigare vektorversionen finns kvar som ashgrave-tiles-vector.svg.
- environment.json – rutor, pixelmått, atlaspositioner och ankare.
- floor-tiles.png – 4×2 atlas, 128×64 per transparent golvdiamant.
- wall-tiles.png – 4×3 atlas, 128×128 per väggsegment. Alla varianter delar identisk toppyta.
- environment-props.png – 4×2 atlas med åtta miljöföremål; separata prop-*.png ingår.
- stairs-down.png och stairs-sealed.png – trappor, 128×96.
- gate-sealed.png – port, 128×128.
- portal.png – portal, 128×192.
- Enskilda floor-*.png och wall-*.png är transparenta och redo att använda fristående.

ANVÄNDNING I CANVAS
Ladda ashgrave-environment.js från samma mapp. När AshgraveEnvironment.ready är klar:
- floor(ctx, namn, x, y, bredd, höjd) ritar exempelvis floor-stone.
- wall(ctx, namn, x, y, bredd, höjd) ritar exempelvis wall-moss-l.
- prop(ctx, namn, fotX, fotY, bredd, höjd) ritar exempelvis prop-brazier via namnet brazier.
- special(ctx, namn, ankareX, ankareY, bredd, höjd) ritar stairs-down, stairs-sealed, gate-sealed eller portal.
Atlaspositioner finns i environment.json under floor.frames, walls.frames och props.frames. Alla PNG-bakgrunder har alpha/transparens.

Spelets befintliga spelvärld genereras av JavaScript. Denna spelkopia växlar in de nya golv- och väggspritesen deterministiskt för varje kartkoordinat; trapporna väljs mellan öppna och förseglade utifrån bosslåset. Fristående prop-sprites finns också som enskilda filer och atlas för fortsatt placering i spelvärlden.
