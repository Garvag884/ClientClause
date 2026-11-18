import fs from 'node:fs/promises';
import { FileBlob, PresentationFile } from '@oai/artifact-tool';
const input='/Users/garv/Desktop/ClientClause_Pitch_Deck.pptx';
const out='/Users/garv/ClientClause/.codex-pitch-build/user-deck';
await fs.mkdir(out,{recursive:true});
const p=await PresentationFile.importPptx(await FileBlob.load(input));
const info=await p.inspect({kind:'slide,textbox,shape,notes,image',maxChars:40000});
await fs.writeFile(`${out}/inspect.ndjson`,info.ndjson);
for(const [i,slide] of p.slides.items.entries()){
 const png=await p.export({slide,format:'png',scale:1});
 await fs.writeFile(`${out}/slide-${String(i+1).padStart(2,'0')}.png`,new Uint8Array(await png.arrayBuffer()));
}
const montage=await p.export({format:'webp',montage:true});
await fs.writeFile(`${out}/montage.webp`,new Uint8Array(await montage.arrayBuffer()));
console.log(JSON.stringify({slides:p.slides.items.length,inspect:info.ndjson.slice(0,25000),out},null,2));
