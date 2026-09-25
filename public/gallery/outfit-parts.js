'use strict';
window.GALLERY_OUTFITS=Object.freeze({
 initial(item,pieceId){
  if(!item.pieces)return null;
  return new Set(pieceId?item.pieces.filter(p=>p.id===pieceId).map(p=>p.partIndex):(item.defaultParts||item.pieces.map(p=>p.partIndex)));
 },
 toggle(item,parts,index,checked){
  const next=new Set(parts);
  if(!checked){next.delete(index);return next;}
  for(const group of item.exclusiveParts||[])if(group.includes(index))for(const other of group)next.delete(other);
  next.add(index);return next;
 },
 preset(item,id){return new Set(item.outfits?.find(o=>o.id===id)?.parts||item.defaultParts||item.pieces.map(p=>p.partIndex));}
});
