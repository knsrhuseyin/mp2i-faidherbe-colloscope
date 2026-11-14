// Small dependency-free PNG renderer for custom palettes, using an HX1 bitmap mark.
// Preset icons use the richer vector artwork rendered to PNG at source preparation.
const GLYPHS = {
  H: ['10001','10001','10001','11111','10001','10001','10001'],
  X: ['10001','10001','01010','00100','01010','10001','10001'],
  1: ['00100','01100','00100','00100','00100','00100','01110'],
  6: ['01110','10000','10000','11110','10001','10001','01110'],
  7: ['11111','00001','00010','00100','01000','01000','01000'],
};
const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
function crc32(bytes) {
  let crc = -1;
  for (const b of bytes) { crc ^= b; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ -1) >>> 0;
}
function chunk(type, bytes) {
  const out = new Uint8Array(bytes.length + 12), view = new DataView(out.buffer);
  view.setUint32(0,bytes.length); out.set(new TextEncoder().encode(type),4); out.set(bytes,8);
  view.setUint32(bytes.length+8,crc32(out.subarray(4,bytes.length+8))); return out;
}
export async function customIconPng(theme, size) {
  if (![192,512].includes(size)) throw new Error('Unsupported icon size');
  const pixels = new Uint8Array(size*size*4), words = new Uint32Array(pixels.buffer), scale = size/256;
  const little = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  const packedColors = new Map();
  function rect(x,y,w,h,hex) {
    if (!packedColors.has(hex)) {
      const [r,g,b] = rgb(hex);
      packedColors.set(hex, little ? r | (g << 8) | (b << 16) | (255 << 24) : (r << 24) | (g << 16) | (b << 8) | 255);
    }
    const color = packedColors.get(hex), left = Math.max(0,Math.round(x*scale)), right = Math.min(size,Math.round((x+w)*scale));
    for(let py=Math.max(0,Math.round(y*scale));py<Math.min(size,Math.round((y+h)*scale));py++) words.fill(color,py*size+left,py*size+right);
  }
  function label(text,x,y,unit,hex) {
    [...text].forEach((letter,i)=>GLYPHS[letter].forEach((row,j)=>[...row].forEach((v,k)=>{if(v==='1')rect(x+(i*6+k)*unit,y+j*unit,unit,unit,hex);})))
  }
  const c=theme.colors;
  rect(0,0,256,256,c.paper); rect(26,48,204,138,c.line); rect(29,51,198,132,c.white);
  label('HX1',43,82,10,c.lime);
  rect(174,209,57,31,c.lime); label('67',184,216,2.4,c.accentInk);
  if(theme.decoration==='snow') {
    rect(186,17,3,23,c.ink);rect(176,27,23,3,c.ink);
    for(let i=0;i<5;i++){rect(180+i*3,21+i*3,2,2,c.ink);rect(192-i*3,21+i*3,2,2,c.ink);}
  } else if(theme.decoration==='pumpkins') {
    rect(177,21,24,17,c.lime);rect(185,17,5,6,c.ink);rect(181,26,4,4,c.paper);rect(193,26,4,4,c.paper);
  } else if(theme.decoration!=='none') {
    rect(183,18,6,22,c.lime);rect(175,26,22,6,c.lime);
  }
  const scan = new Uint8Array((size*4+1)*size);
  for(let y=0;y<size;y++)scan.set(pixels.subarray(y*size*4,(y+1)*size*4),y*(size*4+1)+1);
  const compressed=new Uint8Array(await new Response(new Blob([scan]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const header=new Uint8Array(13), view=new DataView(header.buffer);
  view.setUint32(0,size);view.setUint32(4,size);header[8]=8;header[9]=6;
  return new Blob([new Uint8Array([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',compressed),chunk('IEND',new Uint8Array())]);
}
