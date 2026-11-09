const r=require('express').Router(),multer=require('multer'),M=require('../../models');
const {auth,roles}=require('../../core/auth'),{asyncRoute,fail}=require('../../core/errors');
const rules=require('../../core/b5-rules'),storage=require('../../core/private-storage');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:10*1024*1024,files:1,fields:4}});
r.use(auth);
function org(req){if(!req.actor.organizationId)fail(403,'Active organization required');return req.actor.organizationId}
r.post('/documents/:tenantId',upload.single('file'),asyncRoute(async(req,res)=>{
 const tenant=await M.Tenant.findOne({_id:req.params.tenantId,organizationId:org(req)});if(!tenant)fail(404,'Tenant not found');
 if(req.actor.role==='tenant'&&String(req.actor.tenantId)!==String(tenant.id))fail(403,'Tenant access denied');
 if(!['tenant','owner','manager'].includes(req.actor.role))fail(403,'Forbidden');
 if(!req.file||!rules.validUpload(req.file.buffer,req.file.mimetype))fail(400,'Unsupported or invalid PDF, PNG or JPEG (max 10 MB)');
 const key=await storage.write(req.file.buffer);let asset;
 try{asset=await M.FileAsset.create({organizationId:org(req),ownerUserId:req.actor.id,tenantId:tenant.id,relatedType:'tenant',relatedId:String(tenant.id),kind:String(req.body.kind||'identity').slice(0,40),originalName:rules.safeFilename(req.file.originalname),mime:req.file.mimetype,size:req.file.size,sha256:rules.hash(req.file.buffer),storageKey:key,createdBy:req.actor.id});
 await M.Document.create({organizationId:org(req),tenantId:tenant.id,fileAssetId:asset.id,name:asset.originalName,kind:asset.kind,storageKey:key,status:'pending'});
 }catch(err){await storage.remove(key);throw err}
 res.status(201).json({data:{id:asset.id,name:asset.originalName,mime:asset.mime,size:asset.size}})
}));
r.get('/:id/download',asyncRoute(async(req,res)=>{
 const asset=await M.FileAsset.findById(req.params.id);if(!asset||!rules.recipientPermission(req.actor,asset))fail(404,'File not found');
 if(asset.kind==='meter-photo')await require('../meters/service').authorizedPhoto(req.actor,asset.relatedId,asset.id);const data=await storage.read(asset.storageKey);res.set('Cache-Control','no-store');res.set('X-Content-Type-Options','nosniff');res.set('Content-Type',asset.mime);res.set('Content-Disposition',rules.contentDisposition(asset.originalName));res.send(data)
}));
module.exports=r;
