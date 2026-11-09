const DB='roomrent-payment-proofs-v1';
function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('proofs');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Payment screenshot storage is unavailable'))})}
export async function saveProof(id:string,file:File){
 if(file.size<=0||file.size>5_000_000||!['image/png','image/jpeg','application/pdf'].includes(file.type))throw Error('Upload a JPG, PNG or PDF up to 5 MB');
 const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('proofs','readwrite');tx.objectStore('proofs').put(file,id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error('Could not save screenshot. Please check available browser storage.'));tx.onabort=()=>reject(Error('Screenshot save was cancelled'))})}finally{db.close()}
}
export async function loadProof(id:string):Promise<Blob|undefined>{const db=await open();try{return await new Promise((resolve,reject)=>{const req=db.transaction('proofs','readonly').objectStore('proofs').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('Could not load payment screenshot'))})}finally{db.close()}}
export async function deleteProof(id:string){const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('proofs','readwrite');tx.objectStore('proofs').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(Error('Could not remove proof'))})}finally{db.close()}}
