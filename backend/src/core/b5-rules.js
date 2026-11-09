const crypto=require('node:crypto');
const mimeSignatures={'application/pdf':b=>b.subarray(0,5).toString('ascii')==='%PDF-', 'image/png':b=>b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'image/jpeg':b=>b[0]===255&&b[1]===216&&b[2]===255};
function validUpload(buffer,mime){return Buffer.isBuffer(buffer)&&buffer.length>0&&buffer.length<=10*1024*1024&&!!mimeSignatures[mime]?.(buffer)}
function safeFilename(name){return String(name||'file').replace(/[\\/\x00-\x1f]/g,'_').slice(0,150)||'file'}
function hash(buffer){return crypto.createHash('sha256').update(buffer).digest('hex')}
function currentMonth(date){return date.toISOString().slice(0,7)}
function reminderCategory(due,today){const a=Date.parse(due+'T00:00:00Z'),b=Date.parse(today+'T00:00:00Z');if(!Number.isFinite(a)||!Number.isFinite(b))return null;const days=Math.round((b-a)/86400000);return days===-3?'upcoming':days===0?'due':days===3?'overdue-3':days===15?'overdue-15':null}
function recipientPermission(actor,asset){if(actor.role==='owner'||actor.role==='manager')return !!actor.organizationId&&String(actor.organizationId)===String(asset.organizationId);return actor.role==='tenant'&&String(actor.tenantId||'')===String(asset.tenantId||'')&&String(actor.organizationId||'')===String(asset.organizationId||'')}
function contentDisposition(name,inline=false){const value=safeFilename(name),ascii=value.replace(/[^\x20-\x7e]/g,'_').replace(/["\\]/g,'_'),encoded=encodeURIComponent(value).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());return `${inline?'inline':'attachment'}; filename="${ascii}"; filename*=UTF-8''${encoded}`}
module.exports={contentDisposition,validUpload,safeFilename,hash,currentMonth,reminderCategory,recipientPermission};
